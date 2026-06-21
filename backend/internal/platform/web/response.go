// Package web holds HTTP cross-cutting helpers: the unified response envelope,
// error codes, and Gin middleware. It is the only place that knows the wire shape
// of API responses (docs/backend.md §9.1).
package web

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Envelope is the unified response shape for every endpoint (docs/backend.md §9.1):
//
//	{ "success": true,  "data": <payload>, "error": null, "meta": <optional> }
//	{ "success": false, "data": null,      "error": { "code", "message" } }
type Envelope struct {
	Success bool      `json:"success"`
	Data    any       `json:"data"`
	Error   *APIError `json:"error"`
	Meta    any       `json:"meta,omitempty"`
}

// APIError is the error payload carried by a failed response.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// PageMeta is the pagination metadata returned for list endpoints.
type PageMeta struct {
	Total int64 `json:"total"`
	Page  int   `json:"page"`
	Limit int   `json:"limit"`
}

// Canonical error codes (docs/backend.md §9.1).
const (
	CodeUnauthorized     = "unauthorized"
	CodeForbidden        = "forbidden"
	CodeNotFound         = "not_found"
	CodeValidationFailed = "validation_failed"
	CodeConflict         = "conflict"
	CodeOutOfStock       = "out_of_stock"
	CodeInternal         = "internal"
)

// OK writes a 200 success envelope.
func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Envelope{Success: true, Data: data})
}

// OKWithMeta writes a 200 success envelope carrying pagination/metadata.
func OKWithMeta(c *gin.Context, data any, meta any) {
	c.JSON(http.StatusOK, Envelope{Success: true, Data: data, Meta: meta})
}

// Fail writes a failure envelope with the given HTTP status and error code.
func Fail(c *gin.Context, status int, code, message string) {
	c.JSON(status, Envelope{Success: false, Error: &APIError{Code: code, Message: message}})
}

// AbortFail writes a failure envelope and aborts the middleware chain.
func AbortFail(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, Envelope{Success: false, Error: &APIError{Code: code, Message: message}})
}
