package order

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	orderdb "github.com/Nanako1900/NanoCrate/backend/internal/order/db"
)

func TestToListDTOs_Shape(t *testing.T) {
	rows := []orderdb.ListOrdersByUserRow{
		{ID: uuid.New(), Status: "paid", TotalCents: 25800, Currency: "USD", ItemCount: 2, CreatedAt: time.Now()},
	}
	out := toListDTOs(rows)
	if len(out) != 1 || out[0].Status != "paid" || out[0].TotalCents != 25800 || out[0].ItemCount != 2 {
		t.Fatalf("list dto = %+v", out)
	}
	// Contract §9.4 keys must be present.
	b, _ := json.Marshal(out[0])
	for _, key := range []string{`"id"`, `"status"`, `"total_cents"`, `"currency"`, `"item_count"`, `"created_at"`} {
		if !containsJSON(b, key) {
			t.Errorf("missing %s in %s", key, b)
		}
	}
}

func TestToDetailDTO_Shape(t *testing.T) {
	o := orderdb.Order{
		ID: uuid.New(), Status: "paid", Currency: "USD",
		SubtotalCents: 25800, TotalCents: 25800,
		PaymentProvider: "stripe", PaymentStatus: "succeeded", CreatedAt: time.Now(),
	}
	items := []orderdb.OrderItem{
		{Sku: "NANO75-RED-PBTW", Name: "Nano75 · 75%", UnitPriceCents: 12900, Qty: 2, LineTotalCents: 25800},
	}
	dto := toDetailDTO(o, items)
	if dto.Payment.Provider != "stripe" || dto.Payment.Status != "succeeded" {
		t.Errorf("payment = %+v", dto.Payment)
	}
	if len(dto.Items) != 1 || dto.Items[0].SKU != "NANO75-RED-PBTW" || dto.Items[0].LineTotalCents != 25800 {
		t.Errorf("items = %+v", dto.Items)
	}
	b, _ := json.Marshal(dto)
	for _, key := range []string{`"payment"`, `"provider"`, `"subtotal_cents"`, `"total_cents"`, `"items"`, `"unit_price_cents"`} {
		if !containsJSON(b, key) {
			t.Errorf("missing %s in %s", key, b)
		}
	}
}

func containsJSON(b []byte, sub string) bool {
	s := string(b)
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
