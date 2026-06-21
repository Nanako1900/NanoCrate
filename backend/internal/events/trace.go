package events

import "context"

// traceIDFromContext returns the active trace id for async trace linking. It is a
// no-op until OpenTelemetry is wired (P3a-6), where it returns the span's trace id
// so producer→NATS→consumer joins one trace.
func traceIDFromContext(ctx context.Context) string {
	return traceIDFn(ctx)
}

// traceIDFn is swapped to an OTel-backed implementation at startup; default empty.
var traceIDFn = func(context.Context) string { return "" }

// SetTraceIDFunc installs the trace-id extractor (called once from observability init).
func SetTraceIDFunc(fn func(context.Context) string) {
	if fn != nil {
		traceIDFn = fn
	}
}
