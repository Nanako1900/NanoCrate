package search

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"
)

// BuildText assembles the text whose embedding powers semantic search for a
// product: its name, description, and attribute keys/values. (The keyword leg's
// tsvector is a DB-generated column, independent of this.) Attribute keys are
// sorted so the text — and thus the embedding — is deterministic.
func BuildText(name, description string, attributes json.RawMessage) string {
	var b strings.Builder
	b.WriteString(name)
	b.WriteByte(' ')
	b.WriteString(description)

	var m map[string]any
	if len(attributes) > 0 && json.Unmarshal(attributes, &m) == nil {
		keys := make([]string, 0, len(m))
		for k := range m {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			b.WriteByte(' ')
			b.WriteString(k)
			switch v := m[k].(type) {
			case string:
				b.WriteByte(' ')
				b.WriteString(v)
			case bool:
				if v { // include the key again to weight "true" boolean features
					b.WriteByte(' ')
					b.WriteString(k)
				}
			case float64:
				b.WriteByte(' ')
				b.WriteString(strconv.FormatFloat(v, 'f', -1, 64))
			}
		}
	}
	return b.String()
}
