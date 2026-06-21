package events

import (
	"context"
	"sync"
)

// MemoryBus is an in-process Bus for tests and local single-binary runs. Publish
// dispatches synchronously to every subscriber whose filter matches, and records
// published events for assertions. It is safe for concurrent use.
type MemoryBus struct {
	mu        sync.Mutex
	closed    bool
	subs      []*memSub
	published []Event
}

// NewMemoryBus returns an empty in-memory bus.
func NewMemoryBus() *MemoryBus { return &MemoryBus{} }

type memSub struct {
	bus     *MemoryBus
	subject string
	handler Handler
}

func (s *memSub) Unsubscribe() error {
	s.bus.mu.Lock()
	defer s.bus.mu.Unlock()
	for i, sub := range s.bus.subs {
		if sub == s {
			s.bus.subs = append(s.bus.subs[:i], s.bus.subs[i+1:]...)
			break
		}
	}
	return nil
}

// Publish records the event and delivers it to all matching subscribers. A
// handler error is returned to the publisher (tests can assert delivery failures);
// in production the relay treats publish as fire-and-mark.
func (b *MemoryBus) Publish(ctx context.Context, e Event) error {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return ErrBusClosed
	}
	b.published = append(b.published, e)
	matched := make([]Handler, 0, len(b.subs))
	for _, s := range b.subs {
		if subjectMatches(s.subject, e.Subject) {
			matched = append(matched, s.handler)
		}
	}
	b.mu.Unlock()

	for _, h := range matched {
		if err := h(ctx, e); err != nil {
			return err
		}
	}
	return nil
}

// Subscribe registers a handler for a subject filter (durable is ignored in-memory).
func (b *MemoryBus) Subscribe(_ context.Context, subject, _ string, h Handler) (Subscription, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return nil, ErrBusClosed
	}
	s := &memSub{bus: b, subject: subject, handler: h}
	b.subs = append(b.subs, s)
	return s, nil
}

// Close marks the bus closed.
func (b *MemoryBus) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.closed = true
	return nil
}

// Published returns a copy of all events published so far (test helper).
func (b *MemoryBus) Published() []Event {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]Event, len(b.published))
	copy(out, b.published)
	return out
}
