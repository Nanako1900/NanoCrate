package logging

import "testing"

func TestNew_AllEnvironments(t *testing.T) {
	for _, env := range []string{"development", "production", ""} {
		if New(env) == nil {
			t.Errorf("New(%q) returned nil", env)
		}
	}
}
