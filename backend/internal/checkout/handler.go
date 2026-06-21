package checkout

import (
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Nanako1900/NanoCrate/backend/internal/auth"
	"github.com/Nanako1900/NanoCrate/backend/internal/payment"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/web"
)

// maxWebhookBody bounds the webhook payload we will read (defense against abuse).
const maxWebhookBody = 1 << 20 // 1 MiB

// Handler exposes POST /checkout (user) and POST /webhooks/stripe (signature).
type Handler struct {
	svc *Service
}

// NewHandler builds a checkout handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterCheckout mounts POST /checkout; mount behind auth.RequireUser.
func (h *Handler) RegisterCheckout(rg *gin.RouterGroup) {
	rg.POST("/checkout", h.checkout)
}

// RegisterWebhook mounts POST /webhooks/stripe on a public group (signature auth).
func (h *Handler) RegisterWebhook(rg *gin.RouterGroup) {
	rg.POST("/webhooks/stripe", h.webhook)
}

type checkoutBody struct {
	CartID string `json:"cart_id"`
}

func (h *Handler) checkout(c *gin.Context) {
	principal, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		web.Fail(c, http.StatusUnauthorized, web.CodeUnauthorized, "authentication required")
		return
	}
	idempotencyKey := c.GetHeader("Idempotency-Key")
	if idempotencyKey == "" {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "Idempotency-Key header is required")
		return
	}
	var body checkoutBody
	if err := c.ShouldBindJSON(&body); err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid request body")
		return
	}
	cartID, err := uuid.Parse(body.CartID)
	if err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid cart_id")
		return
	}

	result, err := h.svc.Checkout(c.Request.Context(), principal.Subject, cartID, idempotencyKey)
	if err != nil {
		h.checkoutError(c, err)
		return
	}
	web.OK(c, gin.H{"order_id": result.OrderID, "client_secret": result.ClientSecret})
}

func (h *Handler) checkoutError(c *gin.Context, err error) {
	var oos *OutOfStockError
	switch {
	case errors.As(err, &oos):
		web.Fail(c, http.StatusConflict, web.CodeOutOfStock, oos.Error())
	case errors.Is(err, ErrEmptyCart):
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "cart is empty")
	case errors.Is(err, ErrCartNotFound):
		web.Fail(c, http.StatusNotFound, web.CodeNotFound, "cart not found")
	default:
		slog.ErrorContext(c.Request.Context(), "checkout failed",
			"error", err, "request_id", web.RequestIDFromContext(c.Request.Context()))
		web.Fail(c, http.StatusInternalServerError, web.CodeInternal, "checkout failed")
	}
}

func (h *Handler) webhook(c *gin.Context) {
	payload, err := io.ReadAll(io.LimitReader(c.Request.Body, maxWebhookBody))
	if err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "unreadable body")
		return
	}
	signature := c.GetHeader("Stripe-Signature")
	if err := h.svc.HandleWebhook(c.Request.Context(), payload, signature); err != nil {
		if errors.Is(err, payment.ErrInvalidSignature) {
			web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid signature")
			return
		}
		slog.ErrorContext(c.Request.Context(), "webhook processing failed",
			"error", err, "request_id", web.RequestIDFromContext(c.Request.Context()))
		web.Fail(c, http.StatusInternalServerError, web.CodeInternal, "webhook processing failed")
		return
	}
	web.OK(c, gin.H{"received": true})
}
