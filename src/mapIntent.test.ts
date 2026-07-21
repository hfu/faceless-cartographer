import { describe, expect, it } from 'vitest';
import { parseMapIntent } from './mapIntent.ts';

const VALID_INTENT = `
spec_version: "map-intent/v2"
goal: "対象地域における土砂災害警戒区域（土石流・地すべり・急傾斜地の崩壊）の分布を、背景の標準地図とともに示す"
area:
  name: null
  bbox: null
catalog_context:
  active_catalogs:
    - id: "layers-martin"
      type: "layers_txt"
      uri: "https://hfu.github.io/layers-martin/catalog"
required_layers:
  - source_id: "std"
    label: "背景（標準地図）"
  - source_id: "05_dosekiryukeikaikuiki"
    label: "土石流の警戒区域・特別警戒区域"
optional_layers:
  - source_id: "landslide"
    label: "地すべり地形分布図"
provenance:
  generated_by: "manual-test"
  generated_at: "2026-07-02T00:00:00Z"
  intent_id: "test-001"
`;

describe('parseMapIntent', () => {
  it('accepts the layers-martin worked example', () => {
    const result = parseMapIntent(VALID_INTENT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intent.required_layers?.map((l) => l.source_id)).toEqual(['std', '05_dosekiryukeikaikuiki']);
      expect(result.intent.optional_layers?.[0].source_id).toBe('landslide');
    }
  });

  it('rejects invalid YAML', () => {
    const result = parseMapIntent('goal: ["unterminated');
    expect(result.ok).toBe(false);
  });

  it('rejects a non-mapping top level', () => {
    const result = parseMapIntent('- just\n- a\n- list\n');
    expect(result.ok).toBe(false);
  });

  it('rejects a Map Intent missing required_layers', () => {
    const doc = VALID_INTENT.replace(/required_layers:[\s\S]*?(?=optional_layers:)/, '');
    const result = parseMapIntent(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/required_layers/);
  });

  it('rejects a Map Intent missing provenance', () => {
    const doc = VALID_INTENT.replace(/provenance:[\s\S]*$/, '');
    const result = parseMapIntent(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/provenance/);
  });

  it('rejects an empty required_layers array', () => {
    const doc = VALID_INTENT.replace(/required_layers:[\s\S]*?(?=optional_layers:)/, 'required_layers: []\n');
    const result = parseMapIntent(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/required_layers/);
  });

  it('rejects a catalog_context.active_catalogs entry missing "id"', () => {
    const doc = VALID_INTENT.replace('id: "layers-martin"\n      ', '');
    const result = parseMapIntent(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/active_catalogs\[0\]/);
  });

  it('rejects resolution_policy.precedence referencing an unconfigured catalog_type', () => {
    const doc = VALID_INTENT.replace(
      'uri: "https://hfu.github.io/layers-martin/catalog"',
      'uri: "https://hfu.github.io/layers-martin/catalog"\n  resolution_policy:\n    precedence: ["stac"]'
    );
    const result = parseMapIntent(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/precedence/);
  });

  it('tolerates unknown top-level keys', () => {
    const doc = `${VALID_INTENT}\nsome_future_field: true\n`;
    const result = parseMapIntent(doc);
    expect(result.ok).toBe(true);
  });

  // D39: required_styles is an alternative to required_layers, not an
  // addition -- Staff can reference a whole published Martin style instead
  // of assembling individual source_ids.
  describe('required_styles (D39)', () => {
    it('accepts a Map Intent with required_styles but no required_layers at all', () => {
      const doc = VALID_INTENT.replace(/required_layers:[\s\S]*?(?=optional_layers:)/, '').replace(
        'optional_layers:',
        'required_styles:\n  - style_id: "vlcm"\n    label: "火山土地条件図"\noptional_layers:'
      );
      const result = parseMapIntent(doc);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.intent.required_layers).toBeUndefined();
        expect(result.intent.required_styles?.map((s) => s.style_id)).toEqual(['vlcm']);
      }
    });

    it('rejects a Map Intent with neither required_layers nor required_styles non-empty', () => {
      const doc = VALID_INTENT.replace(/required_layers:[\s\S]*?(?=optional_layers:)/, 'required_layers: []\n');
      const result = parseMapIntent(doc);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/required_layers/);
    });

    it('rejects required_styles[i] missing "style_id"', () => {
      const doc = `${VALID_INTENT}\nrequired_styles:\n  - label: "no id here"\n`;
      const result = parseMapIntent(doc);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/required_styles\[0\]/);
    });

    it('accepts optional_styles and rejects a malformed entry', () => {
      const validDoc = `${VALID_INTENT}\noptional_styles:\n  - style_id: "vbm"\n`;
      expect(parseMapIntent(validDoc).ok).toBe(true);

      const invalidDoc = `${VALID_INTENT}\noptional_styles:\n  - label: "no id here"\n`;
      const result = parseMapIntent(invalidDoc);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/optional_styles\[0\]/);
    });
  });
});
