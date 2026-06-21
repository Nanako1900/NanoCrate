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
	OTLPEndpoint        string   // OTEL_EXPORTER_OTLP_ENDPOINT (host:port); empty = no exporter
	CORSAllowedOrigins  []string // credentialed CORS allowlist (docs §9.2.1)
	SMTP                SMTP
}

// Keycloak holds the OIDC Resource Server settings (signature + iss/aud validation).
type Keycloak struct {
	Issuer   string
	JWKSURL  string
	Audience string
}

// SMTP holds optional outbound-email settings. Empty Host selects the LogNotifier.
type SMTP struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
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
		OTLPEndpoint:        os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
		CORSAllowedOrigins:  splitCSV(getDefault("CORS_ALLOWED_ORIGINS", "http://localhost:5173")),
		SMTP: SMTP{
			Host:     os.Getenv("SMTP_HOST"),
			Port:     getDefault("SMTP_PORT", "1025"),
			Username: os.Getenv("SMTP_USERNAME"),
			Password: os.Getenv("SMTP_PASSWORD"),
			From:     getDefault("SMTP_FROM", "no-reply@nanocrate.local"),
		},
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

// splitCSV splits a comma-separated list, trimming spaces and dropping empties.
func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
