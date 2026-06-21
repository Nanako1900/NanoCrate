package web

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestEnvelope_SuccessOmitsMeta(t *testing.T) {
	b, err := json.Marshal(Envelope{Success: true, Data: map[string]string{"status": "ok"}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(b)
	for _, want := range []string{`"success":true`, `"error":null`, `"status":"ok"`} {
		if !strings.Contains(got, want) {
			t.Errorf("want %q in %s", want, got)
		}
	}
	if strings.Contains(got, `"meta"`) {
		t.Errorf("meta must be omitted when nil: %s", got)
	}
}

func TestEnvelope_SuccessWithMeta(t *testing.T) {
	b, _ := json.Marshal(Envelope{Success: true, Data: []int{}, Meta: PageMeta{Total: 3, Page: 1, Limit: 2}})
	got := string(b)
	for _, want := range []string{`"meta"`, `"total":3`, `"page":1`, `"limit":2`, `"data":[]`} {
		if !strings.Contains(got, want) {
			t.Errorf("want %q in %s", want, got)
		}
	}
}

func TestEnvelope_FailureShape(t *testing.T) {
	b, _ := json.Marshal(Envelope{Success: false, Error: &APIError{Code: CodeNotFound, Message: "nope"}})
	got := string(b)
	for _, want := range []string{`"success":false`, `"data":null`, `"code":"not_found"`, `"message":"nope"`} {
		if !strings.Contains(got, want) {
			t.Errorf("want %q in %s", want, got)
		}
	}
}

func TestOKHelper(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	OK(c, gin.H{"a": 1})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"success":true`) {
		t.Errorf("body = %s", w.Body.String())
	}
}

func TestFailHelper(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	Fail(c, http.StatusBadRequest, CodeValidationFailed, "bad")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"code":"validation_failed"`) {
		t.Errorf("body = %s", w.Body.String())
	}
}
