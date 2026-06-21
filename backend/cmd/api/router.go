package main

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"github.com/Nanako1900/NanoCrate/backend/internal/admin"
	"github.com/Nanako1900/NanoCrate/backend/internal/auth"
	"github.com/Nanako1900/NanoCrate/backend/internal/cart"
	"github.com/Nanako1900/NanoCrate/backend/internal/catalog"
	"github.com/Nanako1900/NanoCrate/backend/internal/checkout"
	"github.com/Nanako1900/NanoCrate/backend/internal/order"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/config"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/metrics"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/web"
)

// apiDeps bundles everything the router wires together.
type apiDeps struct {
	cfg      config.Config
	logger   *slog.Logger
	pool     *pgxpool.Pool
	verifier *auth.Verifier
	metrics  *metrics.Registry
	catalog  *catalog.Handler
	cart     *cart.Handler
	order    *order.Handler
	checkout *checkout.Handler
	admin    *admin.Handler
}

// newRouter wires middleware, probes, metrics, and the public/session/user/admin
// route groups (docs/backend.md §9.2).
func newRouter(d apiDeps) *gin.Engine {
	if d.cfg.AppEnv != "development" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(
		web.RequestID(),
		otelgin.Middleware("nanocrate-api"),
		web.Logger(d.logger),
		web.Recovery(d.logger),
		web.CORS(d.cfg.CORSAllowedOrigins),
	)

	r.GET("/healthz", healthz)
	r.GET("/readyz", readyz(d.pool))
	r.GET("/metrics", d.metrics.Handler())

	v1 := r.Group("/api/v1")

	// Public: catalog + Stripe webhook (signature-authenticated).
	d.catalog.Register(v1)
	d.checkout.RegisterWebhook(v1)

	// Session: cart works for guests (cookie) or logged-in users (JWT).
	session := v1.Group("", d.verifier.OptionalUser())
	d.cart.Register(session)

	// User: checkout + orders require a valid token.
	user := v1.Group("", d.verifier.RequireUser())
	d.checkout.RegisterCheckout(user)
	d.order.Register(user)
	user.GET("/me", me)

	// Admin: requires a valid token AND the realm "admin" role (docs §9.5/§10).
	adminGroup := v1.Group("", d.verifier.RequireUser(), d.verifier.RequireRole("admin"))
	adminGroup.GET("/admin/ping", adminPing)
	d.admin.RegisterAdmin(adminGroup)

	return r
}

func healthz(c *gin.Context) {
	web.OK(c, gin.H{"status": "ok"})
}

func readyz(pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		if err := pool.Ping(ctx); err != nil {
			web.Fail(c, http.StatusServiceUnavailable, web.CodeInternal, "database not ready")
			return
		}
		web.OK(c, gin.H{"status": "ready"})
	}
}

func me(c *gin.Context) {
	principal, ok := auth.PrincipalFromContext(c.Request.Context())
	if !ok {
		web.AbortFail(c, http.StatusUnauthorized, web.CodeUnauthorized, "authentication required")
		return
	}
	web.OK(c, gin.H{
		"sub":      principal.Subject,
		"username": principal.Username,
		"email":    principal.Email,
		"roles":    principal.Roles,
	})
}

func adminPing(c *gin.Context) {
	web.OK(c, gin.H{"pong": true, "scope": "admin"})
}
