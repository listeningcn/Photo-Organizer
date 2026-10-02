import { isRequestAllowed } from './network';

describe('isRequestAllowed', () => {
  it.each([
    'file:///Applications/app/index.html',
    'app://thumb/12',
    'devtools://devtools/bundled/inspector.html',
    'data:image/png;base64,AAAA',
  ])('allows local resource %s', (url) => {
    expect(isRequestAllowed(url)).toBe(true);
  });

  it('allows OSM tiles', () => {
    expect(isRequestAllowed('https://tile.openstreetmap.org/5/10/12.png')).toBe(true);
  });

  it.each([
    'https://example.com/upload',
    'http://tile.openstreetmap.org/5/10/12.png',
    'https://tile.openstreetmap.org/5/10/12.png?data=secret',
    'https://tile.openstreetmap.org/upload',
    'https://tile.openstreetmap.org.evil.com/5/10/12.png',
    'wss://example.com/socket',
    'not a url',
  ])('blocks %s', (url) => {
    expect(isRequestAllowed(url)).toBe(false);
  });

  it('allows the dev server only when configured', () => {
    const devServerUrl = 'http://localhost:5173';
    expect(isRequestAllowed('http://localhost:5173/src/main.tsx')).toBe(false);
    expect(isRequestAllowed('http://localhost:5173/src/main.tsx', { devServerUrl })).toBe(
      true
    );
    expect(isRequestAllowed('ws://localhost:5173/', { devServerUrl })).toBe(true);
    expect(isRequestAllowed('http://localhost:8080/', { devServerUrl })).toBe(false);
  });
});
