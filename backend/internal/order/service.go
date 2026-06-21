// Package order serves a user's own orders (contract §9.4). Order items are
// purchase-time snapshots (sku/name/price frozen at checkout).
package order

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	orderdb "github.com/Nanako1900/NanoCrate/backend/internal/order/db"
)

const (
	defaultLimit = 20
	maxLimit     = 100
	maxOffset    = 1_000_000
)

// ErrOrderNotFound means the order does not exist or is not owned by the caller.
var ErrOrderNotFound = errors.New("order not found")

// Service reads orders for the authenticated user.
type Service struct {
	q *orderdb.Queries
}

// NewService builds an order service.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{q: orderdb.New(pool)}
}

// List returns a page of the user's orders plus the total count.
func (s *Service) List(ctx context.Context, userID string, page, limit int) ([]orderdb.ListOrdersByUserRow, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	offset := (page - 1) * limit
	if offset > maxOffset {
		offset = maxOffset
	}
	rows, err := s.q.ListOrdersByUser(ctx, orderdb.ListOrdersByUserParams{
		UserID: userID,
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list orders: %w", err)
	}
	total, err := s.q.CountOrdersByUser(ctx, userID)
	if err != nil {
		return nil, 0, fmt.Errorf("count orders: %w", err)
	}
	return rows, total, nil
}

// Get returns one order (owned by userID) with its snapshot items.
func (s *Service) Get(ctx context.Context, userID string, orderID uuid.UUID) (orderdb.Order, []orderdb.OrderItem, error) {
	o, err := s.q.GetOrderForUser(ctx, orderdb.GetOrderForUserParams{ID: orderID, UserID: userID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return orderdb.Order{}, nil, ErrOrderNotFound
		}
		return orderdb.Order{}, nil, fmt.Errorf("get order: %w", err)
	}
	items, err := s.q.ListOrderItems(ctx, orderID)
	if err != nil {
		return orderdb.Order{}, nil, fmt.Errorf("list order items: %w", err)
	}
	return o, items, nil
}
