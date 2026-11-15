// R2 uploads are signed with AWS Signature V4; the signer must match AWS's published example.
import { describe, expect, it } from 'vitest';
import { signV4 } from '../../scripts/pipeline/r2';

describe('signV4', () => {
  it('reproduces the S3 GET example from the AWS documentation', () => {
    const empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const auth = signV4({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      headers: { Range: 'bytes=0-9', 'x-amz-content-sha256': empty, 'x-amz-date': '20130524T000000Z' },
      payloadHash: empty,
      keyId: 'AKIAIOSFODNN7EXAMPLE',
      secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 's3',
      amzDate: '20130524T000000Z',
    });
    expect(auth).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });
});
