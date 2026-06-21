package inventory

// Metrics receives inventory business signals. The signature metric is the
// inventory-conflict count (oversell attempts blocked by the atomic guard).
type Metrics interface {
	IncInventoryConflict()
}

// NoopMetrics is a Metrics that records nothing (tests, or when metrics are off).
type NoopMetrics struct{}

// IncInventoryConflict does nothing.
func (NoopMetrics) IncInventoryConflict() {}
