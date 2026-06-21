package cart

import (
	"github.com/google/uuid"

	cartdb "github.com/Nanako1900/NanoCrate/backend/internal/cart/db"
)

// View is the wire shape of a cart (contract §9.4). Returned by every cart endpoint.
type View struct {
	ID            string     `json:"id"`
	Currency      string     `json:"currency"`
	ItemCount     int32      `json:"item_count"`
	SubtotalCents int64      `json:"subtotal_cents"`
	Items         []ItemView `json:"items"`
}

// ItemView is a single cart line (contract §9.4).
type ItemView struct {
	ID             string `json:"id"`
	VariantID      string `json:"variant_id"`
	SKU            string `json:"sku"`
	Name           string `json:"name"`
	UnitPriceCents int64  `json:"unit_price_cents"`
	Qty            int32  `json:"qty"`
	LineTotalCents int64  `json:"line_total_cents"`
	Available      int32  `json:"available"`
}

// buildView rolls up cart items into the wire view (pure; unit-tested).
func buildView(cartID uuid.UUID, currency string, rows []cartdb.ListCartItemsDetailedRow) View {
	items := make([]ItemView, 0, len(rows))
	var itemCount int32
	var subtotal int64
	for _, r := range rows {
		lineTotal := r.UnitPriceCents * int64(r.Qty)
		itemCount += r.Qty
		subtotal += lineTotal
		items = append(items, ItemView{
			ID:             r.ID.String(),
			VariantID:      r.VariantID.String(),
			SKU:            r.Sku,
			Name:           r.Name,
			UnitPriceCents: r.UnitPriceCents,
			Qty:            r.Qty,
			LineTotalCents: lineTotal,
			Available:      r.Available,
		})
	}
	return View{
		ID:            cartID.String(),
		Currency:      currency,
		ItemCount:     itemCount,
		SubtotalCents: subtotal,
		Items:         items,
	}
}
