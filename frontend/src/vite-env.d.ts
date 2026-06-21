/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'mock' | 'live';
  readonly VITE_API_BASE_URL?: string;
}

declare module '*.css';
declare module '@fontsource-variable/*';
declare module '@fontsource/*';
