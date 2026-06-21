package config

import (
	"strings"
	"testing"
)

func TestLoad_MissingRequiredListsAll(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("KEYCLOAK_ISSUER", "")
	t.Setenv("KEYCLOAK_JWKS_URL", "")
	t.Setenv("KEYCLOAK_AUDIENCE", "")

	_, err := Load()
	if err == nil {
		t.Fatal("expected fail-fast error, got nil")
	}
	for _, want := range []string{"DATABASE_URL", "KEYCLOAK_ISSUER", "KEYCLOAK_JWKS_URL", "KEYCLOAK_AUDIENCE"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error should mention %s: %v", want, err)
		}
	}
}

func TestLoad_AppliesDefaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://nano:nano@localhost:5432/nanocrate")
	t.Setenv("KEYCLOAK_ISSUER", "http://localhost:8081/realms/nanocrate")
	t.Setenv("KEYCLOAK_JWKS_URL", "http://localhost:8081/realms/nanocrate/protocol/openid-connect/certs")
	t.Setenv("KEYCLOAK_AUDIENCE", "nanocrate-api")
	t.Setenv("APP_ENV", "")
	t.Setenv("HTTP_PORT", "")
	t.Setenv("NATS_URL", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.AppEnv != "development" {
		t.Errorf("AppEnv default = %q, want development", cfg.AppEnv)
	}
	if cfg.HTTPPort != "8080" {
		t.Errorf("HTTPPort default = %q, want 8080", cfg.HTTPPort)
	}
	if cfg.NATSURL != "nats://localhost:4222" {
		t.Errorf("NATSURL default = %q", cfg.NATSURL)
	}
	if cfg.Keycloak.Audience != "nanocrate-api" {
		t.Errorf("audience = %q", cfg.Keycloak.Audience)
	}
}

func TestLoad_OverridesDefaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("KEYCLOAK_ISSUER", "iss")
	t.Setenv("KEYCLOAK_JWKS_URL", "jwks")
	t.Setenv("KEYCLOAK_AUDIENCE", "aud")
	t.Setenv("APP_ENV", "production")
	t.Setenv("HTTP_PORT", "9090")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.AppEnv != "production" || cfg.HTTPPort != "9090" {
		t.Errorf("overrides not applied: %+v", cfg)
	}
}
