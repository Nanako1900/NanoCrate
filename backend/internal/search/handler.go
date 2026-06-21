package search

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/Nanako1900/NanoCrate/backend/internal/platform/web"
)

// Handler exposes the public POST /search endpoint (contract §9.3).
type Handler struct {
	provider Provider
}

// NewHandler builds a search handler.
func NewHandler(provider Provider) *Handler {
	return &Handler{provider: provider}
}

// Bounds for the unauthenticated search endpoint (defense against abuse /
// third-party embedding-cost amplification). Per-IP rate limiting is expected at
// the ingress/gateway in production.
const (
	maxSearchBody = 4 << 10 // 4 KiB request body
	maxQueryLen   = 512     // characters
)

// Register mounts POST /search on a public group.
func (h *Handler) Register(rg *gin.RouterGroup) {
	rg.POST("/search", h.search)
}

type searchBody struct {
	Query string `json:"query"`
	Limit int    `json:"limit"`
}

func (h *Handler) search(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxSearchBody)
	var body searchBody
	if err := c.ShouldBindJSON(&body); err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid request body")
		return
	}
	query := strings.TrimSpace(body.Query)
	if query == "" {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "query is required")
		return
	}
	if len(query) > maxQueryLen {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "query too long")
		return
	}
	hits, err := h.provider.Search(c.Request.Context(), query, body.Limit)
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "search failed",
			"error", err, "request_id", web.RequestIDFromContext(c.Request.Context()))
		web.Fail(c, http.StatusInternalServerError, web.CodeInternal, "search failed")
		return
	}
	web.OK(c, gin.H{"hits": hits})
}
