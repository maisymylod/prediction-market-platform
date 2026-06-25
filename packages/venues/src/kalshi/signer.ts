import { createSign, createPrivateKey, constants, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Centralized Kalshi request signing (constraint: one signing module). Kalshi
// authenticates with an API key ID plus an RSA private key that signs
// `timestampMs + METHOD + path` using RSA-PSS / SHA-256. The key NEVER leaves
// the worker and is never logged.

export interface KalshiSignerOptions {
  keyId: string;
  /** Inline PEM (PKCS8) … */
  privateKeyPem?: string;
  /** … or a path to the PEM file (preferred). */
  privateKeyPath?: string;
}

export interface KalshiAuthHeaders {
  'KALSHI-ACCESS-KEY': string;
  'KALSHI-ACCESS-SIGNATURE': string;
  'KALSHI-ACCESS-TIMESTAMP': string;
}

export class KalshiSigner {
  private readonly key: KeyObject;

  constructor(private readonly opts: KalshiSignerOptions) {
    const pem = opts.privateKeyPem ?? (opts.privateKeyPath ? readFileSync(opts.privateKeyPath, 'utf8') : undefined);
    if (!pem) throw new Error('KalshiSigner requires a private key (inline PEM or path)');
    this.key = createPrivateKey(pem);
  }

  /** Sign one request. `path` is the request path only (no host, includes /trade-api/...). */
  sign(method: string, path: string, timestampMs: number = Date.now()): KalshiAuthHeaders {
    const message = `${timestampMs}${method.toUpperCase()}${path}`;
    const signer = createSign('sha256');
    signer.update(message);
    signer.end();
    const signature = signer.sign({
      key: this.key,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    });
    return {
      'KALSHI-ACCESS-KEY': this.opts.keyId,
      'KALSHI-ACCESS-SIGNATURE': signature.toString('base64'),
      'KALSHI-ACCESS-TIMESTAMP': String(timestampMs),
    };
  }
}

/** Build a signer from env-style inputs, or null when creds are absent. */
export function makeKalshiSigner(opts: Partial<KalshiSignerOptions>): KalshiSigner | null {
  if (!opts.keyId || (!opts.privateKeyPem && !opts.privateKeyPath)) return null;
  return new KalshiSigner({
    keyId: opts.keyId,
    privateKeyPem: opts.privateKeyPem,
    privateKeyPath: opts.privateKeyPath,
  });
}
