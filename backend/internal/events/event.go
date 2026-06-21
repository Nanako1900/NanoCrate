// Package events is the EventBus port (SPEC §6): a publish/subscribe abstraction
// with a NATS JetStream default implementation and an in-memory implementation for
// tests. Producers publish via the transactional outbox relay; consumers
// (cmd/worker) subscribe with idempotent, retried, DLQ-backed handlers (SPEC §7).
package events

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
)

// Event is a normalized domain event flowing through the bus. ID is a stable,
// unique id (the outbox row id) used for at-least-once dedup; TraceParent carries
// the W3C traceparent captured when the outbox row was written, so the async
// publish/consume legs join the original (sync) producer trace.
type Event struct {
	ID          string          `json:"id"`
	Type        string          `json:"type"`
	Subject     string          `json:"subject"`
	Payload     json.RawMessage `json:"payload"`
	TraceParent string          `json:"traceparent,omitempty"`
}

// Handler processes one delivered event. Returning a non-nil error signals the
// bus to redeliver (the consumer layer adds retry/DLQ semantics on top).
type Handler func(ctx context.Context, e Event) error

// Subscription is an active subscription that can be torn down.
type Subscription interface {
	Unsubscribe() error
}

// Bus is the EventBus port. Publish is at-least-once; Subscribe delivers to a
// durable consumer so restarts don't lose events.
type Bus interface {
	Publish(ctx context.Context, e Event) error
	Subscribe(ctx context.Context, subject, durable string, h Handler) (Subscription, error)
	Close() error
}

// ErrBusClosed is returned when using a closed bus.
var ErrBusClosed = errors.New("event bus closed")

// Subjects: a stable, hierarchical namespace under "nanocrate.".
const (
	SubjectPrefix         = "nanocrate."
	SubjectAllOrders      = "nanocrate.order.>"
	SubjectOrderPlaced    = "nanocrate.order.placed"
	SubjectPaymentSucceed = "nanocrate.payment.succeeded"
	SubjectPaymentFailed  = "nanocrate.payment.failed"
)

// eventTypeSubjects maps domain event types (as written to the outbox) to subjects.
var eventTypeSubjects = map[string]string{
	"OrderPlaced":      SubjectOrderPlaced,
	"PaymentSucceeded": SubjectPaymentSucceed,
	"PaymentFailed":    SubjectPaymentFailed,
}

// SubjectFor maps a domain event type to its NATS subject. Unknown types fall
// back to a deterministic "nanocrate.event.<lower(type)>" subject.
func SubjectFor(eventType string) string {
	if s, ok := eventTypeSubjects[eventType]; ok {
		return s
	}
	return SubjectPrefix + "event." + strings.ToLower(eventType)
}

// subjectMatches implements NATS-style subject matching for the in-memory bus:
// "*" matches one token, ">" matches one or more trailing tokens.
func subjectMatches(filter, subject string) bool {
	if filter == subject {
		return true
	}
	ft := strings.Split(filter, ".")
	st := strings.Split(subject, ".")
	for i, f := range ft {
		if f == ">" {
			return i < len(st) // ">" must match at least one remaining token
		}
		if i >= len(st) {
			return false
		}
		if f == "*" {
			continue
		}
		if f != st[i] {
			return false
		}
	}
	return len(ft) == len(st)
}
