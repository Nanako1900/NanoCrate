// Package observability wires OpenTelemetry tracing (SPEC §9): W3C propagation, an
// OTLP/gRPC exporter (to Jaeger), and the events span hook so the async
// outbox→NATS→consumer legs join the original synchronous request trace.
package observability

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"

	"github.com/Nanako1900/NanoCrate/backend/internal/events"
)

const tracerName = "github.com/Nanako1900/NanoCrate/backend"

// InitTracer installs W3C propagation and the events span hook, and — when
// endpoint != "" — an OTLP/gRPC tracer provider exporting to a collector/Jaeger.
// With an empty endpoint it stays propagation-only (no exporter), so the app runs
// without an observability backend. Always returns a non-nil shutdown func.
func InitTracer(ctx context.Context, serviceName, endpoint string) (func(context.Context) error, error) {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{}, propagation.Baggage{}))
	events.SetSpanFunc(startEventSpan)

	if endpoint == "" {
		return func(context.Context) error { return nil }, nil
	}
	exp, err := otlptracegrpc.New(ctx, otlptracegrpc.WithEndpoint(endpoint), otlptracegrpc.WithInsecure())
	if err != nil {
		return nil, fmt.Errorf("otlp trace exporter: %w", err)
	}
	res, err := resource.New(ctx, resource.WithAttributes(attribute.String("service.name", serviceName)))
	if err != nil {
		return nil, fmt.Errorf("otel resource: %w", err)
	}
	tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(exp), sdktrace.WithResource(res))
	otel.SetTracerProvider(tp)
	return tp.Shutdown, nil
}

// TraceParent serializes the active span context to a W3C traceparent for
// persistence (e.g. on an outbox row). Empty when there is no active span.
func TraceParent(ctx context.Context) string {
	carrier := propagation.MapCarrier{}
	otel.GetTextMapPropagator().Inject(ctx, carrier)
	return carrier.Get("traceparent")
}

// StartSpan opens a child span on the current trace (for service/repo layers).
func StartSpan(ctx context.Context, name string) (context.Context, func()) {
	ctx, span := otel.Tracer(tracerName).Start(ctx, name)
	return ctx, func() { span.End() }
}

// startEventSpan is installed into the events package: it starts a span linked to
// the persisted traceParent so publish/consume join the producer's trace. The end
// func records the operation's error (a failed publish or a dead-lettered event)
// so failures are visible in Jaeger, not indistinguishable from successes.
func startEventSpan(ctx context.Context, traceParent, name string) (context.Context, func(error)) {
	if traceParent != "" {
		ctx = otel.GetTextMapPropagator().Extract(ctx, propagation.MapCarrier{"traceparent": traceParent})
	}
	ctx, span := otel.Tracer(tracerName).Start(ctx, name)
	return ctx, func(err error) {
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
		}
		span.End()
	}
}
