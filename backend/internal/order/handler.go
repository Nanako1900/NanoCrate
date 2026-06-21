package order

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Nanako1900/NanoCrate/backend/internal/auth"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/web"
)

// Handler exposes the authenticated order endpoints (contract §9.4).
type Handler struct {
	svc *Service
}

// NewHandler builds an order handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register mounts order routes; mount behind auth.RequireUser.
func (h *Handler) Register(rg *gin.RouterGroup) {
	rg.GET("/orders", h.list)
	rg.GET("/orders/:id", h.get)
}

func (h *Handler) list(c *gin.Context) {
	principal, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		web.Fail(c, http.StatusUnauthorized, web.CodeUnauthorized, "authentication required")
		return
	}
	page := parseIntDefault(c.Query("page"), 1)
	limit := parseIntDefault(c.Query("limit"), 20)

	rows, total, err := h.svc.List(c.Request.Context(), principal.Subject, page, limit)
	if err != nil {
		web.Fail(c, http.StatusInternalServerError, web.CodeInternal, "failed to load orders")
		return
	}
	web.OKWithMeta(c, toListDTOs(rows), web.PageMeta{Total: total, Page: page, Limit: limit})
}

func (h *Handler) get(c *gin.Context) {
	principal, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		web.Fail(c, http.StatusUnauthorized, web.CodeUnauthorized, "authentication required")
		return
	}
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid order id")
		return
	}
	o, items, err := h.svc.Get(c.Request.Context(), principal.Subject, orderID)
	if err != nil {
		if errors.Is(err, ErrOrderNotFound) {
			web.Fail(c, http.StatusNotFound, web.CodeNotFound, "order not found")
			return
		}
		web.Fail(c, http.StatusInternalServerError, web.CodeInternal, "failed to load order")
		return
	}
	web.OK(c, toDetailDTO(o, items))
}

func parseIntDefault(raw string, def int) int {
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return def
	}
	return n
}
