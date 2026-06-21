package events

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// NATSBus is the default Bus, backed by NATS JetStream. The stream persists events
// and server-side dedup (Nats-Msg-Id = Event.ID, within the duplicates window)
// guards against duplicate publishes from the at-least-once outbox relay.
// Durable consumers make delivery survive worker restarts.
type NATSBus struct {
	nc     *nats.Conn
	js     jetstream.JetStream
	stream string
}

// NATSConfig configures the NATS bus.
type NATSConfig struct {
	URL        string
	StreamName string        // default "NANOCRATE"
	Subjects   []string      // default ["nanocrate.>"]
	Dedupe     time.Duration // duplicates window; default 2m
}

// NewNATSBus connects to NATS and ensures the JetStream stream exists.
func NewNATSBus(ctx context.Context, cfg NATSConfig) (*NATSBus, error) {
	if cfg.StreamName == "" {
		cfg.StreamName = "NANOCRATE"
	}
	if len(cfg.Subjects) == 0 {
		cfg.Subjects = []string{SubjectPrefix + ">"}
	}
	if cfg.Dedupe == 0 {
		cfg.Dedupe = 2 * time.Minute
	}
	nc, err := nats.Connect(cfg.URL,
		nats.MaxReconnects(-1),
		nats.ReconnectWait(time.Second),
		nats.Name("nanocrate"),
	)
	if err != nil {
		return nil, fmt.Errorf("nats connect: %w", err)
	}
	js, err := jetstream.New(nc)
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("jetstream init: %w", err)
	}
	if _, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:       cfg.StreamName,
		Subjects:   cfg.Subjects,
		Retention:  jetstream.LimitsPolicy,
		Storage:    jetstream.FileStorage,
		Duplicates: cfg.Dedupe,
		MaxAge:     7 * 24 * time.Hour,
	}); err != nil {
		nc.Close()
		return nil, fmt.Errorf("ensure stream %q: %w", cfg.StreamName, err)
	}
	return &NATSBus{nc: nc, js: js, stream: cfg.StreamName}, nil
}

// Publish sends the event to its subject with server-side dedup keyed on Event.ID.
func (b *NATSBus) Publish(ctx context.Context, e Event) error {
	data, err := json.Marshal(e)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	if _, err := b.js.Publish(ctx, e.Subject, data, jetstream.WithMsgID(e.ID)); err != nil {
		return fmt.Errorf("jetstream publish %s: %w", e.Subject, err)
	}
	return nil
}

// Subscribe binds a durable consumer to the subject filter and dispatches messages
// to h. The handler's error naks the message (NATS redelivers) — the worker layer
// adds in-process retry + DLQ so naks are only an infra-failure backstop.
func (b *NATSBus) Subscribe(ctx context.Context, subject, durable string, h Handler) (Subscription, error) {
	cons, err := b.js.CreateOrUpdateConsumer(ctx, b.stream, jetstream.ConsumerConfig{
		Durable:       durable,
		FilterSubject: subject,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    -1, // app layer decides terminal failure (DLQ); NATS just backstops
	})
	if err != nil {
		return nil, fmt.Errorf("create consumer %q: %w", durable, err)
	}
	cc, err := cons.Consume(func(msg jetstream.Msg) {
		var e Event
		if err := json.Unmarshal(msg.Data(), &e); err != nil {
			// Undecodable message: terminate it so it doesn't redeliver forever.
			_ = msg.Term()
			return
		}
		if err := h(ctx, e); err != nil {
			_ = msg.Nak()
			return
		}
		_ = msg.Ack()
	})
	if err != nil {
		return nil, fmt.Errorf("consume %q: %w", durable, err)
	}
	return &natsSub{cc: cc}, nil
}

// Close drains and closes the connection.
func (b *NATSBus) Close() error {
	if b.nc != nil {
		return b.nc.Drain()
	}
	return nil
}

type natsSub struct{ cc jetstream.ConsumeContext }

func (s *natsSub) Unsubscribe() error {
	if s.cc != nil {
		s.cc.Stop()
	}
	return nil
}
