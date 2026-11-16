// Uploads are signed the way Cloudinary documents it, and covers moved there are resized by its CDN.
import { describe, expect, it } from 'vitest';
import { cloudinarySized } from '../../lib/cloudinary';
import { shareImage } from '../../lib/share-image';
import { signParams } from '../../scripts/pipeline/cloudinary';

const COVER = 'https://res.cloudinary.com/demo/image/upload/v1794790017/pagemoor/covers/chapea-2-audio-log-4-wide.webp';

describe('signParams', () => {
  it('reproduces the example from the Cloudinary authentication docs', () => {
    const params = { timestamp: 1315060510, public_id: 'sample_image', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' };
    expect(signParams(params, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });
});

describe('cloudinarySized', () => {
  it('puts the crop between /upload/ and the version', () => {
    expect(cloudinarySized(COVER, 480, 640)).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_480,h_640,f_auto,q_auto/v1794790017/pagemoor/covers/chapea-2-audio-log-4-wide.webp',
    );
  });
  it('leaves other URLs and Cloudinary videos alone', () => {
    expect(cloudinarySized('/covers/x.webp', 480, 640)).toBe('/covers/x.webp');
    const clip = 'https://res.cloudinary.com/demo/video/upload/v1/pagemoor/covers/x.mp4';
    expect(cloudinarySized(clip, 480, 640)).toBe(clip);
  });
  it('gives link previews a 1200×630 JPEG', () => {
    expect(shareImage({ slug: 'x', cover: { type: 'image', url: COVER, wide: COVER } })).toContain('/upload/c_fill,g_auto,w_1200,h_630,f_jpg,q_auto/v1794790017/');
  });
});
