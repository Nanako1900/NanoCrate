// Package notify is the Notifier port (SPEC §6): outbound notifications behind one
// interface. Default implementation logs (LogNotifier); an SMTP implementation is
// selected when SMTP is configured. The worker sends order-confirmation emails
// from consumed events.
package notify

import (
	"context"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
)

// Notification is one outbound message.
type Notification struct {
	To      string
	Subject string
	Body    string
	Kind    string // e.g. "order_confirmation"
}

// Notifier sends notifications (email / webhook / in-app). Default: Stripe-free,
// offline LogNotifier.
type Notifier interface {
	Notify(ctx context.Context, n Notification) error
}

// LogNotifier writes a structured log line instead of sending — the zero-cost
// default for dev and tests.
type LogNotifier struct{ logger *slog.Logger }

// NewLogNotifier builds a LogNotifier (defaults to slog.Default when logger is nil).
func NewLogNotifier(logger *slog.Logger) *LogNotifier {
	if logger == nil {
		logger = slog.Default()
	}
	return &LogNotifier{logger: logger}
}

// Notify logs the notification.
func (n *LogNotifier) Notify(ctx context.Context, m Notification) error {
	n.logger.InfoContext(ctx, "notification_sent",
		slog.String("channel", "log"), slog.String("kind", m.Kind),
		slog.String("to", m.To), slog.String("subject", m.Subject))
	return nil
}

// SMTPConfig configures the SMTP notifier.
type SMTPConfig struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
}

// SMTPNotifier sends email via SMTP.
type SMTPNotifier struct{ cfg SMTPConfig }

// NewSMTPNotifier builds an SMTP notifier.
func NewSMTPNotifier(cfg SMTPConfig) *SMTPNotifier { return &SMTPNotifier{cfg: cfg} }

// Notify sends the notification as a plain-text email.
func (n *SMTPNotifier) Notify(_ context.Context, m Notification) error {
	addr := n.cfg.Host + ":" + n.cfg.Port
	var auth smtp.Auth
	if n.cfg.Username != "" {
		auth = smtp.PlainAuth("", n.cfg.Username, n.cfg.Password, n.cfg.Host)
	}
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", n.cfg.From)
	fmt.Fprintf(&b, "To: %s\r\n", m.To)
	fmt.Fprintf(&b, "Subject: %s\r\n", m.Subject)
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n\r\n")
	b.WriteString(m.Body)
	if err := smtp.SendMail(addr, auth, n.cfg.From, []string{m.To}, []byte(b.String())); err != nil {
		return fmt.Errorf("smtp send to %s: %w", m.To, err)
	}
	return nil
}

// New returns an SMTP notifier when a host is configured, otherwise the LogNotifier.
func New(cfg SMTPConfig, logger *slog.Logger) Notifier {
	if strings.TrimSpace(cfg.Host) != "" {
		return NewSMTPNotifier(cfg)
	}
	return NewLogNotifier(logger)
}
