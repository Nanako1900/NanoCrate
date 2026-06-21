// Package logging configures the standard library slog JSON logger (docs/backend.md §13):
// JSON output, dev/prod levels, and automatic trace_id/span_id correlation from the
// active OpenTelemetry span in each log record's context.
package logging

import (
	"context"
	"log/slog"
	"os"

	"go.opentelemetry.io/otel/trace"
)

// New returns a JSON slog logger that injects trace_id/span_id when the record's
// context carries an active span. In development the level is Debug, else Info.
func New(appEnv string) *slog.Logger {
	level := slog.LevelInfo
	if appEnv == "development" || appEnv == "" {
		level = slog.LevelDebug
	}
	base := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	return slog.New(&traceHandler{Handler: base})
}

// traceHandler decorates each record with trace_id/span_id from the active span,
// so logs and Jaeger traces pivot to each other (docs §13 / SPEC §9).
type traceHandler struct{ slog.Handler }

func (h *traceHandler) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.HasTraceID() {
		r.AddAttrs(slog.String("trace_id", sc.TraceID().String()))
		if sc.HasSpanID() {
			r.AddAttrs(slog.String("span_id", sc.SpanID().String()))
		}
	}
	return h.Handler.Handle(ctx, r)
}

func (h *traceHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &traceHandler{Handler: h.Handler.WithAttrs(attrs)}
}

func (h *traceHandler) WithGroup(name string) slog.Handler {
	return &traceHandler{Handler: h.Handler.WithGroup(name)}
}
