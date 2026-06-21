package events

import "context"

// SpanFunc starts a span named name, linked to the W3C traceParent when non-empty,
// and returns the child context and an end function. The end function takes the
// operation's error so the span can be marked failed (nil = success). It lets the
// events package participate in tracing without importing OpenTelemetry (avoiding
// an import cycle with platform/observability, which installs the real impl).
type SpanFunc func(ctx context.Context, traceParent, name string) (context.Context, func(error))

var startSpanFn SpanFunc = func(ctx context.Context, _, _ string) (context.Context, func(error)) {
	return ctx, func(error) {}
}

// SetSpanFunc installs the span starter (called once from observability init).
func SetSpanFunc(fn SpanFunc) {
	if fn != nil {
		startSpanFn = fn
	}
}
