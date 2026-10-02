export const TILE_HOST = 'tile.openstreetmap.org';
export const TILE_URL_TEMPLATE = `https://${TILE_HOST}/{z}/{x}/{y}.png`;

const LOCAL_PROTOCOLS = new Set(['file:', 'app:', 'devtools:', 'data:', 'blob:']);
const TILE_PATH = /^\/\d{1,2}\/\d+\/\d+\.png$/;

interface RequestPolicy {
  devServerUrl?: string;
}

/** The single gate for every outgoing request. Only local resources and OSM tile images pass. */
export function isRequestAllowed(url: string, policy: RequestPolicy = {}): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (LOCAL_PROTOCOLS.has(parsed.protocol)) {
    return true;
  }

  if (policy.devServerUrl) {
    const dev = new URL(policy.devServerUrl);
    const isDevProtocol = parsed.protocol === 'http:' || parsed.protocol === 'ws:';
    if (isDevProtocol && parsed.host === dev.host) {
      return true;
    }
  }

  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === TILE_HOST &&
    parsed.search === '' &&
    TILE_PATH.test(parsed.pathname)
  );
}

export function buildCsp(devServerUrl?: string): string {
  const dev = devServerUrl ? new URL(devServerUrl) : undefined;
  // Vite's React refresh preamble is an inline script, so dev needs 'unsafe-inline'.
  const scriptSrc = dev ? `'self' 'unsafe-inline' ${dev.origin}` : `'self'`;
  const connectSrc = dev ? `'self' app: ${dev.origin} ws://${dev.host}` : `'self' app:`;
  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Leaflet positions tiles and markers with inline style attributes.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' app: data: blob: https://${TILE_HOST}`,
    `media-src app:`,
    `connect-src ${connectSrc}`,
    `object-src 'none'`,
    `frame-src 'none'`,
    `base-uri 'none'`,
    `form-action 'none'`,
  ].join('; ');
}
