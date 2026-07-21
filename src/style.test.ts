import { describe, expect, it } from 'vitest';
import { buildStyle, computeInitialView } from './style.ts';
import type { MapIntent, ResolvedLayer, ResolvedStyle } from './types.ts';

function tilejson(tiles: string[], extra: Partial<ResolvedLayer['tilejson']> = {}) {
  return { tilejson: '3.0.0', tiles, ...extra };
}

const intent: MapIntent = {
  spec_version: 'map-intent/v2',
  goal: 'test',
  catalog_context: { active_catalogs: [{ id: 'x', type: 'layers_txt', uri: 'https://example.org/catalog' }] },
  required_layers: [{ source_id: 'std' }, { source_id: 'hazard' }],
  optional_layers: [{ source_id: 'extra' }],
  provenance: { generated_by: 't', generated_at: 't', intent_id: 't' }
};

describe('buildStyle', () => {
  it('orders required layers first, then optional, and hides optional by default', () => {
    const resolved: ResolvedLayer[] = [
      { source_id: 'extra', required: false, catalog_id: 'x', tilejson: tilejson(['https://e/x/{z}/{x}/{y}.png']) },
      { source_id: 'std', required: true, catalog_id: 'x', tilejson: tilejson(['https://e/std/{z}/{x}/{y}.png']) },
      { source_id: 'hazard', required: true, catalog_id: 'x', tilejson: tilejson(['https://e/h/{z}/{x}/{y}.png']) }
    ];

    const { style, unrenderable } = buildStyle(intent, resolved);

    // Base style has "before" and "after" sections; thematic layers go in the middle
    const beforeCount = style.layers.filter((l) => {
      const id = (l as Record<string, unknown>).id as string;
      return id.startsWith('bvmap') || id === 'background';
    }).length;
    const afterCount = style.layers.filter((l) => {
      const id = (l as Record<string, unknown>).id as string;
      return id.startsWith('bvmap-道路');
    }).length;
    expect(beforeCount).toBeGreaterThan(0);
    expect(afterCount).toBeGreaterThan(0);

    // Thematic layers (std, hazard, extra) should appear between before and after
    const thematicIds = ['std', 'hazard', 'extra'];
    const thematicIndices = thematicIds.map((id) => style.layers.findIndex((l) => (l as Record<string, unknown>).id === id)).filter((i) => i >= 0);
    expect(thematicIndices).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
    // Check ordering: required first, then optional
    const stdIdx = style.layers.findIndex((l) => (l as Record<string, unknown>).id === 'std');
    const hazardIdx = style.layers.findIndex((l) => (l as Record<string, unknown>).id === 'hazard');
    const extraIdx = style.layers.findIndex((l) => (l as Record<string, unknown>).id === 'extra');
    expect(stdIdx).toBeLessThan(extraIdx);
    expect(hazardIdx).toBeLessThan(extraIdx);

    // Check visibility
    expect((style.layers[stdIdx].layout as { visibility: string }).visibility).toBe('visible');
    expect((style.layers[extraIdx].layout as { visibility: string }).visibility).toBe('none');
    expect(unrenderable).toEqual([]);
  });

  it('adds a source but no renderable layer for vector tiles with no known schema, and flags it', () => {
    const resolved: ResolvedLayer[] = [
      { source_id: 'std', required: true, catalog_id: 'x', tilejson: tilejson(['https://e/std/{z}/{x}/{y}.png']) },
      { source_id: 'hazard', required: true, catalog_id: 'x', tilejson: tilejson(['https://e/h/{z}/{x}/{y}.pbf']) }
    ];

    const { style, unrenderable } = buildStyle(intent, resolved);

    expect(Object.keys(style.sources)).toContain('hazard');
    // Background (bvmap/mapterhorn) + std are rendered, hazard is not
    const stdLayer = style.layers.find((l) => l.id === 'std');
    const hazardLayer = style.layers.find((l) => l.id === 'hazard');
    expect(stdLayer).toBeDefined();
    expect(hazardLayer).toBeUndefined();
    expect(unrenderable).toEqual(['hazard']);
  });

  // A real Martin server (e.g. stars.optgeo.org) can inspect actual MVT
  // contents and publish vector_layers; hfu/layers-martin can't (D7).
  // When the schema is known, render generically per source-layer instead
  // of giving up -- see DECISIONS.md D23.
  it('renders fill/line/circle sub-layers per vector_layers entry when the schema is known', () => {
    const resolved: ResolvedLayer[] = [
      {
        source_id: 'bvmap',
        required: true,
        catalog_id: 'stars',
        tilejson: tilejson(['https://stars.optgeo.org/bvmap/{z}/{x}/{y}'], {
          vector_layers: [
            { id: 'BldA', minzoom: 14, maxzoom: 16 },
            { id: 'RdCL', minzoom: 4, maxzoom: 16 }
          ]
        })
      }
    ];
    const bvmapIntent: MapIntent = { ...intent, required_layers: [{ source_id: 'bvmap' }], optional_layers: [] };

    const { style, unrenderable } = buildStyle(bvmapIntent, resolved);

    expect(unrenderable).toEqual([]);
    expect(style.sources.bvmap.type).toBe('vector');
    // Background layers (bvmap base) + 2 source-layers x 3 geometry types (6 thematic) + road/label layers
    // Just verify the 6 thematic sub-layers are present.
    const thematicLayerIds = style.layers.map((l) => (l as Record<string, unknown>).id as string).filter(
      (id) => id.includes('bvmap__BldA__') || id.includes('bvmap__RdCL__')
    );
    expect(thematicLayerIds).toContainEqual('bvmap__BldA__fill');
    expect(thematicLayerIds).toContainEqual('bvmap__BldA__line');
    expect(thematicLayerIds).toContainEqual('bvmap__BldA__circle');
    expect(thematicLayerIds).toContainEqual('bvmap__RdCL__fill');
    expect(thematicLayerIds).toContainEqual('bvmap__RdCL__line');
    expect(thematicLayerIds).toContainEqual('bvmap__RdCL__circle');

    const bldaFill = style.layers.find((l) => l.id === 'bvmap__BldA__fill')!;
    expect(bldaFill.source).toBe('bvmap');
    expect(bldaFill['source-layer']).toBe('BldA');
    expect(bldaFill.minzoom).toBe(14);
    expect(bldaFill.maxzoom).toBe(16);
    expect((bldaFill.filter as unknown[])[1]).toEqual(['geometry-type']);
  });

  it('an empty vector_layers array is treated the same as absent (still unrenderable)', () => {
    const resolved: ResolvedLayer[] = [
      { source_id: 'hazard', required: true, catalog_id: 'x', tilejson: tilejson(['https://e/h/{z}/{x}/{y}.pbf'], { vector_layers: [] }) }
    ];
    const { style, unrenderable } = buildStyle({ ...intent, required_layers: [{ source_id: 'hazard' }], optional_layers: [] }, resolved);
    expect(unrenderable).toEqual(['hazard']);
    // Background layers (from base-style) are still present; no thematic layer for hazard
    expect(style.layers.length).toBeGreaterThan(0); // at least background layers
    expect(style.layers.find((l) => l.id === 'hazard')).toBeUndefined();
  });

  it('always renders background (bvmap + mapterhorn) even with no thematic layers', () => {
    const { style, unrenderable } = buildStyle(intent, []);
    expect(unrenderable).toEqual([]);
    // Base style sources must be present
    expect(Object.keys(style.sources)).toContain('bvmap');
    expect(Object.keys(style.sources)).toContain('mapterhorn');
    // Background layers exist
    expect(style.layers.find((l) => l.id === 'background')).toBeDefined();
    expect(style.layers.find((l) => l.id === 'hillshade')).toBeDefined();
    // Terrain is set
    expect(style.terrain).toBeDefined();
  });
});

// D39: required_styles/optional_styles reference a whole published Martin
// style (sources+layers) rather than a single source_id.
describe('buildStyle with resolved styles (D39)', () => {
  function resolvedStyle(styleId: string, required: boolean, layers: Array<Record<string, unknown>>): ResolvedStyle {
    return {
      style_id: styleId,
      required,
      catalog_id: 'stars-optgeo',
      style: { version: 8, sources: { [styleId]: { type: 'vector', tiles: [`https://e/${styleId}/{z}/{x}/{y}`] } }, layers }
    };
  }

  it('merges a resolved style\'s sources/layers into the thematic band and tracks its layer ids', () => {
    const styleIntent: MapIntent = { ...intent, required_layers: [], optional_layers: [], required_styles: [{ style_id: 'vlcm' }] };
    const rs = resolvedStyle('vlcm', true, [
      { id: 'vlcm-a', type: 'fill', source: 'vlcm', layout: { visibility: 'none' } },
      { id: 'vlcm-b', type: 'line', source: 'vlcm' }
    ]);

    const { style, unrenderable, styleLayerIds } = buildStyle(styleIntent, [], [rs]);

    expect(unrenderable).toEqual([]);
    expect(style.sources.vlcm).toBeDefined();
    const a = style.layers.find((l) => l.id === 'vlcm-a')!;
    const b = style.layers.find((l) => l.id === 'vlcm-b')!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Visibility is forced to match required/optional state, overriding
    // whatever the published style itself set (D39).
    expect((a.layout as { visibility: string }).visibility).toBe('visible');
    expect((b.layout as { visibility: string }).visibility).toBe('visible');
    expect(styleLayerIds.vlcm).toEqual(['vlcm-a', 'vlcm-b']);
  });

  it('forces optional-style layers hidden by default', () => {
    const styleIntent: MapIntent = { ...intent, required_layers: [], optional_layers: [], optional_styles: [{ style_id: 'vbm' }] };
    const rs = resolvedStyle('vbm', false, [{ id: 'vbm-a', type: 'fill', source: 'vbm', layout: { visibility: 'visible' } }]);

    const { style } = buildStyle(styleIntent, [], [rs]);
    const a = style.layers.find((l) => l.id === 'vbm-a')!;
    expect((a.layout as { visibility: string }).visibility).toBe('none');
  });

  it('orders layer-based thematic layers before style-based ones', () => {
    const styleIntent: MapIntent = { ...intent, required_layers: [{ source_id: 'std' }], optional_layers: [], required_styles: [{ style_id: 'vlcm' }] };
    const resolvedLayers: ResolvedLayer[] = [
      { source_id: 'std', required: true, catalog_id: 'x', tilejson: tilejson(['https://e/std/{z}/{x}/{y}.png']) }
    ];
    const rs = resolvedStyle('vlcm', true, [{ id: 'vlcm-a', type: 'fill', source: 'vlcm' }]);

    const { style } = buildStyle(styleIntent, resolvedLayers, [rs]);
    const stdIdx = style.layers.findIndex((l) => l.id === 'std');
    const vlcmIdx = style.layers.findIndex((l) => l.id === 'vlcm-a');
    expect(stdIdx).toBeGreaterThanOrEqual(0);
    expect(vlcmIdx).toBeGreaterThan(stdIdx);
  });

  it('flags a style with no usable layers as unrenderable, without a styleLayerIds entry', () => {
    const styleIntent: MapIntent = { ...intent, required_layers: [], optional_layers: [], required_styles: [{ style_id: 'empty_style' }] };
    const rs = resolvedStyle('empty_style', true, []);

    const { unrenderable, styleLayerIds } = buildStyle(styleIntent, [], [rs]);
    expect(unrenderable).toEqual(['empty_style']);
    expect(styleLayerIds.empty_style).toBeUndefined();
  });

  it('lets a style-contributed source win over a layer-contributed source on id collision', () => {
    const styleIntent: MapIntent = { ...intent, required_layers: [{ source_id: 'shared' }], optional_layers: [], required_styles: [{ style_id: 'shared' }] };
    const resolvedLayers: ResolvedLayer[] = [
      { source_id: 'shared', required: true, catalog_id: 'x', tilejson: tilejson(['https://e/shared/{z}/{x}/{y}.png']) }
    ];
    const rs: ResolvedStyle = {
      style_id: 'shared',
      required: true,
      catalog_id: 'stars-optgeo',
      style: { version: 8, sources: { shared: { type: 'vector', tiles: ['https://e/shared-style/{z}/{x}/{y}'] } }, layers: [{ id: 'shared-layer', type: 'fill', source: 'shared' }] }
    };

    const { style } = buildStyle(styleIntent, resolvedLayers, [rs]);
    expect(style.sources.shared.type).toBe('vector');
    expect((style.sources.shared as { tiles: string[] }).tiles[0]).toBe('https://e/shared-style/{z}/{x}/{y}');
  });
});

describe('computeInitialView', () => {
  it('prefers render_hints when present', () => {
    const withHints: MapIntent = { ...intent, render_hints: { center: [140, 40], zoom: 8 } };
    const view = computeInitialView(withHints, []);
    expect(view.center).toEqual([140, 40]);
    expect(view.zoom).toBe(8);
  });

  it('falls back to area.bbox', () => {
    const withArea: MapIntent = { ...intent, area: { bbox: [130, 30, 140, 40] } };
    const view = computeInitialView(withArea, []);
    expect(view.bounds).toEqual([130, 30, 140, 40]);
  });

  it('falls back to combined bounds of required layers', () => {
    const resolved: ResolvedLayer[] = [
      { source_id: 'std', required: true, catalog_id: 'x', tilejson: tilejson(['https://e/std/{z}/{x}/{y}.png'], { bounds: [130, 30, 135, 35] }) },
      { source_id: 'hazard', required: true, catalog_id: 'x', tilejson: tilejson(['https://e/h/{z}/{x}/{y}.png'], { bounds: [133, 33, 140, 40] }) }
    ];
    const view = computeInitialView(intent, resolved);
    expect(view.bounds).toEqual([130, 30, 140, 40]);
  });

  it('falls back to a Japan-wide default when nothing else is available', () => {
    const view = computeInitialView(intent, []);
    expect(view.bounds).toBeUndefined();
    expect(view.center).toEqual([138.0, 38.0]);
  });
});
