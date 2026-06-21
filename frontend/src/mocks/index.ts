import { isMockMode } from '@/lib/env';

/**
 * Start the MSW worker when running in mock mode (VITE_API_MODE=mock).
 * Imported dynamically so the worker code is excluded from the live bundle.
 */
export async function enableMocking(): Promise<void> {
  if (!isMockMode) return;
  const { worker } = await import('./browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
  });
}
