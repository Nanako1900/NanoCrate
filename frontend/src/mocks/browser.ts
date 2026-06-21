import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/** Browser MSW worker (dev + Playwright run in mock mode). */
export const worker = setupWorker(...handlers);
