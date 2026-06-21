package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRegistry_ExposesCounters(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := New()
	r.IncInventoryConflict()
	r.IncInventoryConflict()
	r.IncOrdersPaid()

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/metrics", nil)
	r.Handler()(c)

	body := w.Body.String()
	if !strings.Contains(body, "nanocrate_inventory_conflicts_total 2") {
		t.Errorf("inventory conflicts not 2:\n%s", body)
	}
	if !strings.Contains(body, "nanocrate_orders_paid_total 1") {
		t.Errorf("orders paid not 1:\n%s", body)
	}
}
