import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface CartUIValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CartUIContext = createContext<CartUIValue | null>(null);

/** Client-only UI state for the slide-over cart drawer (server cart lives in TanStack Query). */
export function CartUIProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo<CartUIValue>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((prev) => !prev),
    }),
    [isOpen],
  );
  return <CartUIContext.Provider value={value}>{children}</CartUIContext.Provider>;
}

export function useCartUI(): CartUIValue {
  const ctx = useContext(CartUIContext);
  if (!ctx) throw new Error('useCartUI must be used within a CartUIProvider');
  return ctx;
}
