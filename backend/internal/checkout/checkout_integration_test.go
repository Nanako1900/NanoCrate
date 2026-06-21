//go:build integration

package checkout_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

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
	res, err := svc.Checkout(ctx, "user-1", cartID, "idem-1")
	if err != nil {
		t.Fatalf("checkout: %v", err)
	}
	if res.OrderID == "" || res.ClientSecret == "" {
		t.Fatalf("result = %+v", res)
	}
	assertInventory(t, inv, variantID, 8, 2)

	// 2. Idempotent replay returns the same order without reserving again.
	res2, err := svc.Checkout(ctx, "user-1", cartID, "idem-1")
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

	_, err := svc.Checkout(ctx, "user-2", cartID, "idem-oos")
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
}

func TestIntegration_Webhook_PaymentFailedReleasesStock(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 10)
	cartID := seedCart(t, pool, "user-3", variantID, 3)

	inv := inventory.NewService(pool, nil)
	provider := payment.NewFakeProvider("whsec_test")
	svc := checkout.NewService(pool, inv, provider, nil)

	res, err := svc.Checkout(ctx, "user-3", cartID, "idem-3")
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

	rA, err := svc.Checkout(ctx, "user-a", cartA, "shared-key")
	if err != nil {
		t.Fatalf("checkout A: %v", err)
	}
	rB, err := svc.Checkout(ctx, "user-b", cartB, "shared-key")
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

	_, err := svc.Checkout(ctx, "attacker", cartID, "k")
	if !errors.Is(err, checkout.ErrCartNotFound) {
		t.Errorf("err = %v, want ErrCartNotFound (IDOR blocked)", err)
	}
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
