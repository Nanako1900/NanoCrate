package web

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func corsRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CORS([]string{"https://shop.example.com"}))
	r.GET("/x", func(c *gin.Context) { c.String(http.StatusOK, "ok") })
	return r
}

func TestCORS_AllowedOriginEchoedWithCredentials(t *testing.T) {
	r := corsRouter()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Origin", "https://shop.example.com")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	h := w.Result().Header
	if got := h.Get("Access-Control-Allow-Origin"); got != "https://shop.example.com" {
		t.Errorf("ACAO = %q, want the specific origin (never *)", got)
	}
	if h.Get("Access-Control-Allow-Credentials") != "true" {
		t.Error("ACAC must be true for credentialed CORS")
	}
	if got := h.Get("Access-Control-Allow-Headers"); got == "" || !containsAll(got, "Authorization", "Idempotency-Key") {
		t.Errorf("ACAH = %q, want Authorization + Idempotency-Key", got)
	}
}

func TestCORS_DisallowedOriginGetsNoACAO(t *testing.T) {
	r := corsRouter()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if got := w.Result().Header.Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("ACAO = %q, want empty for a disallowed origin", got)
	}
}

func TestCORS_PreflightAllowedReturns204(t *testing.T) {
	r := corsRouter()
	req := httptest.NewRequest(http.MethodOptions, "/x", nil)
	req.Header.Set("Origin", "https://shop.example.com")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Errorf("preflight status = %d, want 204", w.Code)
	}
	if w.Result().Header.Get("Access-Control-Allow-Origin") != "https://shop.example.com" {
		t.Error("preflight should carry ACAO for an allowed origin")
	}
}

func containsAll(s string, subs ...string) bool {
	for _, sub := range subs {
		found := false
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
