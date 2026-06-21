// Package metrics exposes Prometheus business metrics. The signature metric is
// the inventory-conflict counter (oversell attempts blocked by the atomic guard),
// per SPEC §9 / docs §13.
package metrics

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Registry holds the app's metrics and their Prometheus registry.
type Registry struct {
	reg                  *prometheus.Registry
	inventoryConflicts   prometheus.Counter
	ordersPaid           prometheus.Counter
	checkoutFailures     *prometheus.CounterVec
	eventsConsumed       *prometheus.CounterVec
	eventConsumeFailures *prometheus.CounterVec
	deadLetters          *prometheus.CounterVec
	dlqDepth             prometheus.Gauge
}

// New builds a registry with the app counters plus Go/process collectors.
func New() *Registry {
	reg := prometheus.NewRegistry()
	reg.MustRegister(collectors.NewGoCollector())
	reg.MustRegister(collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))

	inventoryConflicts := prometheus.NewCounter(prometheus.CounterOpts{
		Name: "nanocrate_inventory_conflicts_total",
		Help: "Reservations rejected because stock was insufficient (oversell prevented).",
	})
	ordersPaid := prometheus.NewCounter(prometheus.CounterOpts{
		Name: "nanocrate_orders_paid_total",
		Help: "Orders transitioned to paid via the payment webhook.",
	})
	checkoutFailures := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "nanocrate_checkout_failures_total",
		Help: "Checkout attempts that failed, by reason.",
	}, []string{"reason"})
	eventsConsumed := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "nanocrate_events_consumed_total",
		Help: "Events successfully consumed, by consumer and event type.",
	}, []string{"consumer", "event_type"})
	eventConsumeFailures := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "nanocrate_event_consume_failures_total",
		Help: "Events that exhausted retries and were dead-lettered, by consumer and event type.",
	}, []string{"consumer", "event_type"})
	deadLetters := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "nanocrate_dead_letters_total",
		Help: "Events written to the dead-letter queue, by consumer and event type.",
	}, []string{"consumer", "event_type"})
	dlqDepth := prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "nanocrate_dlq_depth",
		Help: "Current number of rows in the dead-letter queue.",
	})
	reg.MustRegister(inventoryConflicts, ordersPaid, checkoutFailures,
		eventsConsumed, eventConsumeFailures, deadLetters, dlqDepth)

	return &Registry{
		reg:                  reg,
		inventoryConflicts:   inventoryConflicts,
		ordersPaid:           ordersPaid,
		checkoutFailures:     checkoutFailures,
		eventsConsumed:       eventsConsumed,
		eventConsumeFailures: eventConsumeFailures,
		deadLetters:          deadLetters,
		dlqDepth:             dlqDepth,
	}
}

// IncInventoryConflict records one blocked oversell attempt.
func (r *Registry) IncInventoryConflict() { r.inventoryConflicts.Inc() }

// IncOrdersPaid records one order paid.
func (r *Registry) IncOrdersPaid() { r.ordersPaid.Inc() }

// IncCheckoutFailure records one failed checkout, labeled by reason.
func (r *Registry) IncCheckoutFailure(reason string) {
	r.checkoutFailures.WithLabelValues(reason).Inc()
}

// IncEventConsumed records one successfully consumed event.
func (r *Registry) IncEventConsumed(consumer, eventType string) {
	r.eventsConsumed.WithLabelValues(consumer, eventType).Inc()
}

// IncEventConsumeFailure records one event that exhausted retries.
func (r *Registry) IncEventConsumeFailure(consumer, eventType string) {
	r.eventConsumeFailures.WithLabelValues(consumer, eventType).Inc()
}

// IncDeadLetter records one event written to the DLQ.
func (r *Registry) IncDeadLetter(consumer, eventType string) {
	r.deadLetters.WithLabelValues(consumer, eventType).Inc()
}

// SetDLQDepth sets the current dead-letter queue depth gauge.
func (r *Registry) SetDLQDepth(n float64) { r.dlqDepth.Set(n) }

// Handler returns the Gin handler serving /metrics.
func (r *Registry) Handler() gin.HandlerFunc {
	return gin.WrapH(promhttp.HandlerFor(r.reg, promhttp.HandlerOpts{}))
}

// HTTPHandler returns a plain net/http handler for /metrics (used by the worker,
// which has no Gin engine).
func (r *Registry) HTTPHandler() http.Handler {
	return promhttp.HandlerFor(r.reg, promhttp.HandlerOpts{})
}
