package logging

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"go.opentelemetry.io/otel/trace"
)

func TestTraceHandler_InjectsTraceIDFromSpan(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(&traceHandler{Handler: slog.NewJSONHandler(&buf, nil)})

	tid, _ := trace.TraceIDFromHex("0123456789abcdef0123456789abcdef")
	sid, _ := trace.SpanIDFromHex("0123456789abcdef")
	sc := trace.NewSpanContext(trace.SpanContextConfig{TraceID: tid, SpanID: sid, Remote: true})
	ctx := trace.ContextWithSpanContext(context.Background(), sc)

	logger.InfoContext(ctx, "with_span")
	out := buf.String()
	if !strings.Contains(out, `"trace_id":"0123456789abcdef0123456789abcdef"`) || !strings.Contains(out, `"span_id":"0123456789abcdef"`) {
		t.Errorf("log missing trace correlation: %s", out)
	}

	buf.Reset()
	logger.Info("no_span")
	if strings.Contains(buf.String(), "trace_id") {
		t.Errorf("trace_id should be absent without a span: %s", buf.String())
	}
}
