package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lestrrat-go/jwx/v2/jwa"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"

	"github.com/Nanako1900/NanoCrate/backend/internal/platform/config"
)

func TestBearerToken(t *testing.T) {
	tests := []struct {
		name    string
		header  string
		want    string
		wantErr bool
	}{
		{"valid", "Bearer abc.def.ghi", "abc.def.ghi", false},
		{"case-insensitive scheme", "bearer xyz", "xyz", false},
		{"missing header", "", "", true},
		{"wrong scheme", "Basic abc", "", true},
		{"empty token", "Bearer ", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := bearerToken(tt.header)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

// jwksFixture spins an RSA keypair and a JWKS endpoint, returning a signer for tokens.
type jwksFixture struct {
	server  *httptest.Server
	privKey jwk.Key
}

func newJWKSFixture(t *testing.T) *jwksFixture {
	t.Helper()
	raw, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	pub, err := jwk.FromRaw(raw.PublicKey)
	if err != nil {
		t.Fatalf("public jwk: %v", err)
	}
	_ = pub.Set(jwk.KeyIDKey, "test-kid")
	_ = pub.Set(jwk.AlgorithmKey, jwa.RS256)
	priv, err := jwk.FromRaw(raw)
	if err != nil {
		t.Fatalf("private jwk: %v", err)
	}
	_ = priv.Set(jwk.KeyIDKey, "test-kid")
	_ = priv.Set(jwk.AlgorithmKey, jwa.RS256)

	set := jwk.NewSet()
	_ = set.AddKey(pub)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(set)
	}))
	t.Cleanup(srv.Close)
	return &jwksFixture{server: srv, privKey: priv}
}

const (
	testIssuer   = "http://localhost:8081/realms/nanocrate"
	testAudience = "nanocrate-api"
)

func (f *jwksFixture) sign(t *testing.T, mutate func(b *jwt.Builder) *jwt.Builder) string {
	t.Helper()
	b := jwt.NewBuilder().
		Issuer(testIssuer).
		Audience([]string{testAudience}).
		Subject("user-123").
		IssuedAt(time.Now()).
		Expiration(time.Now().Add(time.Hour))
	if mutate != nil {
		b = mutate(b)
	}
	tok, err := b.Build()
	if err != nil {
		t.Fatalf("build token: %v", err)
	}
	signed, err := jwt.Sign(tok, jwt.WithKey(jwa.RS256, f.privKey))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return string(signed)
}

func (f *jwksFixture) verifier(t *testing.T) *Verifier {
	t.Helper()
	v, err := NewVerifier(context.Background(), config.Keycloak{
		Issuer:   testIssuer,
		JWKSURL:  f.server.URL,
		Audience: testAudience,
	})
	if err != nil {
		t.Fatalf("new verifier: %v", err)
	}
	return v
}

func newTestRouter(v *Verifier) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/me", v.RequireUser(), func(c *gin.Context) {
		p, _ := PrincipalFromContext(c.Request.Context())
		c.JSON(http.StatusOK, gin.H{"sub": p.Subject, "roles": p.Roles})
	})
	r.GET("/admin", v.RequireUser(), v.RequireRole("admin"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	return r
}

func doGet(r *gin.Engine, path, authz string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if authz != "" {
		req.Header.Set("Authorization", authz)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestRequireUser_ValidToken(t *testing.T) {
	f := newJWKSFixture(t)
	r := newTestRouter(f.verifier(t))
	token := f.sign(t, func(b *jwt.Builder) *jwt.Builder {
		return b.Claim("realm_access", map[string]interface{}{"roles": []string{"admin", "user"}})
	})
	w := doGet(r, "/me", "Bearer "+token)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"sub":"user-123"`) {
		t.Errorf("missing subject: %s", w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "admin") {
		t.Errorf("missing roles: %s", w.Body.String())
	}
}

func TestRequireUser_Rejections(t *testing.T) {
	f := newJWKSFixture(t)
	r := newTestRouter(f.verifier(t))

	tests := []struct {
		name  string
		authz string
	}{
		{"no token", ""},
		{"garbage token", "Bearer not-a-jwt"},
		{"wrong audience", "Bearer " + f.sign(t, func(b *jwt.Builder) *jwt.Builder {
			return b.Audience([]string{"someone-else"})
		})},
		{"wrong issuer", "Bearer " + f.sign(t, func(b *jwt.Builder) *jwt.Builder {
			return b.Issuer("http://evil/realms/x")
		})},
		{"expired", "Bearer " + f.sign(t, func(b *jwt.Builder) *jwt.Builder {
			return b.Expiration(time.Now().Add(-2 * time.Hour))
		})},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := doGet(r, "/me", tt.authz)
			if w.Code != http.StatusUnauthorized {
				t.Errorf("status = %d, want 401, body = %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestRequireRole(t *testing.T) {
	f := newJWKSFixture(t)
	r := newTestRouter(f.verifier(t))

	adminTok := f.sign(t, func(b *jwt.Builder) *jwt.Builder {
		return b.Claim("realm_access", map[string]interface{}{"roles": []string{"admin"}})
	})
	if w := doGet(r, "/admin", "Bearer "+adminTok); w.Code != http.StatusOK {
		t.Errorf("admin role: status = %d, want 200, body = %s", w.Code, w.Body.String())
	}

	userTok := f.sign(t, func(b *jwt.Builder) *jwt.Builder {
		return b.Claim("realm_access", map[string]interface{}{"roles": []string{"user"}})
	})
	if w := doGet(r, "/admin", "Bearer "+userTok); w.Code != http.StatusForbidden {
		t.Errorf("non-admin: status = %d, want 403, body = %s", w.Code, w.Body.String())
	}
}
