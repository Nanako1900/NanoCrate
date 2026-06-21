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

// Register mounts POST /search on a public group.
func (h *Handler) Register(rg *gin.RouterGroup) {
	rg.POST("/search", h.search)
}

type searchBody struct {
	Query string `json:"query"`
	Limit int    `json:"limit"`
}

func (h *Handler) search(c *gin.Context) {
	var body searchBody
	if err := c.ShouldBindJSON(&body); err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid request body")
		return
	}
	if strings.TrimSpace(body.Query) == "" {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "query is required")
		return
	}
	hits, err := h.provider.Search(c.Request.Context(), body.Query, body.Limit)
	if err != nil {
		slog.ErrorContext(c.Request.Context(), "search failed",
			"error", err, "request_id", web.RequestIDFromContext(c.Request.Context()))
		web.Fail(c, http.StatusInternalServerError, web.CodeInternal, "search failed")
		return
	}
	web.OK(c, gin.H{"hits": hits})
}
