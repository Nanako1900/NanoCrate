package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

const openAIEmbeddingsURL = "https://api.openai.com/v1/embeddings"

// OpenAIEmbedder calls OpenAI's text-embedding-3-small (1536 dims). The API key
// comes from config (env), never hardcoded.
type OpenAIEmbedder struct {
	apiKey string
	model  string
	client *http.Client
}

// NewOpenAIEmbedder builds an OpenAI-backed embedder.
func NewOpenAIEmbedder(apiKey string) *OpenAIEmbedder {
	return &OpenAIEmbedder{
		apiKey: apiKey,
		model:  "text-embedding-3-small",
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

// Dim returns the embedding dimensionality.
func (o *OpenAIEmbedder) Dim() int { return Dim }

// Embed requests one embedding from OpenAI.
func (o *OpenAIEmbedder) Embed(ctx context.Context, text string) ([]float32, error) {
	body, _ := json.Marshal(map[string]any{"model": o.model, "input": text})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openAIEmbeddingsURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build embeddings request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+o.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := o.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call embeddings api: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embeddings api status %d", resp.StatusCode)
	}
	var out struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode embeddings response: %w", err)
	}
	if len(out.Data) == 0 || len(out.Data[0].Embedding) != Dim {
		return nil, fmt.Errorf("unexpected embeddings response shape")
	}
	return out.Data[0].Embedding, nil
}

// NewEmbedder selects the embedder from config: OpenAI when provider=openai and a
// key is present, otherwise the deterministic offline stub (so dev/test always run).
func NewEmbedder(provider, openAIKey string, logger *slog.Logger) Embedder {
	if provider == "openai" && openAIKey != "" {
		return NewOpenAIEmbedder(openAIKey)
	}
	if provider == "openai" && logger != nil {
		logger.Warn("EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is empty; falling back to deterministic stub embedder")
	}
	return NewStubEmbedder()
}
