// Package config loads runtime configuration from the environment and fails fast
// when a required value is missing (docs/backend.md §6). Secrets never get hardcoded.
package config

import (
	"fmt"
	"os"
	"strings"
)

// Config is the fully-resolved application configuration.
type Config struct {
	AppEnv              string
	HTTPPort            string
	DatabaseURL         string
	Keycloak            Keycloak
	StripeSecretKey     string
	StripeWebhookSecret string
	NATSURL             string
}

// Keycloak holds the OIDC Resource Server settings (signature + iss/aud validation).
type Keycloak struct {
	Issuer   string
	JWKSURL  string
	Audience string
}

// Load reads configuration from the environment, applying defaults for optional
// values and returning an error listing every missing required variable.
func Load() (Config, error) {
	cfg := Config{
		AppEnv:   getDefault("APP_ENV", "development"),
		HTTPPort: getDefault("HTTP_PORT", "8080"),
		Keycloak: Keycloak{
			Issuer:   os.Getenv("KEYCLOAK_ISSUER"),
			JWKSURL:  os.Getenv("KEYCLOAK_JWKS_URL"),
			Audience: os.Getenv("KEYCLOAK_AUDIENCE"),
		},
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		StripeSecretKey:     os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret: os.Getenv("STRIPE_WEBHOOK_SECRET"),
		NATSURL:             getDefault("NATS_URL", "nats://localhost:4222"),
	}

	required := []struct {
		name  string
		value string
	}{
		{"DATABASE_URL", cfg.DatabaseURL},
		{"KEYCLOAK_ISSUER", cfg.Keycloak.Issuer},
		{"KEYCLOAK_JWKS_URL", cfg.Keycloak.JWKSURL},
		{"KEYCLOAK_AUDIENCE", cfg.Keycloak.Audience},
	}
	var missing []string
	for _, r := range required {
		if strings.TrimSpace(r.value) == "" {
			missing = append(missing, r.name)
		}
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}
	return cfg, nil
}

func getDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
