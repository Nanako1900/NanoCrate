package admin

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Nanako1900/NanoCrate/backend/internal/platform/web"
)

// Handler exposes the admin endpoints (contract §9.5).
type Handler struct {
	svc *Service
}

// NewHandler builds an admin handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterAdmin mounts /admin/* on a group already gated by RequireUser +
// RequireRole("admin").
func (h *Handler) RegisterAdmin(rg *gin.RouterGroup) {
	rg.GET("/admin/products", h.listProducts)
	rg.POST("/admin/products", h.createProduct)
	rg.PATCH("/admin/products/:id", h.updateProduct)
	rg.DELETE("/admin/products/:id", h.archiveProduct)
	rg.POST("/admin/products/:id/variants", h.createVariant)
	rg.GET("/admin/product-types/:key", h.productTypeSchema)
	rg.PATCH("/admin/variants/:id", h.updateVariant)
	rg.POST("/admin/inventory/:variant_id/restock", h.restock)
	rg.GET("/admin/inventory", h.listInventory)
	rg.GET("/admin/inventory/:variant_id/ledger", h.listLedger)
	rg.GET("/admin/orders", h.listOrders)
}

func (h *Handler) listProducts(c *gin.Context) {
	page, limit := pageLimit(c)
	items, total, err := h.svc.ListProducts(c.Request.Context(), optionalQuery(c, "q"), optionalQuery(c, "status"), page, limit)
	if err != nil {
		h.fail(c, err)
		return
	}
	web.OKWithMeta(c, items, web.PageMeta{Total: total, Page: page, Limit: limit})
}

func (h *Handler) createProduct(c *gin.Context) {
	var req CreateProductRequest
	if !bindJSON(c, &req) {
		return
	}
	view, err := h.svc.CreateProduct(c.Request.Context(), req)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, web.Envelope{Success: true, Data: view})
}

func (h *Handler) updateProduct(c *gin.Context) {
	id, ok := parseUUID(c, "id")
	if !ok {
		return
	}
	var req UpdateProductRequest
	if !bindJSON(c, &req) {
		return
	}
	view, err := h.svc.UpdateProduct(c.Request.Context(), id, req)
	if err != nil {
		h.fail(c, err)
		return
	}
	web.OK(c, view)
}

func (h *Handler) archiveProduct(c *gin.Context) {
	id, ok := parseUUID(c, "id")
	if !ok {
		return
	}
	view, err := h.svc.ArchiveProduct(c.Request.Context(), id)
	if err != nil {
		h.fail(c, err)
		return
	}
	web.OK(c, view)
}

func (h *Handler) productTypeSchema(c *gin.Context) {
	view, err := h.svc.ProductTypeSchema(c.Request.Context(), c.Param("key"))
	if err != nil {
		h.fail(c, err)
		return
	}
	web.OK(c, view)
}

func (h *Handler) createVariant(c *gin.Context) {
	productID, ok := parseUUID(c, "id")
	if !ok {
		return
	}
	var req CreateVariantRequest
	if !bindJSON(c, &req) {
		return
	}
	view, err := h.svc.CreateVariant(c.Request.Context(), productID, req)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, web.Envelope{Success: true, Data: view})
}

func (h *Handler) updateVariant(c *gin.Context) {
	id, ok := parseUUID(c, "id")
	if !ok {
		return
	}
	var req UpdateVariantRequest
	if !bindJSON(c, &req) {
		return
	}
	view, err := h.svc.UpdateVariant(c.Request.Context(), id, req)
	if err != nil {
		h.fail(c, err)
		return
	}
	web.OK(c, view)
}

func (h *Handler) restock(c *gin.Context) {
	variantID, ok := parseUUID(c, "variant_id")
	if !ok {
		return
	}
	var req RestockRequest
	if !bindJSON(c, &req) {
		return
	}
	view, err := h.svc.Restock(c.Request.Context(), variantID, req.Qty)
	if err != nil {
		h.fail(c, err)
		return
	}
	web.OK(c, view)
}

func (h *Handler) listInventory(c *gin.Context) {
	page, limit := pageLimit(c)
	low := c.Query("low") == "true"
	threshold, _ := strconv.Atoi(c.Query("threshold"))
	items, total, err := h.svc.ListInventory(c.Request.Context(), low, threshold, page, limit)
	if err != nil {
		h.fail(c, err)
		return
	}
	web.OKWithMeta(c, items, web.PageMeta{Total: total, Page: page, Limit: limit})
}

func (h *Handler) listLedger(c *gin.Context) {
	variantID, ok := parseUUID(c, "variant_id")
	if !ok {
		return
	}
	page, limit := pageLimit(c)
	entries, total, err := h.svc.ListLedger(c.Request.Context(), variantID, page, limit)
	if err != nil {
		h.fail(c, err)
		return
	}
	web.OKWithMeta(c, entries, web.PageMeta{Total: total, Page: page, Limit: limit})
}

func (h *Handler) listOrders(c *gin.Context) {
	page, limit := pageLimit(c)
	items, total, err := h.svc.ListOrders(c.Request.Context(), optionalQuery(c, "status"), page, limit)
	if err != nil {
		h.fail(c, err)
		return
	}
	web.OKWithMeta(c, items, web.PageMeta{Total: total, Page: page, Limit: limit})
}

// fail maps admin errors to the response envelope (validation carries details).
func (h *Handler) fail(c *gin.Context, err error) {
	var ve *ValidationError
	switch {
	case errors.As(err, &ve):
		web.FailDetails(c, http.StatusUnprocessableEntity, web.CodeValidationFailed, ve.Error(), ve.Details)
	case errors.Is(err, ErrProductNotFound), errors.Is(err, ErrVariantNotFound), errors.Is(err, ErrProductTypeNotFound):
		web.Fail(c, http.StatusNotFound, web.CodeNotFound, err.Error())
	case errors.Is(err, ErrSlugConflict):
		web.Fail(c, http.StatusConflict, web.CodeConflict, "slug or sku already exists")
	default:
		slog.ErrorContext(c.Request.Context(), "admin operation failed",
			"error", err, "request_id", web.RequestIDFromContext(c.Request.Context()))
		web.Fail(c, http.StatusInternalServerError, web.CodeInternal, "admin operation failed")
	}
}

func bindJSON(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid request body")
		return false
	}
	return true
}

func parseUUID(c *gin.Context, param string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(param))
	if err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid "+param)
		return uuid.Nil, false
	}
	return id, true
}

func pageLimit(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.Query("page"))
	limit, _ := strconv.Atoi(c.Query("limit"))
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = defaultLimit
	}
	return page, limit
}

// optionalQuery returns a pointer to a trimmed query value, or nil if absent/empty.
func optionalQuery(c *gin.Context, key string) *string {
	v := strings.TrimSpace(c.Query(key))
	if v == "" {
		return nil
	}
	return &v
}
