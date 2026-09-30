import { lookup } from 'node:dns/promises';

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export function isPrivateAddress(ip: string): boolean {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (value === '::1' || value === '0:0:0:0:0:0:0:1') return true;
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) {
    return true;
  }
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = mapped ? mapped[1] : value;
  const parts = v4.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!parts) return false;
  const a = Number(parts[1]);
  const b = Number(parts[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('invalid url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('only http and https urls can be fetched');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('urls with credentials are not allowed');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host === 'metadata.google.internal'
  ) {
    throw new UnsafeUrlError('host is not allowed');
  }
  if (isPrivateAddress(host)) {
    throw new UnsafeUrlError('address is not allowed');
  }
  try {
    const results = await lookup(host, { all: true, verbatim: true });
    if (results.length === 0) throw new UnsafeUrlError('could not resolve host');
    for (const result of results) {
      if (isPrivateAddress(result.address)) {
        throw new UnsafeUrlError('host resolves to a private address');
      }
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    throw new UnsafeUrlError('could not resolve host');
  }
  return url;
}
