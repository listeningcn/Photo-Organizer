import type { Session } from 'electron';

import { buildCsp, isRequestAllowed, TILE_HOST } from '@shared/network';

export function applySessionSecurity(ses: Session, devServerUrl?: string) {
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isRequestAllowed(details.url, { devServerUrl });
    if (!allowed) {
      console.warn(`[network] blocked ${details.method} ${details.url}`);
    }
    callback({ cancel: !allowed });
  });

  // OSM's tile usage policy requires an identifying User-Agent and forbids sending cookies/referrers we don't need.
  ses.webRequest.onBeforeSendHeaders(
    { urls: [`https://${TILE_HOST}/*`] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      delete headers.Cookie;
      headers['User-Agent'] = 'PhotoOrganizer/0.1 (personal desktop app)';
      callback({ requestHeaders: headers });
    }
  );

  if (devServerUrl) {
    ses.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [buildCsp(devServerUrl)],
        },
      });
    });
  }

  ses.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false)
  );
  ses.setPermissionCheckHandler(() => false);
}
