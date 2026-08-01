import { describe, expect, it } from 'vitest';
import { buildPopupHtml, isInternalPropertyKey, shouldShowProperty } from './render.ts';

// D41: these field names are taken directly from real TileJSON vector_layers
// fields fetched from stars.optgeo.org (bvmap/vlcm/vbm) and MapLibre's own
// demotiles.maplibre.org (Natural-Earth-derived, non-GSI schema) -- not
// invented examples. See DECISIONS.md D41 for the full validation record.
describe('isInternalPropertyKey / shouldShowProperty (D41)', () => {
  it('hides fields with a "code"/"コード" name regardless of type', () => {
    expect(isInternalPropertyKey('vt_code')).toBe(true);
    expect(isInternalPropertyKey('出典コード')).toBe(true);
    expect(isInternalPropertyKey('分類コード')).toBe(true);
    expect(isInternalPropertyKey('code')).toBe(true);
    expect(isInternalPropertyKey('code3')).toBe(true);
    expect(isInternalPropertyKey('vt_rtcode')).toBe(true); // substring match, e.g. bvmap RailCL
  });

  it('hides numeric-typed fields even without a code-like name', () => {
    expect(shouldShowProperty('ID', 42)).toBe(false); // VLCM
    expect(shouldShowProperty('fid', 7)).toBe(false); // MapLibre demotiles
    expect(shouldShowProperty('vt_lvorder', 3)).toBe(false); // bvmap
  });

  it('shows general-audience string fields', () => {
    expect(shouldShowProperty('name', 'Usu-zan')).toBe(true); // VLCM
    expect(shouldShowProperty('class1', '火砕流')).toBe(true); // VLCM
    expect(shouldShowProperty('名称', '有珠山')).toBe(true); // VBM
    expect(shouldShowProperty('注記', '洞爺湖')).toBe(true); // VBM
    expect(shouldShowProperty('NAME', 'Japan')).toBe(true); // MapLibre demotiles
    expect(shouldShowProperty('ABBREV', 'Jpn.')).toBe(true); // MapLibre demotiles
  });

  it('a numeric elevation/depth value is hidden by the type check even though the field is general-audience', () => {
    // Known, accepted limitation (DECISIONS.md D41): 標高/水深 are genuinely
    // useful to show but are Number-typed, same as an internal code, so the
    // type signal alone can't tell them apart. Not fixed here -- the OR
    // heuristic trades this false-hide for catching every internal numeric
    // code, which was judged the safer default.
    expect(shouldShowProperty('標高', 732)).toBe(false);
  });
});

describe('buildPopupHtml (D41)', () => {
  it('renders only the general-audience properties, escaped', () => {
    const html = buildPopupHtml({ code: '<script>', name: 'Test & Co' });
    expect(html).toContain('name');
    expect(html).toContain('Test &amp; Co');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/<dt>code<\/dt>/);
  });

  it('returns null when every property is filtered out (nothing general-audience to show)', () => {
    expect(buildPopupHtml({ vt_code: 2701, ID: 5 })).toBeNull();
  });

  it('returns null for a feature with no properties at all', () => {
    expect(buildPopupHtml({})).toBeNull();
  });
});
