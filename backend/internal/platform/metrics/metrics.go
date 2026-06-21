// Package metrics exposes Prometheus business metrics. The signature metric is
// the inventory-conflict counter (oversell attempts blocked by the atomic guard),
// per SPEC §9 / docs §13.
package metrics

import (
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Registry holds the app's metrics and their Prometheus registry.
type Registry struct {
	reg                *prometheus.Registry
	inventoryConflicts prometheus.Counter
	ordersPaid         prometheus.Counter
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
	reg.MustRegister(inventoryConflicts, ordersPaid)

	return &Registry{reg: reg, inventoryConflicts: inventoryConflicts, ordersPaid: ordersPaid}
}

// IncInventoryConflict records one blocked oversell attempt.
func (r *Registry) IncInventoryConflict() { r.inventoryConflicts.Inc() }

// IncOrdersPaid records one order paid.
func (r *Registry) IncOrdersPaid() { r.ordersPaid.Inc() }

// Handler returns the Gin handler serving /metrics.
func (r *Registry) Handler() gin.HandlerFunc {
	return gin.WrapH(promhttp.HandlerFor(r.reg, promhttp.HandlerOpts{}))
}
