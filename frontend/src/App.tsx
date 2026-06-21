import { lazy, Suspense, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { createQueryClient } from './services/query-client';
import { ThemeProvider } from './components/theme/ThemeContext';
import { AuthProvider } from './auth/AuthContext';
import { AdminRoute } from './auth/AdminRoute';
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

// Admin console is code-split off the storefront landing bundle.
const AdminShell = lazy(() => import('./components/admin/AdminShell').then((m) => ({ default: m.AdminShell })));
const AdminDashboardPage = lazy(() => import('./routes/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AdminProductsPage = lazy(() => import('./routes/admin/AdminProductsPage').then((m) => ({ default: m.AdminProductsPage })));
const AdminProductEditorPage = lazy(() => import('./routes/admin/AdminProductEditorPage').then((m) => ({ default: m.AdminProductEditorPage })));
const AdminInventoryPage = lazy(() => import('./routes/admin/AdminInventoryPage').then((m) => ({ default: m.AdminInventoryPage })));
const AdminOrdersPage = lazy(() => import('./routes/admin/AdminOrdersPage').then((m) => ({ default: m.AdminOrdersPage })));
const AdminOrderDetailPage = lazy(() => import('./routes/admin/AdminOrderDetailPage').then((m) => ({ default: m.AdminOrderDetailPage })));
const AdminSettingsPage = lazy(() => import('./routes/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })));

/** `/c/:type` is a shareable category entry that normalizes to the canonical
 *  search-param model on `/` (all catalog state lives in URL search params). */
function CategoryRedirect() {
  const { type } = useParams();
  const search = type ? `?type=${encodeURIComponent(type)}` : '';
  return <Navigate to={`/${search}`} replace />;
}

/** Storefront chrome (header/footer/cart drawer) wrapping the public + protected
 *  customer routes. */
function StorefrontLayout() {
  return (
    <CartUIProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </CartUIProvider>
  );
}

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* ---- Storefront ---- */}
              <Route element={<StorefrontLayout />}>
                <Route path="/" element={<CatalogPage />} />
                <Route path="/c/:type" element={<CategoryRedirect />} />
                <Route path="/p/:slug" element={<ProductPage />} />
                <Route path="/cart" element={<CartPage />} />
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
              </Route>

              {/* ---- Admin console (RBAC: admin role required) ---- */}
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <Suspense fallback={<div className="min-h-dvh bg-paper" />}>
                      <AdminShell />
                    </Suspense>
                  </AdminRoute>
                }
              >
                <Route index element={<AdminDashboardPage />} />
                <Route path="products" element={<AdminProductsPage />} />
                <Route path="products/new" element={<AdminProductEditorPage />} />
                <Route path="products/:id" element={<AdminProductEditorPage />} />
                <Route path="inventory" element={<AdminInventoryPage />} />
                <Route path="orders" element={<AdminOrdersPage />} />
                <Route path="orders/:id" element={<AdminOrderDetailPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
