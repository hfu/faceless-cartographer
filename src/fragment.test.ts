import { describe, expect, it } from 'vitest';
import { decodeIntentFragment, encodeIntentFragment } from './fragment.ts';

describe('encodeIntentFragment / decodeIntentFragment', () => {
  it('round-trips ASCII YAML', () => {
    const yaml = 'spec_version: "map-intent/v2"\ngoal: "a test"\n';
    const hash = '#intent=' + encodeIntentFragment(yaml);
    expect(decodeIntentFragment(hash)).toBe(yaml);
  });

  it('round-trips YAML containing Japanese characters', () => {
    const yaml = 'goal: "対象地域における土砂災害警戒区域の分布を示す。"\n';
    const hash = '#intent=' + encodeIntentFragment(yaml);
    expect(decodeIntentFragment(hash)).toBe(yaml);
  });

  it('round-trips YAML containing quotes and colons', () => {
    const yaml = 'goal: "he said \\"hi: there\\""\ncolon: "a:b"\n';
    const hash = '#intent=' + encodeIntentFragment(yaml);
    expect(decodeIntentFragment(hash)).toBe(yaml);
  });

  it('produces a payload containing only URL-safe base64url characters', () => {
    const yaml = 'goal: "lots of + and / and = triggering bytes ÿþý"\n';
    const encoded = encodeIntentFragment(yaml);
    expect(encoded).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('returns null for an empty hash', () => {
    expect(decodeIntentFragment('')).toBeNull();
  });

  it('returns null for a bare "#"', () => {
    expect(decodeIntentFragment('#')).toBeNull();
  });

  it('returns null when the hash lacks the "#intent=" prefix', () => {
    expect(decodeIntentFragment('#foo=bar')).toBeNull();
  });

  it('returns null for "#intent=" with no payload', () => {
    expect(decodeIntentFragment('#intent=')).toBeNull();
  });

  it('returns null for malformed base64', () => {
    expect(decodeIntentFragment('#intent=not@@valid!!')).toBeNull();
  });
});
