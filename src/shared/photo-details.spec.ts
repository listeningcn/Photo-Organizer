import {
  exposureSummary,
  formatAperture,
  formatBytes,
  formatDuration,
  formatExposureBias,
  formatExposureTime,
  formatMegapixels,
  type PhotoDetails,
} from './photo-details';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [4.6, '0:05'],
    [75, '1:15'],
    [3725, '1:02:05'],
  ])('%s s -> %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('photo detail formatting', () => {
  it.each([
    [500, '500 B'],
    [2048, '2.0 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [25 * 1024 * 1024, '25 MB'],
  ])('formatBytes(%i)', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it.each([
    [0.004, '1/250 s'],
    [1 / 60, '1/60 s'],
    [2.5, '2.5 s'],
    [1, '1 s'],
  ])('formatExposureTime(%f)', (seconds, expected) => {
    expect(formatExposureTime(seconds)).toBe(expected);
  });

  it('formats aperture, bias and megapixels', () => {
    expect(formatAperture(2.8)).toBe('ƒ/2.8');
    expect(formatAperture(1.7799999)).toBe('ƒ/1.8');
    expect(formatExposureBias(0)).toBe('0 EV');
    expect(formatExposureBias(-0.7)).toBe('-0.7 EV');
    expect(formatExposureBias(1 / 3)).toBe('+0.33 EV');
    expect(formatMegapixels(4032, 3024)).toBe('12.2 MP');
  });

  it('builds an exposure summary from available fields', () => {
    const base = { fNumber: null, exposureTime: null, iso: null, focalLength: null };
    expect(exposureSummary(base as unknown as PhotoDetails)).toBeNull();
    expect(
      exposureSummary({
        ...base,
        fNumber: 1.8,
        exposureTime: 1 / 120,
        iso: 100,
        focalLength: 26,
      } as unknown as PhotoDetails)
    ).toBe('ƒ/1.8 · 1/120 s · ISO 100 · 26 mm');
  });
});
