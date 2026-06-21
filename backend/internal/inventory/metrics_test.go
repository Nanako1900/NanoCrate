package inventory

import "testing"

func TestNoopMetrics(t *testing.T) {
	var m Metrics = NoopMetrics{}
	m.IncInventoryConflict() // must not panic and satisfies the interface
}
