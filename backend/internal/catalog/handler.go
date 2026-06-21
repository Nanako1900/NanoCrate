package catalog

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/Nanako1900/NanoCrate/backend/internal/domain"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/web"
)

// Handler exposes the public catalog HTTP endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a catalog handler over the given service.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register mounts the catalog routes onto the given router group (e.g. /api/v1).
func (h *Handler) Register(rg *gin.RouterGroup) {
	rg.GET("/product-types", h.listProductTypes)
	rg.GET("/products", h.listProducts)
	rg.GET("/products/:slug", h.getProduct)
}

func (h *Handler) listProductTypes(c *gin.Context) {
	types, err := h.svc.ListProductTypes(c.Request.Context())
	if err != nil {
		h.internalError(c, "failed to load product types", err)
		return
	}
	web.OK(c, toProductTypeDTOs(types))
}

func (h *Handler) listProducts(c *gin.Context) {
	page, ok := parsePositiveInt(c, c.Query("page"), 1, "page")
	if !ok {
		return
	}
	limit, ok := parsePositiveInt(c, c.Query("limit"), defaultLimit, "limit")
	if !ok {
		return
	}

	result, err := h.svc.ListProducts(c.Request.Context(), ListParams{
		Type:  c.Query("type"),
		Q:     c.Query("q"),
		Sort:  c.Query("sort"),
		Page:  page,
		Limit: limit,
	})
	if err != nil {
		h.internalError(c, "failed to load products", err)
		return
	}
	web.OKWithMeta(c, toProductSummaryDTOs(result.Items), web.PageMeta{
		Total: result.Total,
		Page:  result.Page,
		Limit: result.Limit,
	})
}

func (h *Handler) getProduct(c *gin.Context) {
	detail, err := h.svc.GetProduct(c.Request.Context(), c.Param("slug"))
	if err != nil {
		if errors.Is(err, domain.ErrProductNotFound) {
			web.Fail(c, http.StatusNotFound, web.CodeNotFound, "product not found")
			return
		}
		h.internalError(c, "failed to load product", err)
		return
	}
	web.OK(c, toProductDetailDTO(detail))
}

// internalError logs the underlying cause server-side (with request_id) and
// returns a generic 500 envelope so internals never leak to clients.
func (h *Handler) internalError(c *gin.Context, message string, err error) {
	slog.ErrorContext(c.Request.Context(), message,
		"error", err,
		"request_id", web.RequestIDFromContext(c.Request.Context()),
	)
	web.Fail(c, http.StatusInternalServerError, web.CodeInternal, message)
}

// parsePositiveInt parses an optional positive-integer query parameter. On an
// invalid value it writes a validation_failed envelope and returns ok=false.
func parsePositiveInt(c *gin.Context, raw string, def int, field string) (int, bool) {
	if raw == "" {
		return def, true
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid '"+field+"' parameter")
		return 0, false
	}
	return n, true
}
