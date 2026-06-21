package admin

import (
	"encoding/json"
	"testing"
)

func keyboardSchema(t *testing.T) AttributeSchema {
	t.Helper()
	s, err := ParseSchema(json.RawMessage(`{"fields":[
		{"name":"layout","type":"select","required":true,"options":["60%","75%","full"]},
		{"name":"hot_swappable","type":"bool","required":false},
		{"name":"switches","type":"number","required":false},
		{"name":"notes","type":"text","required":false}
	]}`))
	if err != nil {
		t.Fatalf("parse schema: %v", err)
	}
	return s
}

func fieldErrs(t *testing.T, s AttributeSchema, attrs string) map[string]string {
	t.Helper()
	out := map[string]string{}
	for _, e := range s.Validate(json.RawMessage(attrs)) {
		out[e.Field] = e.Message
	}
	return out
}

func TestSchema_ValidAttributesPass(t *testing.T) {
	s := keyboardSchema(t)
	if errs := s.Validate(json.RawMessage(`{"layout":"75%","hot_swappable":true,"switches":3}`)); len(errs) != 0 {
		t.Errorf("valid attrs produced errors: %+v", errs)
	}
}

func TestSchema_MissingRequiredField(t *testing.T) {
	s := keyboardSchema(t)
	errs := fieldErrs(t, s, `{"hot_swappable":true}`)
	if errs["layout"] == "" {
		t.Errorf("expected a 'layout' required error, got %+v", errs)
	}
}

func TestSchema_WrongTypes(t *testing.T) {
	s := keyboardSchema(t)
	errs := fieldErrs(t, s, `{"layout":"75%","hot_swappable":"yes","switches":"three"}`)
	if errs["hot_swappable"] == "" || errs["switches"] == "" {
		t.Errorf("expected type errors on hot_swappable and switches, got %+v", errs)
	}
}

func TestSchema_SelectNotInOptions(t *testing.T) {
	s := keyboardSchema(t)
	errs := fieldErrs(t, s, `{"layout":"ergo"}`)
	if errs["layout"] == "" {
		t.Errorf("expected 'layout' enum error, got %+v", errs)
	}
}

func TestSchema_UnknownAttributeRejected(t *testing.T) {
	s := keyboardSchema(t)
	errs := fieldErrs(t, s, `{"layout":"75%","frobnicate":true}`)
	if errs["frobnicate"] == "" {
		t.Errorf("expected unknown-attribute error, got %+v", errs)
	}
}

func TestSchema_EmptySchemaAcceptsAnything(t *testing.T) {
	var s AttributeSchema
	if errs := s.Validate(json.RawMessage(`{"anything":1}`)); len(errs) != 0 {
		t.Errorf("empty schema should accept anything, got %+v", errs)
	}
}

func TestSchema_NonObjectAttributesRejected(t *testing.T) {
	s := keyboardSchema(t)
	errs := fieldErrs(t, s, `[1,2,3]`)
	if errs["attributes"] == "" {
		t.Errorf("expected a non-object error, got %+v", errs)
	}
}
