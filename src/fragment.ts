const HASH_PREFIX = '#intent=';

// Encodes arbitrary UTF-8 text as a base64url payload (no padding). Callers
// prepend "#intent=" themselves -- this function only does the byte-safe
// text <-> URL-fragment-safe-string transform. base64url's alphabet
// ([A-Za-z0-9-_]) needs no further percent-encoding to sit after a "#".
export function encodeIntentFragment(yaml: string): string {
  const bytes = new TextEncoder().encode(yaml);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Takes the full location.hash (including the leading "#"). Returns the
// decoded YAML text, or null if there's nothing usable -- no "#intent="
// prefix, an empty payload, or malformed base64 -- so callers can just fall
// back to the normal form in every "not a fragment intent" case alike.
export function decodeIntentFragment(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const payload = hash.slice(HASH_PREFIX.length);
  if (payload === '') return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
