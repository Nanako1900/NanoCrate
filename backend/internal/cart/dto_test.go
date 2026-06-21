package cart

import (
	"testing"

	"github.com/google/uuid"

	cartdb "github.com/Nanako1900/NanoCrate/backend/internal/cart/db"
)

func TestBuildView_RollsUpTotals(t *testing.T) {
	cartID := uuid.New()
	rows := []cartdb.ListCartItemsDetailedRow{
		{ID: uuid.New(), VariantID: uuid.New(), Qty: 2, Sku: "SKU1", UnitPriceCents: 12900, Currency: "USD", Name: "A · B", Available: 12},
		{ID: uuid.New(), VariantID: uuid.New(), Qty: 1, Sku: "SKU2", UnitPriceCents: 9900, Currency: "USD", Name: "C · D", Available: 5},
	}
	v := buildView(cartID, "USD", rows)

	if v.ID != cartID.String() || v.Currency != "USD" {
		t.Errorf("view header = %+v", v)
	}
	if v.ItemCount != 3 {
		t.Errorf("item_count = %d, want 3", v.ItemCount)
	}
	if v.SubtotalCents != 35700 {
		t.Errorf("subtotal = %d, want 35700", v.SubtotalCents)
	}
	if len(v.Items) != 2 || v.Items[0].LineTotalCents != 25800 || v.Items[1].LineTotalCents != 9900 {
		t.Errorf("items = %+v", v.Items)
	}
}

func TestBuildView_EmptyCartHasNonNilItems(t *testing.T) {
	v := buildView(uuid.New(), "USD", nil)
	if v.ItemCount != 0 || v.SubtotalCents != 0 {
		t.Errorf("empty totals = %+v", v)
	}
	if v.Items == nil {
		t.Error("Items should be an empty slice, not nil (serializes as [])")
	}
}
