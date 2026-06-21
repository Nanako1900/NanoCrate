package checkout

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	cartdb "github.com/Nanako1900/NanoCrate/backend/internal/cart/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	invdb "github.com/Nanako1900/NanoCrate/backend/internal/inventory/db"
	orderdb "github.com/Nanako1900/NanoCrate/backend/internal/order/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/payment"
)

const reservationTTL = 15 * time.Minute

var errDuplicateOrder = errors.New("duplicate order for idempotency key")

// Metrics receives checkout business signals (orders paid).
type Metrics interface {
	IncOrdersPaid()
}

type noopMetrics struct{}

func (noopMetrics) IncOrdersPaid() {}

// Service runs the checkout saga and settles Stripe webhooks.
type Service struct {
	pool     *pgxpool.Pool
	inv      *inventory.Service
	provider payment.Provider
	cartQ    *cartdb.Queries
	orderQ   *orderdb.Queries
	metrics  Metrics
}

// NewService wires the checkout service. A nil metrics is treated as no-op.
func NewService(pool *pgxpool.Pool, inv *inventory.Service, provider payment.Provider, metrics Metrics) *Service {
	if metrics == nil {
		metrics = noopMetrics{}
	}
	return &Service{
		pool:     pool,
		inv:      inv,
		provider: provider,
		cartQ:    cartdb.New(pool),
		orderQ:   orderdb.New(pool),
		metrics:  metrics,
	}
}

// Result is the checkout response (contract §9.3).
type Result struct {
	OrderID      string
	ClientSecret string
}

// Checkout reserves stock for every cart line and creates a pending order in one
// transaction, then creates a payment intent. Idempotent on the Idempotency-Key.
func (s *Service) Checkout(ctx context.Context, userID string, cartID uuid.UUID, idempotencyKey string) (Result, error) {
	idemParams := orderdb.GetOrderByIdempotencyKeyParams{UserID: userID, IdempotencyKey: idempotencyKey}
	if existing, err := s.orderQ.GetOrderByIdempotencyKey(ctx, idemParams); err == nil {
		return s.replay(ctx, existing)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Result{}, fmt.Errorf("idempotency lookup: %w", err)
	}

	cartRow, err := s.cartQ.GetCart(ctx, cartID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Result{}, ErrCartNotFound
		}
		return Result{}, fmt.Errorf("load cart: %w", err)
	}
	// A user may only check out their own cart or a guest cart (user_id NULL).
	if cartRow.UserID != nil && *cartRow.UserID != userID {
		return Result{}, ErrCartNotFound
	}
	lines, err := s.cartQ.ListCartItemsDetailed(ctx, cartID)
	if err != nil {
		return Result{}, fmt.Errorf("list cart items: %w", err)
	}
	if len(lines) == 0 {
		return Result{}, ErrEmptyCart
	}

	subtotal := int64(0)
	for _, l := range lines {
		subtotal += l.UnitPriceCents * int64(l.Qty)
	}
	currency := lines[0].Currency

	order, err := s.reserveAndCreateOrder(ctx, userID, cartID, idempotencyKey, currency, subtotal, lines)
	if errors.Is(err, errDuplicateOrder) {
		if existing, e := s.orderQ.GetOrderByIdempotencyKey(ctx, idemParams); e == nil {
			return s.replay(ctx, existing)
		}
	}
	if err != nil {
		return Result{}, err
	}
	return s.attachPaymentIntent(ctx, order, subtotal, currency, idempotencyKey)
}

// reserveAndCreateOrder runs the atomic transaction: create order, reserve each
// line (rollback the whole order if any line is out of stock), convert the cart.
func (s *Service) reserveAndCreateOrder(ctx context.Context, userID string, cartID uuid.UUID, key, currency string, subtotal int64, lines []cartdb.ListCartItemsDetailedRow) (orderdb.Order, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return orderdb.Order{}, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	orderQ := orderdb.New(tx)
	invQ := invdb.New(tx)
	cartQ := cartdb.New(tx)

	order, err := orderQ.CreateOrder(ctx, orderdb.CreateOrderParams{
		UserID:         userID,
		CartID:         pgUUID(cartID),
		Currency:       currency,
		SubtotalCents:  subtotal,
		TotalCents:     subtotal,
		IdempotencyKey: key,
	})
	if isUniqueViolation(err) {
		return orderdb.Order{}, errDuplicateOrder
	}
	if err != nil {
		return orderdb.Order{}, fmt.Errorf("create order: %w", err)
	}

	if err := s.reserveLines(ctx, invQ, orderQ, order.ID, lines); err != nil {
		return orderdb.Order{}, err
	}
	if err := cartQ.MarkCartConverted(ctx, cartID); err != nil {
		return orderdb.Order{}, fmt.Errorf("convert cart: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return orderdb.Order{}, fmt.Errorf("commit checkout: %w", err)
	}
	return order, nil
}

func (s *Service) reserveLines(ctx context.Context, invQ *invdb.Queries, orderQ *orderdb.Queries, orderID uuid.UUID, lines []cartdb.ListCartItemsDetailedRow) error {
	oid := orderID
	for _, l := range lines {
		_, err := s.inv.ReserveInTx(ctx, invQ, inventory.ReserveInput{
			VariantID: l.VariantID,
			Qty:       l.Qty,
			OrderID:   &oid,
			ExpiresAt: time.Now().Add(reservationTTL),
		})
		if errors.Is(err, inventory.ErrOutOfStock) {
			return &OutOfStockError{SKU: l.Sku}
		}
		if err != nil {
			return fmt.Errorf("reserve %s: %w", l.Sku, err)
		}
		if err := orderQ.CreateOrderItem(ctx, orderdb.CreateOrderItemParams{
			OrderID:        orderID,
			VariantID:      l.VariantID,
			Sku:            l.Sku,
			Name:           l.Name,
			UnitPriceCents: l.UnitPriceCents,
			Qty:            l.Qty,
			LineTotalCents: l.UnitPriceCents * int64(l.Qty),
		}); err != nil {
			return fmt.Errorf("create order item: %w", err)
		}
	}
	return nil
}

func (s *Service) attachPaymentIntent(ctx context.Context, order orderdb.Order, amount int64, currency, key string) (Result, error) {
	intent, err := s.provider.CreatePaymentIntent(ctx, payment.CreateIntentInput{
		AmountCents:    amount,
		Currency:       currency,
		OrderID:        order.ID.String(),
		IdempotencyKey: key,
	})
	if err != nil {
		return Result{}, fmt.Errorf("create payment intent: %w", err)
	}
	if err := s.orderQ.SetOrderPaymentIntent(ctx, orderdb.SetOrderPaymentIntentParams{
		ID:                    order.ID,
		StripePaymentIntentID: &intent.ID,
		ClientSecret:          &intent.ClientSecret,
	}); err != nil {
		return Result{}, fmt.Errorf("save payment intent: %w", err)
	}
	return Result{OrderID: order.ID.String(), ClientSecret: intent.ClientSecret}, nil
}

// replay returns an existing order's result for an idempotent retry, re-attaching
// a payment intent if a prior attempt created the order but failed before storing one.
func (s *Service) replay(ctx context.Context, existing orderdb.Order) (Result, error) {
	if existing.ClientSecret != nil && *existing.ClientSecret != "" {
		return resultFrom(existing), nil
	}
	return s.attachPaymentIntent(ctx, existing, existing.TotalCents, existing.Currency, existing.IdempotencyKey)
}

func resultFrom(o orderdb.Order) Result {
	return Result{OrderID: o.ID.String(), ClientSecret: strDeref(o.ClientSecret)}
}

func pgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}

func strDeref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
