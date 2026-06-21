import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import type { Cart } from '@/services/types';
import { stripePublishableKey } from '@/lib/env';
import { useCreatePaymentIntent } from '@/hooks/useCheckout';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatPrice } from '@/lib/format';

/**
 * LIVE Stripe payment (lazy-loaded; not bundled in mock mode). Requires
 * VITE_STRIPE_PUBLISHABLE_KEY + a backend issuing a real client_secret.
 * confirmPayment redirects to the result page, which polls the order status —
 * success is decided by the backend webhook, never the redirect (SPEC §7).
 */
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

function PayForm({ cart, orderId }: { cart: Cart; orderId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setMessage(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/result?order_id=${encodeURIComponent(orderId)}`,
      },
    });
    if (error) {
      setMessage(error.message ?? 'Payment could not be completed.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-label="Payment">
      <PaymentElement />
      {message && (
        <p role="alert" className="rounded-md border border-stock-out-ink/20 bg-stock-out-bg px-4 py-3 text-sm text-stock-out-ink">
          {message}
        </p>
      )}
      <Button type="submit" size="md" disabled={!stripe || submitting} className="w-full">
        {submitting ? 'Processing…' : `Pay ${formatPrice(cart.subtotal_cents, cart.currency)}`}
      </Button>
    </form>
  );
}

export default function StripePaymentPanel({ cart }: { cart: Cart }) {
  const createIntent = useCreatePaymentIntent(cart.id);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    createIntent.mutate(undefined, {
      onSuccess: (result) => {
        setClientSecret(result.client_secret);
        setOrderId(result.order_id);
      },
    });
  }, [createIntent]);

  if (!stripePromise) {
    return <ErrorState error={new Error('Stripe publishable key is not configured.')} />;
  }
  if (createIntent.isError) {
    return <ErrorState error={createIntent.error} onRetry={() => createIntent.mutate()} />;
  }
  if (!clientSecret || !orderId) {
    return <p className="label-mono py-8 text-center">Preparing secure payment…</p>;
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'flat' } }}>
      <PayForm cart={cart} orderId={orderId} />
    </Elements>
  );
}
