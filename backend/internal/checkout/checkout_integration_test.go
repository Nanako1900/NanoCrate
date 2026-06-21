//go:build integration

package checkout_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	cartdb "github.com/Nanako1900/NanoCrate/backend/internal/cart/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/checkout"
	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	orderdb "github.com/Nanako1900/NanoCrate/backend/internal/order/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/payment"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

func seedCart(t *testing.T, pool *pgxpool.Pool, userID string, variantID uuid.UUID, qty int32) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	q := cartdb.New(pool)
	uid := userID
	c, err := q.CreateCart(ctx, cartdb.CreateCartParams{UserID: &uid, Currency: "USD"})
	if err != nil {
		t.Fatalf("create cart: %v", err)
	}
	if _, err := q.UpsertCartItem(ctx, cartdb.UpsertCartItemParams{CartID: c.ID, VariantID: variantID, Qty: qty}); err != nil {
		t.Fatalf("add cart item: %v", err)
	}
	return c.ID
}

func TestIntegration_Checkout_FullChainAndWebhookIdempotency(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 10)
	cartID := seedCart(t, pool, "user-1", variantID, 2)

	inv := inventory.NewService(pool, nil)
	provider := payment.NewFakeProvider("whsec_test")
	svc := checkout.NewService(pool, inv, provider, nil)

	// 1. Checkout reserves stock and creates a pending order.
	res, err := svc.Checkout(ctx, "user-1", cartID, nil, "idem-1")
	if err != nil {
		t.Fatalf("checkout: %v", err)
	}
	if res.OrderID == "" || res.ClientSecret == "" {
		t.Fatalf("result = %+v", res)
	}
	assertInventory(t, inv, variantID, 8, 2)

	// 2. Idempotent replay returns the same order without reserving again.
	res2, err := svc.Checkout(ctx, "user-1", cartID, nil, "idem-1")
	if err != nil {
		t.Fatalf("checkout replay: %v", err)
	}
	if res2.OrderID != res.OrderID {
		t.Errorf("replay order id = %s, want %s", res2.OrderID, res.OrderID)
	}
	assertInventory(t, inv, variantID, 8, 2)

	orderID := uuid.MustParse(res.OrderID)
	orderQ := orderdb.New(pool)

	// 3. Successful payment webhook: commit reservation, order -> paid, outbox written.
	payload := []byte(fmt.Sprintf(`{"id":"evt_1","type":"payment_succeeded","payment_intent":"pi_fake_%s"}`, res.OrderID))
	if err := svc.HandleWebhook(ctx, payload, provider.Sign(payload)); err != nil {
		t.Fatalf("webhook: %v", err)
	}
	o, _ := orderQ.GetOrder(ctx, orderID)
	if o.Status != "paid" || o.PaymentStatus != "succeeded" {
		t.Errorf("order = %s / %s, want paid / succeeded", o.Status, o.PaymentStatus)
	}
	assertInventory(t, inv, variantID, 8, 0) // committed: reserved released to sold
	assertOutboxCount(t, orderQ, orderID, 1)

	// 4. Duplicate webhook is a no-op (idempotent): still paid, still one outbox event.
	if err := svc.HandleWebhook(ctx, payload, provider.Sign(payload)); err != nil {
		t.Fatalf("duplicate webhook: %v", err)
	}
	o, _ = orderQ.GetOrder(ctx, orderID)
	if o.Status != "paid" {
		t.Errorf("order status after duplicate = %s, want paid", o.Status)
	}
	assertInventory(t, inv, variantID, 8, 0)
	assertOutboxCount(t, orderQ, orderID, 1)
}

func TestIntegration_Checkout_OutOfStockRollsBack(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 1)
	cartID := seedCart(t, pool, "user-2", variantID, 5)

	inv := inventory.NewService(pool, nil)
	svc := checkout.NewService(pool, inv, payment.NewFakeProvider("whsec_test"), nil)

	_, err := svc.Checkout(ctx, "user-2", cartID, nil, "idem-oos")
	var oos *checkout.OutOfStockError
	if !errors.As(err, &oos) {
		t.Fatalf("err = %v, want OutOfStockError", err)
	}
	if oos.SKU == "" {
		t.Errorf("OutOfStockError has no SKU")
	}
	// Whole order rolled back: inventory untouched, no order persisted.
	assertInventory(t, inv, variantID, 1, 0)
	if _, err := orderdb.New(pool).GetOrderByIdempotencyKey(ctx, orderdb.GetOrderByIdempotencyKeyParams{UserID: "user-2", IdempotencyKey: "idem-oos"}); err == nil {
		t.Errorf("an order was persisted despite out-of-stock rollback")
	}
	// The cart is left active (conversion only happens at the saga's commit point,
	// after reservation), so the user can retry checkout.
	if c, err := cartdb.New(pool).GetCart(ctx, cartID); err != nil || c.Status != "active" {
		t.Errorf("cart status after rollback = %q (err %v), want active", c.Status, err)
	}
}

func TestIntegration_Webhook_PaymentFailedReleasesStock(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 10)
	cartID := seedCart(t, pool, "user-3", variantID, 3)

	inv := inventory.NewService(pool, nil)
	provider := payment.NewFakeProvider("whsec_test")
	svc := checkout.NewService(pool, inv, provider, nil)

	res, err := svc.Checkout(ctx, "user-3", cartID, nil, "idem-3")
	if err != nil {
		t.Fatalf("checkout: %v", err)
	}
	assertInventory(t, inv, variantID, 7, 3)

	payload := []byte(fmt.Sprintf(`{"id":"evt_fail","type":"payment_failed","payment_intent":"pi_fake_%s"}`, res.OrderID))
	if err := svc.HandleWebhook(ctx, payload, provider.Sign(payload)); err != nil {
		t.Fatalf("webhook: %v", err)
	}
	o, _ := orderdb.New(pool).GetOrder(ctx, uuid.MustParse(res.OrderID))
	if o.Status != "failed" {
		t.Errorf("order status = %s, want failed", o.Status)
	}
	assertInventory(t, inv, variantID, 10, 0) // released back to available
}

func TestIntegration_Checkout_IdempotencyScopedPerUser(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 10)
	cartA := seedCart(t, pool, "user-a", variantID, 1)
	cartB := seedCart(t, pool, "user-b", variantID, 1)
	svc := checkout.NewService(pool, inventory.NewService(pool, nil), payment.NewFakeProvider("whsec_test"), nil)

	rA, err := svc.Checkout(ctx, "user-a", cartA, nil, "shared-key")
	if err != nil {
		t.Fatalf("checkout A: %v", err)
	}
	rB, err := svc.Checkout(ctx, "user-b", cartB, nil, "shared-key")
	if err != nil {
		t.Fatalf("checkout B: %v", err)
	}
	if rA.OrderID == rB.OrderID {
		t.Errorf("same idempotency key across users leaked the same order (%s)", rA.OrderID)
	}
}

func TestIntegration_Checkout_RejectsAnotherUsersCart(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 10)
	cartID := seedCart(t, pool, "owner", variantID, 1)
	svc := checkout.NewService(pool, inventory.NewService(pool, nil), payment.NewFakeProvider("whsec_test"), nil)

	_, err := svc.Checkout(ctx, "attacker", cartID, nil, "k")
	if !errors.Is(err, checkout.ErrCartNotFound) {
		t.Errorf("err = %v, want ErrCartNotFound (IDOR blocked)", err)
	}
}

// failingPaymentProvider commits the order but fails to create a payment intent,
// reproducing the B6 condition: an order stuck 'pending' with no PI.
type failingPaymentProvider struct{}

func (failingPaymentProvider) CreatePaymentIntent(context.Context, payment.CreateIntentInput) (payment.Intent, error) {
	return payment.Intent{}, errors.New("payment gateway unavailable")
}

func (failingPaymentProvider) VerifyWebhook([]byte, string) (payment.Event, error) {
	return payment.Event{}, payment.ErrInvalidSignature
}

// B6: if payment-intent creation fails after the order + reservation commit, the
// order is left 'pending' with no PI and stock held. Since no payment can ever
// arrive (no PI), the sweeper must cancel it and release the stock.
func TestIntegration_Checkout_SweepCancelsAbandonedPendingOrders(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 10)
	cartID := seedCart(t, pool, "user-stuck", variantID, 3)
	inv := inventory.NewService(pool, nil)
	svc := checkout.NewService(pool, inv, failingPaymentProvider{}, nil)

	if _, err := svc.Checkout(ctx, "user-stuck", cartID, nil, "stuck-k"); err == nil {
		t.Fatal("expected checkout to fail when payment intent creation fails")
	}
	assertInventory(t, inv, variantID, 7, 3) // committed order holds stock, but is stuck pending

	orderQ := orderdb.New(pool)
	orders, err := orderQ.ListOrdersByUser(ctx, orderdb.ListOrdersByUserParams{UserID: "user-stuck", Limit: 10, Offset: 0})
	if err != nil || len(orders) != 1 {
		t.Fatalf("orders = %v (err %v), want exactly 1 pending order", orders, err)
	}
	orderID := orders[0].ID

	// Age-gating: a cutoff in the PAST must not sweep a freshly-created order
	// (proves older_than is actually honored, not ignored — the order is too young).
	if got, err := svc.SweepAbandonedPendingOrders(ctx, time.Now().Add(-time.Hour), 100); err != nil || got != 0 {
		t.Fatalf("past-cutoff sweep = %d (err %v), want 0 (recent order is younger than the cutoff)", got, err)
	}
	if o, _ := orderQ.GetOrder(ctx, orderID); o.Status != "pending" {
		t.Fatalf("order status after past-cutoff sweep = %s, want pending (must not be swept)", o.Status)
	}

	// Sweep with a cutoff after the order's creation cancels it and frees stock.
	n, err := svc.SweepAbandonedPendingOrders(ctx, time.Now().Add(time.Hour), 100)
	if err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if n != 1 {
		t.Errorf("swept %d orders, want 1", n)
	}
	o, _ := orderQ.GetOrder(ctx, orderID)
	if o.Status != "cancelled" {
		t.Errorf("order status = %s, want cancelled", o.Status)
	}
	assertInventory(t, inv, variantID, 10, 0) // reservation released

	// Idempotent: a second sweep finds nothing.
	if n, _ := svc.SweepAbandonedPendingOrders(ctx, time.Now().Add(time.Hour), 100); n != 0 {
		t.Errorf("second sweep cancelled %d, want 0", n)
	}
}

func seedGuestCart(t *testing.T, pool *pgxpool.Pool, variantID uuid.UUID, qty int32) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	q := cartdb.New(pool)
	c, err := q.CreateCart(ctx, cartdb.CreateCartParams{Currency: "USD"}) // UserID nil => guest cart
	if err != nil {
		t.Fatalf("create guest cart: %v", err)
	}
	if _, err := q.UpsertCartItem(ctx, cartdb.UpsertCartItemParams{CartID: c.ID, VariantID: variantID, Qty: qty}); err != nil {
		t.Fatalf("add cart item: %v", err)
	}
	return c.ID
}

// B2: once a cart is converted by a checkout, re-checking it out with a DIFFERENT
// Idempotency-Key (which bypasses the per-key idempotency replay) must be rejected
// — otherwise it double-reserves stock and creates a duplicate order.
func TestIntegration_Checkout_ConvertedCartRejectedForDifferentKey(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 10)
	cartID := seedCart(t, pool, "user-dbl", variantID, 2)
	inv := inventory.NewService(pool, nil)
	svc := checkout.NewService(pool, inv, payment.NewFakeProvider("whsec_test"), nil)

	if _, err := svc.Checkout(ctx, "user-dbl", cartID, nil, "key-1"); err != nil {
		t.Fatalf("first checkout: %v", err)
	}
	assertInventory(t, inv, variantID, 8, 2)

	_, err := svc.Checkout(ctx, "user-dbl", cartID, nil, "key-2")
	if !errors.Is(err, checkout.ErrCartNotActive) {
		t.Fatalf("second checkout err = %v, want ErrCartNotActive", err)
	}
	assertInventory(t, inv, variantID, 8, 2) // unchanged: no double reservation

	orders, err := orderdb.New(pool).ListOrdersByUser(ctx, orderdb.ListOrdersByUserParams{UserID: "user-dbl", Limit: 10, Offset: 0})
	if err != nil {
		t.Fatalf("list orders: %v", err)
	}
	if len(orders) != 1 {
		t.Errorf("orders for user = %d, want 1 (no duplicate order)", len(orders))
	}
}

// B4: an authenticated user must not be able to check out an arbitrary guest
// (NULL-owner) cart by id. Only the cart's owner, or a guest who presents the
// cart's cookie, may check it out.
func TestIntegration_Checkout_RejectsGuestCartWithoutMatchingCookie(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 10)
	guestCart := seedGuestCart(t, pool, variantID, 1)
	inv := inventory.NewService(pool, nil)
	svc := checkout.NewService(pool, inv, payment.NewFakeProvider("whsec_test"), nil)

	// No cookie at all.
	if _, err := svc.Checkout(ctx, "attacker", guestCart, nil, "k1"); !errors.Is(err, checkout.ErrCartNotFound) {
		t.Fatalf("no-cookie err = %v, want ErrCartNotFound (guest IDOR blocked)", err)
	}
	// A non-matching cookie.
	other := uuid.New()
	if _, err := svc.Checkout(ctx, "attacker", guestCart, &other, "k2"); !errors.Is(err, checkout.ErrCartNotFound) {
		t.Fatalf("wrong-cookie err = %v, want ErrCartNotFound", err)
	}
	assertInventory(t, inv, variantID, 10, 0) // nothing reserved by the blocked attempts
}

// B4 (happy path): presenting the matching guest cookie authorizes checkout and
// claims the cart to the buyer.
func TestIntegration_Checkout_GuestCartWithMatchingCookieClaimsAndConverts(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 10)
	guestCart := seedGuestCart(t, pool, variantID, 2)
	inv := inventory.NewService(pool, nil)
	svc := checkout.NewService(pool, inv, payment.NewFakeProvider("whsec_test"), nil)

	res, err := svc.Checkout(ctx, "buyer", guestCart, &guestCart, "k")
	if err != nil {
		t.Fatalf("guest checkout with cookie: %v", err)
	}
	if res.OrderID == "" {
		t.Fatal("no order id returned")
	}
	assertInventory(t, inv, variantID, 8, 2)

	c, err := cartdb.New(pool).GetCart(ctx, guestCart)
	if err != nil {
		t.Fatalf("get cart: %v", err)
	}
	if c.UserID == nil || *c.UserID != "buyer" {
		t.Errorf("cart user_id = %v, want \"buyer\" (claimed at checkout)", c.UserID)
	}
	if c.Status != "converted" {
		t.Errorf("cart status = %q, want converted", c.Status)
	}
}

// B7: a single cart line must not exceed the per-line quantity cap at checkout
// (else one line can lock an entire SKU). The cap is configurable.
func TestIntegration_Checkout_PerLineQtyCapEnforced(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 100)
	cartID := seedCart(t, pool, "user-cap", variantID, 2)
	inv := inventory.NewService(pool, nil)
	svc := checkout.NewService(pool, inv, payment.NewFakeProvider("whsec_test"), nil, checkout.WithMaxLineQty(1))

	_, err := svc.Checkout(ctx, "user-cap", cartID, nil, "k")
	if !errors.Is(err, checkout.ErrLineQtyTooLarge) {
		t.Fatalf("err = %v, want ErrLineQtyTooLarge", err)
	}
	assertInventory(t, inv, variantID, 100, 0) // nothing reserved
}

// B2 (concurrency): many checkouts of the same active cart with DIFFERENT
// Idempotency-Keys race; exactly one must win and reserve stock once, the rest
// must be rejected with ErrCartNotActive and reserve nothing.
func TestIntegration_Checkout_ConcurrentDifferentKeysReserveOnce(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 100)
	cartID := seedCart(t, pool, "user-conc", variantID, 5)
	inv := inventory.NewService(pool, nil)
	svc := checkout.NewService(pool, inv, payment.NewFakeProvider("whsec_test"), nil)

	const n = 8
	results := make([]error, n)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, err := svc.Checkout(ctx, "user-conc", cartID, nil, fmt.Sprintf("key-%d", i))
			results[i] = err
		}(i)
	}
	close(start)
	wg.Wait()

	success := 0
	for _, err := range results {
		switch {
		case err == nil:
			success++
		case errors.Is(err, checkout.ErrCartNotActive):
			// expected loser
		default:
			t.Errorf("unexpected checkout error: %v", err)
		}
	}
	if success != 1 {
		t.Errorf("successful checkouts = %d, want exactly 1", success)
	}
	assertInventory(t, inv, variantID, 95, 5) // reserved exactly once
}

func assertInventory(t *testing.T, inv *inventory.Service, variantID uuid.UUID, wantAvail, wantReserved int32) {
	t.Helper()
	got, err := inv.GetInventory(context.Background(), variantID)
	if err != nil {
		t.Fatalf("get inventory: %v", err)
	}
	if got.Available != wantAvail || got.Reserved != wantReserved {
		t.Errorf("inventory = available %d / reserved %d, want %d / %d", got.Available, got.Reserved, wantAvail, wantReserved)
	}
}

func assertOutboxCount(t *testing.T, q *orderdb.Queries, orderID uuid.UUID, want int64) {
	t.Helper()
	n, err := q.CountOutbox(context.Background(), orderdb.CountOutboxParams{AggregateID: orderID, EventType: "OrderPlaced"})
	if err != nil {
		t.Fatalf("count outbox: %v", err)
	}
	if n != want {
		t.Errorf("outbox OrderPlaced count = %d, want %d", n, want)
	}
}
