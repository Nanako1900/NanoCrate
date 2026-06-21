// Package logging configures the standard library slog JSON logger (docs/backend.md §13).
package logging

import (
	"log/slog"
	"os"
)

// New returns a JSON slog logger. In development the level is Debug, otherwise Info.
func New(appEnv string) *slog.Logger {
	level := slog.LevelInfo
	if appEnv == "development" || appEnv == "" {
		level = slog.LevelDebug
	}
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	return slog.New(handler)
}
