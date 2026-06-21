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

	"github.com/Nanako1900/NanoCrate/backend/internal/cart"
	cartdb "github.com/Nanako1900/NanoCrate/backend/internal/cart/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	invdb "github.com/Nanako1900/NanoCrate/backend/internal/inventory/db"
	orderdb "github.com/Nanako1900/NanoCrate/backend/internal/order/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/payment"
)

const reservationTTL = 15 * time.Minute

var errDuplicateOrder = errors.New("duplicate order for idempotency key")

// errOrderNotCancelled means a sweep lost the race to settle/cancel an order that
// was no longer pending. The sweeper skips it.
var errOrderNotCancelled = errors.New("order no longer pending")

// Metrics receives checkout business signals (orders paid, checkout failures).
type Metrics interface {
	IncOrdersPaid()
	IncCheckoutFailure(reason string)
}

type noopMetrics struct{}

func (noopMetrics) IncOrdersPaid()            {}
func (noopMetrics) IncCheckoutFailure(string) {}

// Service runs the checkout saga and settles Stripe webhooks.
type Service struct {
	pool       *pgxpool.Pool
	inv        *inventory.Service
	provider   payment.Provider
	cartQ      *cartdb.Queries
	orderQ     *orderdb.Queries
	metrics    Metrics
	maxLineQty int32
}

// Option customizes the checkout service.
type Option func(*Service)

// WithMaxLineQty overrides the per-line quantity cap enforced at checkout (B7).
// Values <= 0 are ignored.
func WithMaxLineQty(n int32) Option {
	return func(s *Service) {
		if n > 0 {
			s.maxLineQty = n
		}
	}
}

// NewService wires the checkout service. A nil metrics is treated as no-op.
func NewService(pool *pgxpool.Pool, inv *inventory.Service, provider payment.Provider, metrics Metrics, opts ...Option) *Service {
	if metrics == nil {
		metrics = noopMetrics{}
	}
	s := &Service{
		pool:       pool,
		inv:        inv,
		provider:   provider,
		cartQ:      cartdb.New(pool),
		orderQ:     orderdb.New(pool),
		metrics:    metrics,
		maxLineQty: cart.MaxLineQty,
	}
	for _, o := range opts {
		o(s)
	}
	return s
}

// Result is the checkout response (contract §9.3).
type Result struct {
	OrderID      string
	ClientSecret string
}

// Checkout reserves stock for every cart line and creates a pending order in one
// transaction, then creates a payment intent. Idempotent on the Idempotency-Key.
//
// cookieCartID is the guest cart id carried in the caller's cart cookie (nil if
// none). It authorizes checking out an unowned (guest) cart: an authenticated
// user may check out their own cart, or a guest cart only if they present its
// cookie. This blocks the cross-session IDOR of checking out an arbitrary guest
// cart by id (B4).
func (s *Service) Checkout(ctx context.Context, userID string, cartID uuid.UUID, cookieCartID *uuid.UUID, idempotencyKey string) (Result, error) {
	res, err := s.runCheckout(ctx, userID, cartID, cookieCartID, idempotencyKey)
	if err != nil {
		s.metrics.IncCheckoutFailure(classifyCheckoutFailure(err))
	}
	return res, err
}

// classifyCheckoutFailure maps a checkout error to a metric reason label.
func classifyCheckoutFailure(err error) string {
	var oos *OutOfStockError
	switch {
	case errors.As(err, &oos):
		return "out_of_stock"
	case errors.Is(err, ErrCartNotActive):
		return "cart_not_active"
	case errors.Is(err, ErrCartNotFound):
		return "cart_not_found"
	case errors.Is(err, ErrEmptyCart), errors.Is(err, ErrLineQtyTooLarge):
		return "validation_failed"
	default:
		return "internal"
	}
}

func (s *Service) runCheckout(ctx context.Context, userID string, cartID uuid.UUID, cookieCartID *uuid.UUID, idempotencyKey string) (Result, error) {
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
	// Authorize: the cart must be the user's own, or a guest (NULL-owner) cart
	// whose cookie the caller presents. A NULL-owner cart is never accepted on id
	// alone (B4).
	owned := cartRow.UserID != nil && *cartRow.UserID == userID
	guestMatch := cartRow.UserID == nil && cookieCartID != nil && *cookieCartID == cartID
	if !owned && !guestMatch {
		return Result{}, ErrCartNotFound
	}
	// Only an active cart can be checked out. A converted/abandoned cart means a
	// prior checkout already consumed it; reusing it (e.g. with a different
	// Idempotency-Key) would double-reserve stock and create a duplicate order (B2).
	if cartRow.Status != "active" {
		return Result{}, ErrCartNotActive
	}
	lines, err := s.cartQ.ListCartItemsDetailed(ctx, cartID)
	if err != nil {
		return Result{}, fmt.Errorf("list cart items: %w", err)
	}
	if len(lines) == 0 {
		return Result{}, ErrEmptyCart
	}
	// Per-line quantity cap: a single line must not lock an entire SKU (B7).
	for _, l := range lines {
		if l.Qty > s.maxLineQty {
			return Result{}, ErrLineQtyTooLarge
		}
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
	// Atomic claim+convert is the saga's commit point. It asserts the cart is
	// still 'active' (and owned-or-guest), claims it to the user, and flips it to
	// 'converted' in one statement. RowsAffected==0 means a concurrent or prior
	// checkout already consumed the cart — roll back so this attempt cannot
	// double-reserve or create a duplicate order (B2/B4).
	rows, err := cartQ.ClaimAndConvertCart(ctx, cartdb.ClaimAndConvertCartParams{ID: cartID, UserID: userID})
	if err != nil {
		return orderdb.Order{}, fmt.Errorf("convert cart: %w", err)
	}
	if rows != 1 {
		return orderdb.Order{}, ErrCartNotActive
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

// SweepAbandonedPendingOrders cancels orders left 'pending' that never received a
// payment intent (e.g. intent creation failed after the order committed) and are
// older than olderThan, releasing any stock they still hold. Because such orders
// have no payment intent, no payment can ever succeed, so cancelling is safe (no
// late-payment race). This is the order side of the Phase-3 expiry sweeper (it
// pairs with inventory.ReleaseExpired); the logic and its test live here now.
// Returns the number of orders cancelled.
func (s *Service) SweepAbandonedPendingOrders(ctx context.Context, olderThan time.Time, limit int32) (int, error) {
	ids, err := s.orderQ.ListAbandonedPendingOrders(ctx, orderdb.ListAbandonedPendingOrdersParams{
		OlderThan: olderThan,
		MaxRows:   limit,
	})
	if err != nil {
		return 0, fmt.Errorf("list abandoned pending orders: %w", err)
	}
	cancelled := 0
	for _, id := range ids {
		switch err := s.cancelAbandoned(ctx, id); {
		case err == nil:
			cancelled++
		case errors.Is(err, errOrderNotCancelled):
			continue // raced with a concurrent settlement; leave it.
		default:
			return cancelled, err
		}
	}
	return cancelled, nil
}

// cancelAbandoned releases any reservations the order still holds and flips it
// from pending to cancelled, all in one transaction. MarkOrderFailed only touches
// pending rows, so a concurrent settlement (pending -> paid) wins the race.
func (s *Service) cancelAbandoned(ctx context.Context, orderID uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin sweep tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	orderQ := orderdb.New(tx)
	invQ := invdb.New(tx)

	if err := s.transitionReservations(ctx, invQ, orderID, false); err != nil {
		return err
	}
	rows, err := orderQ.MarkOrderFailed(ctx, orderdb.MarkOrderFailedParams{ID: orderID, Status: "cancelled"})
	if err != nil {
		return fmt.Errorf("cancel abandoned order: %w", err)
	}
	if rows != 1 {
		return errOrderNotCancelled
	}
	return tx.Commit(ctx)
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
