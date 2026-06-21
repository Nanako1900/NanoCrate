package web

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ctxKey string

const requestIDKey ctxKey = "request_id"

// HeaderRequestID is the inbound/outbound correlation header.
const HeaderRequestID = "X-Request-ID"

// maxRequestIDLen bounds an inbound request id to keep log lines sane.
const maxRequestIDLen = 128

// RequestID assigns a request id (honoring a sanitized inbound X-Request-ID) and
// propagates it via the response header and request context for log correlation.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		rid := sanitizeRequestID(c.GetHeader(HeaderRequestID))
		if rid == "" {
			rid = uuid.NewString()
		}
		c.Writer.Header().Set(HeaderRequestID, rid)
		ctx := context.WithValue(c.Request.Context(), requestIDKey, rid)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

// sanitizeRequestID keeps only printable ASCII and bounds the length, so a
// malicious inbound header cannot inject control characters into logs.
func sanitizeRequestID(raw string) string {
	if raw == "" {
		return ""
	}
	if len(raw) > maxRequestIDLen {
		raw = raw[:maxRequestIDLen]
	}
	clean := make([]rune, 0, len(raw))
	for _, r := range raw {
		if r >= 0x20 && r < 0x7f {
			clean = append(clean, r)
		}
	}
	return string(clean)
}

// RequestIDFromContext returns the request id stored by RequestID, or "".
func RequestIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDKey).(string); ok {
		return v
	}
	return ""
}

// Logger emits one structured (slog JSON) access log line per request,
// carrying request_id for correlation (docs/backend.md §13).
func Logger(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		ctx := c.Request.Context()
		logger.LogAttrs(ctx, slog.LevelInfo, "http_request",
			slog.String("request_id", RequestIDFromContext(ctx)),
			slog.String("method", c.Request.Method),
			slog.String("path", c.Request.URL.Path),
			slog.Int("status", c.Writer.Status()),
			slog.Int64("latency_ms", time.Since(start).Milliseconds()),
		)
	}
}

// Recovery converts a panic into a 500 internal envelope instead of crashing the process.
func Recovery(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				ctx := c.Request.Context()
				logger.LogAttrs(ctx, slog.LevelError, "panic_recovered",
					slog.Any("error", r),
					slog.String("request_id", RequestIDFromContext(ctx)),
				)
				AbortFail(c, http.StatusInternalServerError, CodeInternal, "internal server error")
			}
		}()
		c.Next()
	}
}
