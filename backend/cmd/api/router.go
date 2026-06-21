package main

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Nanako1900/NanoCrate/backend/internal/auth"
	"github.com/Nanako1900/NanoCrate/backend/internal/catalog"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/config"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/web"
)

// newRouter wires middleware, health probes, the public catalog slice, and the
// auth-protected RBAC stubs (docs/backend.md §9.2).
func newRouter(cfg config.Config, logger *slog.Logger, pool *pgxpool.Pool, catalogHandler *catalog.Handler, verifier *auth.Verifier) *gin.Engine {
	if cfg.AppEnv != "development" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(web.RequestID(), web.Logger(logger), web.Recovery(logger))

	r.GET("/healthz", healthz)
	r.GET("/readyz", readyz(pool))

	v1 := r.Group("/api/v1")
	catalogHandler.Register(v1)

	// Protected RBAC stubs (deep authorization lands in Phase 2).
	v1.GET("/me", verifier.RequireUser(), me)
	v1.GET("/admin/ping", verifier.RequireUser(), verifier.RequireRole("admin"), adminPing)

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
