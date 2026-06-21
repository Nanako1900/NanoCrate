package cart

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Nanako1900/NanoCrate/backend/internal/auth"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/web"
)

const (
	// CookieName is the guest cart cookie. Exported so the checkout flow can read
	// the same cookie to authorize guest-cart checkout (B4).
	CookieName       = "nano_cart"
	cartCookieMaxAge = 60 * 60 * 24 * 30 // 30 days

	// MaxLineQty bounds a single cart line's quantity. It guards against int32
	// overflow from repeated accumulating adds (B9) and against a single line
	// locking an entire SKU at checkout (B7).
	MaxLineQty = 999

	qtyRangeMessage = "qty must be between 1 and 999"
)

// Handler exposes the session-scoped cart endpoints (contract §9.4).
type Handler struct {
	svc           *Service
	secureCookies bool
}

// NewHandler builds a cart handler. secureCookies should be true outside local
// development so the guest cart cookie carries the Secure attribute.
func NewHandler(svc *Service, secureCookies bool) *Handler {
	return &Handler{svc: svc, secureCookies: secureCookies}
}

// Register mounts cart routes. Mount behind auth.OptionalUser so a JWT, when
// present, binds the cart to the user; otherwise a guest cookie is used.
func (h *Handler) Register(rg *gin.RouterGroup) {
	rg.GET("/cart", h.getCart)
	rg.POST("/cart/items", h.addItem)
	rg.PATCH("/cart/items/:id", h.updateItem)
	rg.DELETE("/cart/items/:id", h.removeItem)
}

func (h *Handler) getCart(c *gin.Context) {
	cartID, ok := h.resolve(c)
	if !ok {
		return
	}
	h.respond(c, cartID)
}

type addItemBody struct {
	VariantID string `json:"variant_id"`
	Qty       int32  `json:"qty"`
}

func (h *Handler) addItem(c *gin.Context) {
	var body addItemBody
	if err := c.ShouldBindJSON(&body); err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid request body")
		return
	}
	variantID, err := uuid.Parse(body.VariantID)
	if err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid variant_id")
		return
	}
	if body.Qty < 1 || body.Qty > MaxLineQty {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, qtyRangeMessage)
		return
	}
	cartID, ok := h.resolve(c)
	if !ok {
		return
	}
	if err := h.svc.AddItem(c.Request.Context(), cartID, variantID, body.Qty); err != nil {
		h.mutationError(c, err)
		return
	}
	h.respond(c, cartID)
}

type qtyBody struct {
	Qty int32 `json:"qty"`
}

func (h *Handler) updateItem(c *gin.Context) {
	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid item id")
		return
	}
	var body qtyBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Qty < 1 || body.Qty > MaxLineQty {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, qtyRangeMessage)
		return
	}
	cartID, ok := h.resolve(c)
	if !ok {
		return
	}
	if err := h.svc.UpdateItem(c.Request.Context(), cartID, itemID, body.Qty); err != nil {
		h.mutationError(c, err)
		return
	}
	h.respond(c, cartID)
}

func (h *Handler) removeItem(c *gin.Context) {
	itemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, "invalid item id")
		return
	}
	cartID, ok := h.resolve(c)
	if !ok {
		return
	}
	if err := h.svc.RemoveItem(c.Request.Context(), cartID, itemID); err != nil {
		h.mutationError(c, err)
		return
	}
	h.respond(c, cartID)
}

// resolve determines the session's cart, sets a guest cookie when a new cart is
// created, and returns ok=false (after writing an error) on failure.
func (h *Handler) resolve(c *gin.Context) (uuid.UUID, bool) {
	sess := h.sessionFrom(c)
	cartID, setCookie, err := h.svc.Resolve(c.Request.Context(), sess)
	if err != nil {
		web.Fail(c, http.StatusInternalServerError, web.CodeInternal, "failed to resolve cart")
		return uuid.Nil, false
	}
	if setCookie != uuid.Nil {
		// B8 (adjudicated): keep SameSite=Lax, not Strict. The cookie is HttpOnly
		// (and Secure outside dev), so it cannot be read by JS. Strict would drop
		// the cookie on top-level cross-site navigations (arriving at the store via
		// an email/ad/social link), making the guest cart appear empty — bad UX for
		// a cart. It also gains little: guest-cart checkout additionally requires
		// the user's JWT (RequireUser), so the cookie cannot be used to force a
		// cross-site checkout regardless of SameSite. Lax sends it on top-level GET
		// navigations, which is exactly what a cart needs.
		c.SetSameSite(http.SameSiteLaxMode)
		c.SetCookie(CookieName, setCookie.String(), cartCookieMaxAge, "/", "", h.secureCookies, true)
	}
	return cartID, true
}

func (h *Handler) sessionFrom(c *gin.Context) Session {
	var sess Session
	if p, ok := auth.PrincipalFromContext(c.Request.Context()); ok && p.Subject != "" {
		sub := p.Subject
		sess.UserID = &sub
	}
	if v, err := c.Cookie(CookieName); err == nil {
		if id, err := uuid.Parse(v); err == nil {
			sess.CookieCartID = &id
		}
	}
	return sess
}

func (h *Handler) respond(c *gin.Context, cartID uuid.UUID) {
	view, err := h.svc.Snapshot(c.Request.Context(), cartID)
	if err != nil {
		web.Fail(c, http.StatusInternalServerError, web.CodeInternal, "failed to load cart")
		return
	}
	web.OK(c, view)
}

func (h *Handler) mutationError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrVariantNotFound):
		web.Fail(c, http.StatusNotFound, web.CodeNotFound, "variant not found")
	case errors.Is(err, ErrItemNotFound):
		web.Fail(c, http.StatusNotFound, web.CodeNotFound, "cart item not found")
	case errors.Is(err, ErrQtyTooLarge):
		web.Fail(c, http.StatusBadRequest, web.CodeValidationFailed, qtyRangeMessage)
	default:
		web.Fail(c, http.StatusInternalServerError, web.CodeInternal, "cart operation failed")
	}
}
