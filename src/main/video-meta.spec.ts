import { describe, expect, it } from 'vitest';

import { parseIso6709, parseProbe } from './video-meta';

describe('parseIso6709', () => {
  it('parses iPhone locations', () => {
    expect(parseIso6709('+37.7749-122.4194+010.000/')).toEqual({
      lat: 37.7749,
      lng: -122.4194,
    });
  });

  it('parses locations without altitude', () => {
    expect(parseIso6709('-33.8688+151.2093/')).toEqual({ lat: -33.8688, lng: 151.2093 });
  });

  it('rejects invalid or null-island values', () => {
    expect(parseIso6709(undefined)).toBeNull();
    expect(parseIso6709('garbage')).toBeNull();
    expect(parseIso6709('+95.0+10.0/')).toBeNull();
    expect(parseIso6709('+0.0000+0.0000/')).toBeNull();
  });
});

describe('parseProbe', () => {
  it('reads an iPhone .mov', () => {
    const meta = parseProbe({
      format: {
        duration: '12.345',
        tags: {
          creation_time: '2024-05-01T10:00:00.000000Z',
          'com.apple.quicktime.creationdate': '2024-05-01T12:00:00+0200',
          'com.apple.quicktime.location.ISO6709': '+48.8584+002.2945+035.000/',
          'com.apple.quicktime.make': 'Apple',
          'com.apple.quicktime.model': 'iPhone 15',
        },
      },
      streams: [{ codec_type: 'video' }],
    });
    expect(meta).toEqual({
      duration: 12.345,
      takenAt: Date.parse('2024-05-01T10:00:00Z'),
      lat: 48.8584,
      lng: 2.2945,
      camera: 'Apple iPhone 15',
    });
  });

  it('falls back to the video stream and ignores unset camera clocks', () => {
    const meta = parseProbe({
      format: { tags: { creation_time: '1904-01-01T00:00:00Z' } },
      streams: [
        { codec_type: 'audio' },
        {
          codec_type: 'video',
          duration: '3.5',
          tags: { creation_time: '2020-02-02T02:02:02Z' },
        },
      ],
    });
    expect(meta.duration).toBe(3.5);
    expect(meta.takenAt).toBe(Date.parse('2020-02-02T02:02:02Z'));
    expect(meta.camera).toBeNull();
  });

  it('handles empty output', () => {
    expect(parseProbe({})).toEqual({
      duration: null,
      takenAt: null,
      lat: null,
      lng: null,
      camera: null,
    });
  });
});
