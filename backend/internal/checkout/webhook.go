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
)

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

func (s *Service) process(ctx context.Context, event payment.Event) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin webhook tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	orderQ := orderdb.New(tx)
	invQ := invdb.New(tx)

	// Idempotency: first writer processes; duplicates affect zero rows and skip.
	inserted, err := orderQ.InsertProcessedEvent(ctx, event.ID)
	if err != nil {
		return fmt.Errorf("record processed event: %w", err)
	}
	if inserted == 0 {
		return tx.Commit(ctx)
	}

	pid := event.PaymentIntentID
	order, err := orderQ.GetOrderByPaymentIntent(ctx, &pid)
	if errors.Is(err, pgx.ErrNoRows) {
		return tx.Commit(ctx) // unknown order; event recorded, ack anyway
	}
	if err != nil {
		return fmt.Errorf("find order by payment intent: %w", err)
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
