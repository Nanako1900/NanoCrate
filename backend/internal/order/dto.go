package order

import (
	"time"

	orderdb "github.com/Nanako1900/NanoCrate/backend/internal/order/db"
)

// listItemDTO is an order summary (contract §9.4 GET /orders).
type listItemDTO struct {
	ID         string    `json:"id"`
	Status     string    `json:"status"`
	TotalCents int64     `json:"total_cents"`
	Currency   string    `json:"currency"`
	ItemCount  int64     `json:"item_count"`
	CreatedAt  time.Time `json:"created_at"`
}

// paymentDTO is the payment summary embedded in an order detail.
type paymentDTO struct {
	Provider string `json:"provider"`
	Status   string `json:"status"`
}

// orderItemDTO is a snapshot line (contract §9.4 GET /orders/:id).
type orderItemDTO struct {
	SKU            string `json:"sku"`
	Name           string `json:"name"`
	UnitPriceCents int64  `json:"unit_price_cents"`
	Qty            int32  `json:"qty"`
	LineTotalCents int64  `json:"line_total_cents"`
}

// detailDTO is an order with its items and payment status (contract §9.4).
type detailDTO struct {
	ID            string         `json:"id"`
	Status        string         `json:"status"`
	Currency      string         `json:"currency"`
	SubtotalCents int64          `json:"subtotal_cents"`
	TotalCents    int64          `json:"total_cents"`
	Payment       paymentDTO     `json:"payment"`
	Items         []orderItemDTO `json:"items"`
	CreatedAt     time.Time      `json:"created_at"`
}

func toListDTOs(rows []orderdb.ListOrdersByUserRow) []listItemDTO {
	out := make([]listItemDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, listItemDTO{
			ID:         r.ID.String(),
			Status:     r.Status,
			TotalCents: r.TotalCents,
			Currency:   r.Currency,
			ItemCount:  r.ItemCount,
			CreatedAt:  r.CreatedAt,
		})
	}
	return out
}

func toDetailDTO(o orderdb.Order, items []orderdb.OrderItem) detailDTO {
	lines := make([]orderItemDTO, 0, len(items))
	for _, it := range items {
		lines = append(lines, orderItemDTO{
			SKU:            it.Sku,
			Name:           it.Name,
			UnitPriceCents: it.UnitPriceCents,
			Qty:            it.Qty,
			LineTotalCents: it.LineTotalCents,
		})
	}
	return detailDTO{
		ID:            o.ID.String(),
		Status:        o.Status,
		Currency:      o.Currency,
		SubtotalCents: o.SubtotalCents,
		TotalCents:    o.TotalCents,
		Payment:       paymentDTO{Provider: o.PaymentProvider, Status: o.PaymentStatus},
		Items:         lines,
		CreatedAt:     o.CreatedAt,
	}
}
