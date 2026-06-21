import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useCatalogParams } from './useCatalogParams';

function withRouter(initialEntry: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  );
}

describe('useCatalogParams', () => {
  it('returns sensible defaults for an empty query string', () => {
    const { result } = renderHook(() => useCatalogParams(), { wrapper: withRouter('/') });
    expect(result.current.params).toMatchObject({
      type: undefined,
      q: '',
      sort: 'newest',
      page: 1,
      limit: 9,
    });
  });

  it('reads all params from the URL', () => {
    const { result } = renderHook(() => useCatalogParams(), {
      wrapper: withRouter('/?type=keyboard&q=nano&sort=price_asc&page=2'),
    });
    expect(result.current.params).toMatchObject({
      type: 'keyboard',
      q: 'nano',
      sort: 'price_asc',
      page: 2,
    });
  });

  it('falls back to "newest" for an unknown sort value', () => {
    const { result } = renderHook(() => useCatalogParams(), { wrapper: withRouter('/?sort=bogus') });
    expect(result.current.params.sort).toBe('newest');
  });

  it('resets pagination to page 1 when the category changes', () => {
    const { result } = renderHook(() => useCatalogParams(), { wrapper: withRouter('/?page=3') });
    act(() => result.current.setType('switches'));
    expect(result.current.params.type).toBe('switches');
    expect(result.current.params.page).toBe(1);
  });

  it('clears the query when set to an empty string', () => {
    const { result } = renderHook(() => useCatalogParams(), { wrapper: withRouter('/?q=nano') });
    act(() => result.current.setQuery(''));
    expect(result.current.params.q).toBe('');
  });
});
