// Clip uploads are signed the way Cloudinary documents it; the signer must match its published example.
import { describe, expect, it } from 'vitest';
import { signParams } from '../../scripts/pipeline/cloudinary';

describe('signParams', () => {
  it('reproduces the example from the Cloudinary authentication docs', () => {
    const params = { timestamp: 1315060510, public_id: 'sample_image', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' };
    expect(signParams(params, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });
});
