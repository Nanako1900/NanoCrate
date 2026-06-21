package search

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type fakeProvider struct {
	hits []Hit
}

func (f fakeProvider) Index(context.Context, Document) error { return nil }
func (f fakeProvider) Search(context.Context, string, int) ([]Hit, error) {
	return f.hits, nil
}

func searchRouter(p Provider) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	NewHandler(p).Register(r.Group("/api/v1"))
	return r
}

func post(t *testing.T, r *gin.Engine, body string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/search", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var decoded map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &decoded)
	return w.Code, decoded
}

func TestHandler_Search_ReturnsHits(t *testing.T) {
	r := searchRouter(fakeProvider{hits: []Hit{{Slug: "nano-full", Name: "Nano Full", Type: "keyboard", Score: 0.5}}})
	code, body := post(t, r, `{"query":"quiet office keyboard","limit":5}`)
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	hits := body["data"].(map[string]any)["hits"].([]any)
	if len(hits) != 1 {
		t.Fatalf("hits = %v", hits)
	}
	h0 := hits[0].(map[string]any)
	if h0["slug"] != "nano-full" || h0["type"] != "keyboard" || h0["name"] != "Nano Full" {
		t.Errorf("hit shape = %v", h0)
	}
}

func TestHandler_Search_EmptyQueryRejected(t *testing.T) {
	r := searchRouter(fakeProvider{})
	for _, body := range []string{`{"query":"  "}`, `{"limit":5}`, `not json`} {
		code, _ := post(t, r, body)
		if code != http.StatusBadRequest {
			t.Errorf("body %q = %d, want 400", body, code)
		}
	}
}

func TestHandler_Search_EmptyResultsIsEmptyArray(t *testing.T) {
	r := searchRouter(fakeProvider{hits: []Hit{}})
	_, body := post(t, r, `{"query":"nothing matches"}`)
	hits := body["data"].(map[string]any)["hits"]
	if hits == nil {
		t.Error("hits should be [] not null")
	}
}
