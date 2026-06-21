package events

import "context"

// SpanFunc starts a span named name, linked to the W3C traceParent when non-empty,
// and returns the child context and an end function. It lets the events package
// participate in tracing without importing OpenTelemetry (avoiding an import cycle
// with platform/observability, which installs the real implementation).
type SpanFunc func(ctx context.Context, traceParent, name string) (context.Context, func())

var startSpanFn SpanFunc = func(ctx context.Context, _, _ string) (context.Context, func()) {
	return ctx, func() {}
}

// SetSpanFunc installs the span starter (called once from observability init).
func SetSpanFunc(fn SpanFunc) {
	if fn != nil {
		startSpanFn = fn
	}
}
