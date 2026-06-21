import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/space-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/global.css';
import { App } from './App';
import { enableMocking } from './mocks';

async function bootstrap(): Promise<void> {
  await enableMocking();

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element #root was not found in index.html');
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
