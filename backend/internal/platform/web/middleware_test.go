package web

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(io.Discard, nil))
}

func TestRequestID_GeneratesAndPropagates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var seen string
	r := gin.New()
	r.Use(RequestID())
	r.GET("/x", func(c *gin.Context) {
		seen = RequestIDFromContext(c.Request.Context())
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))

	header := w.Header().Get(HeaderRequestID)
	if header == "" {
		t.Fatal("response missing X-Request-ID header")
	}
	if seen == "" || seen != header {
		t.Errorf("context id %q != header %q", seen, header)
	}
}

func TestRequestID_HonorsInboundHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestID())
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set(HeaderRequestID, "inbound-123")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if got := w.Header().Get(HeaderRequestID); got != "inbound-123" {
		t.Errorf("request id = %q, want inbound-123", got)
	}
}

func TestRecovery_ConvertsPanicToEnvelope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Recovery(discardLogger()))
	r.GET("/boom", func(_ *gin.Context) { panic("kaboom") })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/boom", nil))

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"code":"internal"`) {
		t.Errorf("body = %s", w.Body.String())
	}
}

func TestSanitizeRequestID(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"plain", "abc-123", "abc-123"},
		{"empty", "", ""},
		{"strips control chars", "ab\nc\t\x00d", "abcd"},
		{"truncates", strings.Repeat("x", 200), strings.Repeat("x", maxRequestIDLen)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sanitizeRequestID(tt.in); got != tt.want {
				t.Errorf("sanitizeRequestID(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestRequestID_SanitizesInbound(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestID())
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set(HeaderRequestID, "good\ninjected")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if got := w.Header().Get(HeaderRequestID); got != "goodinjected" {
		t.Errorf("request id = %q, want sanitized 'goodinjected'", got)
	}
}

func TestLogger_DoesNotInterfere(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestID(), Logger(discardLogger()))
	r.GET("/ok", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/ok", nil))

	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"ok":true`) {
		t.Errorf("unexpected response: %d %s", w.Code, w.Body.String())
	}
}
