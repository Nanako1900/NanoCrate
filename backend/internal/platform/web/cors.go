package web

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// corsAllowHeaders / corsAllowMethods are the credentialed CORS allowances (docs §9.2.1).
const (
	corsAllowHeaders = "Authorization, Content-Type, Idempotency-Key, " + HeaderRequestID
	corsAllowMethods = "GET, POST, PATCH, DELETE, OPTIONS"
)

// CORS returns a credentialed CORS middleware (docs §9.2.1). It echoes the request
// Origin only when it is on the allowlist — never "*", which is illegal with
// credentials — sets Allow-Credentials/Headers/Methods, exposes the request id,
// and answers preflight OPTIONS with 204. `Vary: Origin` is always set so a shared
// cache never serves one origin's CORS decision to another.
func CORS(allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = struct{}{}
	}
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Add("Vary", "Origin")
		origin := c.GetHeader("Origin")
		if _, ok := allowed[origin]; ok && origin != "" {
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Set("Access-Control-Allow-Headers", corsAllowHeaders)
			h.Set("Access-Control-Allow-Methods", corsAllowMethods)
			h.Set("Access-Control-Expose-Headers", HeaderRequestID)
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
