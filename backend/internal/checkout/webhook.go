package checkout

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	invdb "github.com/Nanako1900/NanoCrate/backend/internal/inventory/db"
	orderdb "github.com/Nanako1900/NanoCrate/backend/internal/order/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/payment"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/observability"
)

// errOrderNotYetVisible means a settlement event referenced a payment intent that
// is not on any order yet — the webhook raced ahead of checkout storing the PI id.
// It is deliberately NOT recorded as processed, so the caller can return a 5xx and
// let the gateway retry once the order becomes visible.
var errOrderNotYetVisible = errors.New("order not visible for payment intent yet")

// HandleWebhook verifies the payment webhook signature and processes it exactly
// once (SPEC §7). On success the order is paid and reservations committed; on
// failure/cancel the reservations are released.
func (s *Service) HandleWebhook(ctx context.Context, payload []byte, signatureHeader string) error {
	event, err := s.provider.VerifyWebhook(payload, signatureHeader)
	if err != nil {
		return err
	}
	return s.process(ctx, event)
}

// isSettlementEvent reports whether an event actually changes order/stock state.
// Everything else (Stripe sends many unrelated event types to one endpoint) is
// acknowledged without touching the database.
func isSettlementEvent(t payment.EventType) bool {
	switch t {
	case payment.EventPaymentSucceeded, payment.EventPaymentFailed, payment.EventPaymentCanceled:
		return true
	default:
		return false
	}
}

func (s *Service) process(ctx context.Context, event payment.Event) error {
	// Events we never act on are acknowledged immediately (no DB work, no retries).
	if !isSettlementEvent(event.Type) {
		return nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin webhook tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	orderQ := orderdb.New(tx)
	invQ := invdb.New(tx)

	// Find the order FIRST. If the payment intent is not on any order yet, do NOT
	// record the event as processed — roll back and surface a retryable error so
	// the gateway re-delivers once checkout has stored the PI id. Recording it here
	// would dedup every retry into a no-op and the order would never settle (B1).
	pid := event.PaymentIntentID
	order, err := orderQ.GetOrderByPaymentIntent(ctx, &pid)
	if errors.Is(err, pgx.ErrNoRows) {
		return errOrderNotYetVisible
	}
	if err != nil {
		return fmt.Errorf("find order by payment intent: %w", err)
	}

	// Idempotency: now that the order exists, record the event. Duplicate
	// deliveries affect zero rows and commit as a no-op.
	inserted, err := orderQ.InsertProcessedEvent(ctx, event.ID)
	if err != nil {
		return fmt.Errorf("record processed event: %w", err)
	}
	if inserted == 0 {
		return tx.Commit(ctx)
	}

	if err := s.applyEvent(ctx, orderQ, invQ, order, event.Type); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) applyEvent(ctx context.Context, orderQ *orderdb.Queries, invQ *invdb.Queries, order orderdb.Order, eventType payment.EventType) error {
	switch eventType {
	case payment.EventPaymentSucceeded:
		return s.settlePaid(ctx, orderQ, invQ, order)
	case payment.EventPaymentFailed:
		return s.settleUnpaid(ctx, orderQ, invQ, order, "failed")
	case payment.EventPaymentCanceled:
		return s.settleUnpaid(ctx, orderQ, invQ, order, "cancelled")
	default:
		return nil
	}
}

func (s *Service) settlePaid(ctx context.Context, orderQ *orderdb.Queries, invQ *invdb.Queries, order orderdb.Order) error {
	if err := s.transitionReservations(ctx, invQ, order.ID, true); err != nil {
		return err
	}
	paid, err := orderQ.MarkOrderPaid(ctx, order.ID)
	if err != nil {
		return fmt.Errorf("mark order paid: %w", err)
	}
	if paid != 1 {
		return nil // already settled
	}
	payload, _ := json.Marshal(map[string]any{
		"order_id":    order.ID.String(),
		"total_cents": order.TotalCents,
		"currency":    order.Currency,
	})
	if err := orderQ.InsertOutbox(ctx, orderdb.InsertOutboxParams{
		AggregateType: "order",
		AggregateID:   order.ID,
		EventType:     "OrderPlaced",
		Payload:       payload,
		TraceParent:   observability.TraceParent(ctx),
	}); err != nil {
		return fmt.Errorf("write outbox: %w", err)
	}
	s.metrics.IncOrdersPaid()
	return nil
}

func (s *Service) settleUnpaid(ctx context.Context, orderQ *orderdb.Queries, invQ *invdb.Queries, order orderdb.Order, status string) error {
	if err := s.transitionReservations(ctx, invQ, order.ID, false); err != nil {
		return err
	}
	if _, err := orderQ.MarkOrderFailed(ctx, orderdb.MarkOrderFailedParams{ID: order.ID, Status: status}); err != nil {
		return fmt.Errorf("mark order %s: %w", status, err)
	}
	return nil
}

// transitionReservations commits (paid) or releases (unpaid) every held
// reservation of the order. Only 'held' rows are touched, so it cannot conflict
// with a sweeper that already expired one (first writer wins).
func (s *Service) transitionReservations(ctx context.Context, invQ *invdb.Queries, orderID uuid.UUID, commit bool) error {
	reservations, err := invQ.ListReservationsByOrder(ctx, pgUUID(orderID))
	if err != nil {
		return fmt.Errorf("list reservations: %w", err)
	}
	for _, r := range reservations {
		if r.Status != "held" {
			continue
		}
		var transErr error
		if commit {
			transErr = s.inv.CommitInTx(ctx, invQ, r.ID)
		} else {
			transErr = s.inv.ReleaseInTx(ctx, invQ, r.ID)
		}
		if transErr != nil && !errors.Is(transErr, inventory.ErrReservationNotHeld) {
			return transErr
		}
	}
	return nil
}
