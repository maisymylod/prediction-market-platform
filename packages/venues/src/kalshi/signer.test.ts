import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, verify, constants } from 'node:crypto';
import { KalshiSigner, makeKalshiSigner } from './signer.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

describe('KalshiSigner', () => {
  it('produces an RSA-PSS signature verifiable with the public key', () => {
    const signer = new KalshiSigner({ keyId: 'key-123', privateKeyPem: pem });
    const ts = 1_700_000_000_000;
    const headers = signer.sign('get', '/trade-api/v2/portfolio/positions', ts);

    expect(headers['KALSHI-ACCESS-KEY']).toBe('key-123');
    expect(headers['KALSHI-ACCESS-TIMESTAMP']).toBe(String(ts));

    const message = `${ts}GET/trade-api/v2/portfolio/positions`;
    const ok = verify(
      'sha256',
      Buffer.from(message),
      { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST },
      Buffer.from(headers['KALSHI-ACCESS-SIGNATURE'], 'base64'),
    );
    expect(ok).toBe(true);
  });

  it('uppercases the method in the signed message', () => {
    const signer = new KalshiSigner({ keyId: 'k', privateKeyPem: pem });
    const ts = 42;
    const sig = signer.sign('get', '/p', ts)['KALSHI-ACCESS-SIGNATURE'];
    const ok = verify(
      'sha256',
      Buffer.from('42GET/p'),
      { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST },
      Buffer.from(sig, 'base64'),
    );
    expect(ok).toBe(true);
  });

  it('makeKalshiSigner returns null without creds', () => {
    expect(makeKalshiSigner({})).toBeNull();
    expect(makeKalshiSigner({ keyId: 'k' })).toBeNull();
    expect(makeKalshiSigner({ privateKeyPem: pem })).toBeNull();
    expect(makeKalshiSigner({ keyId: 'k', privateKeyPem: pem })).toBeInstanceOf(KalshiSigner);
  });
});
