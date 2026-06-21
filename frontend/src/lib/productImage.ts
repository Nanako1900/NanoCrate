/**
 * Single source for the product image URL.
 *
 * CONTRACT GAP (flagged for backend): backend.md §9.3 `GET /products/:slug` does
 * NOT return an `image` field, while `GET /products` list items do. Until the
 * detail contract adds product media, the detail view derives the asset from the
 * slug here. Centralizing it keeps the list card and the detail hero in lockstep
 * and confines the slug→path convention to one place. The mock fixtures use this
 * same helper so card and detail never diverge in mock mode.
 */
export function productImageSrc(slug: string): string {
  return `/img/keyboards/${slug}.svg`;
}
