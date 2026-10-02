import type { PhotoApi } from '@shared/api';

declare global {
  interface Window {
    api: PhotoApi;
    L: typeof import('leaflet');
  }
}

export {};
