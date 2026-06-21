import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { createQueryClient } from './services/query-client';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { CartUIProvider } from './components/cart/CartUIContext';
import { AppShell } from './components/layout/AppShell';
import { CatalogPage } from './routes/CatalogPage';
import { ProductPage } from './routes/ProductPage';
import { CartPage } from './routes/CartPage';
import { CheckoutPage } from './routes/CheckoutPage';
import { CheckoutResultPage } from './routes/CheckoutResultPage';
import { OrdersPage } from './routes/OrdersPage';
import { OrderDetailPage } from './routes/OrderDetailPage';
import { NotFoundPage } from './routes/NotFoundPage';

/** `/c/:type` is a shareable category entry that normalizes to the canonical
 *  search-param model on `/` (all catalog state lives in URL search params). */
function CategoryRedirect() {
  const { type } = useParams();
  const search = type ? `?type=${encodeURIComponent(type)}` : '';
  return <Navigate to={`/${search}`} replace />;
}

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <CartUIProvider>
            <AppShell>
              <Routes>
                {/* Public: browse + guest cart (cart is a session per §9.2). */}
                <Route path="/" element={<CatalogPage />} />
                <Route path="/c/:type" element={<CategoryRedirect />} />
                <Route path="/p/:slug" element={<ProductPage />} />
                <Route path="/cart" element={<CartPage />} />

                {/* Protected: checkout → result → orders. */}
                <Route
                  path="/checkout"
                  element={
                    <ProtectedRoute title="Sign in to check out">
                      <CheckoutPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/checkout/result"
                  element={
                    <ProtectedRoute title="Sign in to view your order">
                      <CheckoutResultPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/orders"
                  element={
                    <ProtectedRoute title="Sign in to view your orders">
                      <OrdersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/orders/:id"
                  element={
                    <ProtectedRoute title="Sign in to view this order">
                      <OrderDetailPage />
                    </ProtectedRoute>
                  }
                />

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </AppShell>
          </CartUIProvider>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
