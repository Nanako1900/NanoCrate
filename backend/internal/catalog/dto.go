package catalog

import (
	"encoding/json"

	"github.com/Nanako1900/NanoCrate/backend/internal/domain"
)

// Wire DTOs — exact shapes of the public catalog contract (docs/backend.md §9.3).
// json tags here are the contract; changing them is a breaking API change.

type productTypeDTO struct {
	Key             string          `json:"key"`
	Name            string          `json:"name"`
	AttributeSchema json.RawMessage `json:"attribute_schema"`
}

type productSummaryDTO struct {
	Slug           string          `json:"slug"`
	Name           string          `json:"name"`
	Type           string          `json:"type"`
	PriceFromCents int64           `json:"price_from_cents"`
	Currency       string          `json:"currency"`
	Attributes     json.RawMessage `json:"attributes"`
	Image          string          `json:"image"`
}

type variantDTO struct {
	ID         string          `json:"id"`
	SKU        string          `json:"sku"`
	Name       string          `json:"name"`
	PriceCents int64           `json:"price_cents"`
	Currency   string          `json:"currency"`
	Attributes json.RawMessage `json:"attributes"`
	Available  int32           `json:"available"`
}

type productDetailDTO struct {
	Slug        string          `json:"slug"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Type        string          `json:"type"`
	Attributes  json.RawMessage `json:"attributes"`
	Variants    []variantDTO    `json:"variants"`
}

func toProductTypeDTOs(in []domain.ProductType) []productTypeDTO {
	out := make([]productTypeDTO, 0, len(in))
	for _, t := range in {
		out = append(out, productTypeDTO{
			Key:             t.Key,
			Name:            t.Name,
			AttributeSchema: orEmptyObject(t.AttributeSchema),
		})
	}
	return out
}

func toProductSummaryDTOs(in []domain.ProductSummary) []productSummaryDTO {
	out := make([]productSummaryDTO, 0, len(in))
	for _, p := range in {
		out = append(out, productSummaryDTO{
			Slug:           p.Slug,
			Name:           p.Name,
			Type:           p.Type,
			PriceFromCents: p.PriceFromCents,
			Currency:       p.Currency,
			Attributes:     orEmptyObject(p.Attributes),
			Image:          p.ImageURL,
		})
	}
	return out
}

func toProductDetailDTO(in domain.ProductDetail) productDetailDTO {
	variants := make([]variantDTO, 0, len(in.Variants))
	for _, v := range in.Variants {
		variants = append(variants, variantDTO{
			ID:         v.ID,
			SKU:        v.SKU,
			Name:       v.Name,
			PriceCents: v.PriceCents,
			Currency:   v.Currency,
			Attributes: orEmptyObject(v.Attributes),
			Available:  v.Available,
		})
	}
	return productDetailDTO{
		Slug:        in.Slug,
		Name:        in.Name,
		Description: in.Description,
		Type:        in.Type,
		Attributes:  orEmptyObject(in.Attributes),
		Variants:    variants,
	}
}

// orEmptyObject guarantees a JSON object is emitted (never null, an array, or a
// scalar) for attribute fields, matching the contract where attributes are
// always an object. A stored SQL NULL materializes as the literal "null".
func orEmptyObject(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 || raw[0] != '{' {
		return json.RawMessage("{}")
	}
	return raw
}
