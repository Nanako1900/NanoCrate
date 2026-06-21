// Package auth implements the Keycloak OIDC Resource Server side: it only verifies
// JWTs (JWKS signature + iss/aud/exp) and maps realm roles to RBAC middleware.
// The backend stays stateless and never stores passwords (docs/backend.md §10).
package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"

	"github.com/Nanako1900/NanoCrate/backend/internal/platform/config"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/web"
)

type principalCtxKey struct{}

// Principal is the authenticated caller extracted from a verified token.
type Principal struct {
	Subject  string
	Username string
	Email    string
	Roles    []string
}

// HasRole reports whether the principal carries the given realm role.
func (p Principal) HasRole(role string) bool {
	for _, r := range p.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// Verifier validates Keycloak-issued JWTs. The JWKS is fetched lazily and cached
// (auto-refresh), so application startup does not depend on Keycloak being up.
type Verifier struct {
	cache    *jwk.Cache
	jwksURL  string
	issuer   string
	audience string
}

var errNoToken = errors.New("missing bearer token")

// NewVerifier registers the JWKS endpoint with a refreshing cache. No network
// call happens here; keys are fetched on first use.
func NewVerifier(ctx context.Context, cfg config.Keycloak) (*Verifier, error) {
	cache := jwk.NewCache(ctx)
	if err := cache.Register(cfg.JWKSURL, jwk.WithMinRefreshInterval(15*time.Minute)); err != nil {
		return nil, fmt.Errorf("register jwks endpoint: %w", err)
	}
	return &Verifier{
		cache:    cache,
		jwksURL:  cfg.JWKSURL,
		issuer:   cfg.Issuer,
		audience: cfg.Audience,
	}, nil
}

// RequireUser is middleware that rejects requests without a valid token and
// injects the resolved Principal into the request context.
func (v *Verifier) RequireUser() gin.HandlerFunc {
	return func(c *gin.Context) {
		principal, err := v.authenticate(c.Request)
		if err != nil {
			web.AbortFail(c, http.StatusUnauthorized, web.CodeUnauthorized, "invalid or missing access token")
			return
		}
		ctx := context.WithValue(c.Request.Context(), principalCtxKey{}, principal)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

// RequireRole is middleware that enforces a realm role. It must run after RequireUser.
func (v *Verifier) RequireRole(role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		principal, ok := PrincipalFromContext(c.Request.Context())
		if !ok {
			web.AbortFail(c, http.StatusUnauthorized, web.CodeUnauthorized, "authentication required")
			return
		}
		if !principal.HasRole(role) {
			web.AbortFail(c, http.StatusForbidden, web.CodeForbidden, "insufficient role")
			return
		}
		c.Next()
	}
}

func (v *Verifier) authenticate(r *http.Request) (Principal, error) {
	raw, err := bearerToken(r.Header.Get("Authorization"))
	if err != nil {
		return Principal{}, err
	}
	set, err := v.cache.Get(r.Context(), v.jwksURL)
	if err != nil {
		return Principal{}, fmt.Errorf("fetch jwks: %w", err)
	}
	token, err := jwt.Parse([]byte(raw),
		jwt.WithKeySet(set),
		jwt.WithValidate(true),
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience(v.audience),
		jwt.WithAcceptableSkew(30*time.Second),
	)
	if err != nil {
		return Principal{}, fmt.Errorf("verify token: %w", err)
	}
	return principalFromToken(token), nil
}

// PrincipalFromContext returns the Principal injected by RequireUser, if present.
func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalCtxKey{}).(Principal)
	return p, ok
}

func bearerToken(header string) (string, error) {
	if header == "" {
		return "", errNoToken
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") || strings.TrimSpace(parts[1]) == "" {
		return "", errNoToken
	}
	return strings.TrimSpace(parts[1]), nil
}

func principalFromToken(token jwt.Token) Principal {
	p := Principal{Subject: token.Subject()}
	if v, ok := token.Get("preferred_username"); ok {
		if s, ok := v.(string); ok {
			p.Username = s
		}
	}
	if v, ok := token.Get("email"); ok {
		if s, ok := v.(string); ok {
			p.Email = s
		}
	}
	p.Roles = extractRealmRoles(token)
	return p
}

// extractRealmRoles pulls realm_access.roles ([]string) from a Keycloak token.
func extractRealmRoles(token jwt.Token) []string {
	claim, ok := token.Get("realm_access")
	if !ok {
		return nil
	}
	realm, ok := claim.(map[string]interface{})
	if !ok {
		return nil
	}
	rawRoles, ok := realm["roles"].([]interface{})
	if !ok {
		return nil
	}
	roles := make([]string, 0, len(rawRoles))
	for _, r := range rawRoles {
		if s, ok := r.(string); ok {
			roles = append(roles, s)
		}
	}
	return roles
}
