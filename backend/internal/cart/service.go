package cart

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	cartdb "github.com/Nanako1900/NanoCrate/backend/internal/cart/db"
)

const defaultCurrency = "USD"

// Session identifies whose cart to resolve: a logged-in user (UserID) and/or a
// guest cookie cart id.
type Session struct {
	UserID       *string
	CookieCartID *uuid.UUID
}

// Service holds cart business logic over the database.
type Service struct {
	pool *pgxpool.Pool
	q    *cartdb.Queries
}

// NewService builds a cart service.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: cartdb.New(pool)}
}

// Resolve returns the active cart id for the session, creating one if needed.
// setCookie is non-Nil when the caller should persist a new guest cart cookie.
func (s *Service) Resolve(ctx context.Context, sess Session) (cartID uuid.UUID, setCookie uuid.UUID, err error) {
	if sess.UserID != nil {
		return s.resolveUserCart(ctx, sess.UserID)
	}
	if sess.CookieCartID != nil {
		if c, err := s.q.GetCart(ctx, *sess.CookieCartID); err == nil && c.Status == "active" {
			return c.ID, uuid.Nil, nil
		}
	}
	created, err := s.q.CreateCart(ctx, cartdb.CreateCartParams{Currency: defaultCurrency})
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("create guest cart: %w", err)
	}
	return created.ID, created.ID, nil
}

func (s *Service) resolveUserCart(ctx context.Context, userID *string) (uuid.UUID, uuid.UUID, error) {
	existing, err := s.q.GetActiveCartByUser(ctx, userID)
	if err == nil {
		return existing.ID, uuid.Nil, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, uuid.Nil, fmt.Errorf("get user cart: %w", err)
	}
	created, err := s.q.CreateCart(ctx, cartdb.CreateCartParams{UserID: userID, Currency: defaultCurrency})
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("create user cart: %w", err)
	}
	return created.ID, uuid.Nil, nil
}

// AddItem adds (or accumulates) a variant in the cart.
func (s *Service) AddItem(ctx context.Context, cartID, variantID uuid.UUID, qty int32) error {
	_, err := s.q.UpsertCartItem(ctx, cartdb.UpsertCartItemParams{CartID: cartID, VariantID: variantID, Qty: qty})
	if isForeignKeyViolation(err) {
		return ErrVariantNotFound
	}
	if isCheckViolation(err) {
		// The accumulating upsert pushed the running total above the cap (B9).
		return ErrQtyTooLarge
	}
	if err != nil {
		return fmt.Errorf("upsert cart item: %w", err)
	}
	return nil
}

// UpdateItem sets the quantity of a cart item that must belong to the cart.
func (s *Service) UpdateItem(ctx context.Context, cartID, itemID uuid.UUID, qty int32) error {
	item, err := s.q.GetCartItem(ctx, itemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrItemNotFound
		}
		return fmt.Errorf("get cart item: %w", err)
	}
	if item.CartID != cartID {
		return ErrItemNotFound
	}
	if _, err := s.q.UpdateCartItemQty(ctx, cartdb.UpdateCartItemQtyParams{ID: itemID, Qty: qty}); err != nil {
		if isCheckViolation(err) {
			return ErrQtyTooLarge
		}
		return fmt.Errorf("update cart item: %w", err)
	}
	return nil
}

// RemoveItem deletes a cart item that must belong to the cart.
func (s *Service) RemoveItem(ctx context.Context, cartID, itemID uuid.UUID) error {
	rows, err := s.q.DeleteCartItem(ctx, cartdb.DeleteCartItemParams{ID: itemID, CartID: cartID})
	if err != nil {
		return fmt.Errorf("delete cart item: %w", err)
	}
	if rows == 0 {
		return ErrItemNotFound
	}
	return nil
}

// Snapshot builds the latest full cart view (contract §9.4).
func (s *Service) Snapshot(ctx context.Context, cartID uuid.UUID) (View, error) {
	c, err := s.q.GetCart(ctx, cartID)
	if err != nil {
		return View{}, fmt.Errorf("get cart: %w", err)
	}
	rows, err := s.q.ListCartItemsDetailed(ctx, cartID)
	if err != nil {
		return View{}, fmt.Errorf("list cart items: %w", err)
	}
	return buildView(c.ID, c.Currency, rows), nil
}

func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

func isCheckViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23514"
}
