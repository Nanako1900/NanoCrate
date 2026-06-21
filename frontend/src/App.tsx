import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { createQueryClient } from './services/query-client';
import { AppShell } from './components/layout/AppShell';
import { CatalogPage } from './routes/CatalogPage';
import { ProductPage } from './routes/ProductPage';
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
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<CatalogPage />} />
            <Route path="/c/:type" element={<CategoryRedirect />} />
            <Route path="/p/:slug" element={<ProductPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
