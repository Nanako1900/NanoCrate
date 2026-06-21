// Package admin implements the admin backend (contract §9.5): product/variant
// CRUD with dynamic attribute validation, inventory restock + stock-ledger reads,
// and order management. All endpoints are admin-RBAC gated.
package admin

import (
	"encoding/json"
	"fmt"
)

// Field types in a product_type.attribute_schema (the dynamic-form source of truth).
const (
	FieldText   = "text"
	FieldNumber = "number"
	FieldBool   = "bool"
	FieldSelect = "select"
)

// Field describes one attribute a product of a given type may carry.
type Field struct {
	Name     string   `json:"name"`
	Type     string   `json:"type"`
	Required bool     `json:"required"`
	Options  []string `json:"options,omitempty"`
}

// AttributeSchema is the canonical {fields:[...]} schema (contract §9.5).
type AttributeSchema struct {
	Fields []Field `json:"fields"`
}

// FieldError locates a single attribute validation failure (contract §9.5 error.details).
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ParseSchema decodes a stored attribute_schema. An empty schema validates nothing.
func ParseSchema(raw json.RawMessage) (AttributeSchema, error) {
	var s AttributeSchema
	if len(raw) == 0 {
		return s, nil
	}
	if err := json.Unmarshal(raw, &s); err != nil {
		return s, fmt.Errorf("parse attribute_schema: %w", err)
	}
	return s, nil
}

// Validate checks attrs (a JSON object) against the schema: required fields present,
// values of the right type, select values within options, and no unknown keys.
// It returns one FieldError per problem (empty slice = valid).
func (s AttributeSchema) Validate(attrs json.RawMessage) []FieldError {
	// A type with no declared fields is unconstrained: accept any attributes.
	if len(s.Fields) == 0 {
		return nil
	}
	m := map[string]any{}
	if len(attrs) > 0 {
		if err := json.Unmarshal(attrs, &m); err != nil {
			return []FieldError{{Field: "attributes", Message: "must be a JSON object"}}
		}
	}
	var errs []FieldError
	known := make(map[string]struct{}, len(s.Fields))
	for _, f := range s.Fields {
		known[f.Name] = struct{}{}
		v, present := m[f.Name]
		if !present || v == nil {
			if f.Required {
				errs = append(errs, FieldError{f.Name, "is required"})
			}
			continue
		}
		if msg := validateValue(f, v); msg != "" {
			errs = append(errs, FieldError{f.Name, msg})
		}
	}
	for k := range m {
		if _, ok := known[k]; !ok {
			errs = append(errs, FieldError{k, "unknown attribute"})
		}
	}
	return errs
}

func validateValue(f Field, v any) string {
	switch f.Type {
	case FieldText:
		if _, ok := v.(string); !ok {
			return "must be a string"
		}
	case FieldSelect:
		s, ok := v.(string)
		if !ok {
			return "must be a string"
		}
		if !contains(f.Options, s) {
			return fmt.Sprintf("must be one of %v", f.Options)
		}
	case FieldNumber:
		if _, ok := v.(float64); !ok { // JSON numbers decode to float64
			return "must be a number"
		}
	case FieldBool:
		if _, ok := v.(bool); !ok {
			return "must be a boolean"
		}
	}
	return ""
}

func contains(opts []string, v string) bool {
	for _, o := range opts {
		if o == v {
			return true
		}
	}
	return false
}
