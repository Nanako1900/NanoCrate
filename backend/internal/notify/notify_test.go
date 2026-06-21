package notify

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
)

func TestLogNotifier_LogsNotification(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	n := NewLogNotifier(logger)
	if err := n.Notify(context.Background(), Notification{
		To: "a@b.com", Subject: "Order confirmed", Kind: "order_confirmation",
	}); err != nil {
		t.Fatalf("notify: %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "notification_sent") || !strings.Contains(out, "a@b.com") || !strings.Contains(out, "order_confirmation") {
		t.Errorf("log missing fields: %s", out)
	}
}

func TestNew_SelectsImplementation(t *testing.T) {
	if _, ok := New(SMTPConfig{}, slog.Default()).(*LogNotifier); !ok {
		t.Error("empty SMTP config should select LogNotifier")
	}
	if _, ok := New(SMTPConfig{Host: "smtp.example.com", Port: "587", From: "x@y.com"}, slog.Default()).(*SMTPNotifier); !ok {
		t.Error("configured SMTP host should select SMTPNotifier")
	}
}
