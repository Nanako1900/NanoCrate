import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Cart, MockPaymentOutcome } from '@/services/types';
import { useMockPay } from '@/hooks/useCheckout';
import { ApiError } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/lib/format';

const OUTCOMES: ReadonlyArray<{ value: MockPaymentOutcome; label: string }> = [
  { value: 'succeeded', label: 'Payment succeeds' },
  { value: 'failed', label: 'Payment fails' },
  { value: 'out_of_stock', label: 'Out of stock at checkout' },
];

const fieldClass =
  'flex h-11 items-center rounded-md border border-line bg-surface-sunken px-3 font-mono text-sm text-ink-faint';

/** Mock stand-in for the Stripe Payment Element. A simulate-result control
 *  drives the mock backend; success is still confirmed on the result page. */
export function MockPaymentPanel({ cart }: { cart: Cart }) {
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<MockPaymentOutcome>('succeeded');
  const pay = useMockPay(cart.id);
  const apiError = pay.error instanceof ApiError ? pay.error : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    pay.mutate(outcome, {
      onSuccess: (result) =>
        navigate(`/checkout/result?order_id=${encodeURIComponent(result.order_id)}`),
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-label="Payment" aria-busy={pay.isPending}>
      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <p className="label-mono">Card details</p>
          <span className="label-mono text-ink-faint">Mock · no real card</span>
        </div>
        <div className="mt-3 flex flex-col gap-2" aria-hidden="true">
          <div className={fieldClass}>4242 4242 4242 4242</div>
          <div className="grid grid-cols-2 gap-2">
            <div className={fieldClass}>12 / 34</div>
            <div className={fieldClass}>CVC 123</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-line bg-surface p-4">
        <label htmlFor="sim-outcome" className="label-mono">
          Mock control · simulate result
        </label>
        <select
          id="sim-outcome"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as MockPaymentOutcome)}
          className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong"
        >
          {OUTCOMES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {apiError && (
        <p role="alert" className="rounded-md border border-stock-out-ink/20 bg-stock-out-bg px-4 py-3 text-sm text-stock-out-ink">
          {apiError.code === 'out_of_stock'
            ? 'Some items are no longer available. Please review your cart and try again.'
            : apiError.message}
        </p>
      )}

      <Button type="submit" size="md" disabled={pay.isPending} aria-busy={pay.isPending} className="w-full">
        {pay.isPending ? 'Processing…' : `Pay ${formatPrice(cart.subtotal_cents, cart.currency)}`}
      </Button>
      {pay.isPending && (
        <p role="status" className="sr-only">
          Processing payment…
        </p>
      )}
      <p className="text-2xs text-ink-faint">
        Mock mode — no real charge. The payment result is decided by the simulated webhook and
        confirmed on the next screen (never assumed from the redirect).
      </p>
    </form>
  );
}
