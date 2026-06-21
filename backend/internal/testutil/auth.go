//go:build integration

package testutil

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwa"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"

	"github.com/Nanako1900/NanoCrate/backend/internal/auth"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/config"
)

// Test OIDC identity used by the auth fixture.
const (
	TestIssuer   = "https://test.local/realms/nanocrate"
	TestAudience = "nanocrate-api"
)

// AuthFixture serves a JWKS and mints valid tokens, so HTTP integration tests can
// exercise the real auth middleware without Keycloak.
type AuthFixture struct {
	Verifier *auth.Verifier
	priv     jwk.Key
}

// NewAuthFixture spins an RSA keypair + JWKS endpoint and a matching Verifier.
func NewAuthFixture(t *testing.T) *AuthFixture {
	t.Helper()
	raw, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	pub, _ := jwk.FromRaw(raw.PublicKey)
	_ = pub.Set(jwk.KeyIDKey, "test")
	_ = pub.Set(jwk.AlgorithmKey, jwa.RS256)
	priv, _ := jwk.FromRaw(raw)
	_ = priv.Set(jwk.KeyIDKey, "test")
	_ = priv.Set(jwk.AlgorithmKey, jwa.RS256)

	set := jwk.NewSet()
	_ = set.AddKey(pub)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(set)
	}))
	t.Cleanup(srv.Close)

	verifier, err := auth.NewVerifier(context.Background(), config.Keycloak{
		Issuer:   TestIssuer,
		JWKSURL:  srv.URL,
		Audience: TestAudience,
	})
	if err != nil {
		t.Fatalf("new verifier: %v", err)
	}
	return &AuthFixture{Verifier: verifier, priv: priv}
}

// Token mints a signed JWT for the subject with the given realm roles.
func (a *AuthFixture) Token(t *testing.T, subject string, roles ...string) string {
	t.Helper()
	builder := jwt.NewBuilder().
		Issuer(TestIssuer).
		Audience([]string{TestAudience}).
		Subject(subject).
		IssuedAt(time.Now()).
		Expiration(time.Now().Add(time.Hour))
	if len(roles) > 0 {
		builder = builder.Claim("realm_access", map[string]interface{}{"roles": roles})
	}
	tok, err := builder.Build()
	if err != nil {
		t.Fatalf("build token: %v", err)
	}
	signed, err := jwt.Sign(tok, jwt.WithKey(jwa.RS256, a.priv))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return string(signed)
}
