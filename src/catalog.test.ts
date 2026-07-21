import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLayers, resolveStyles } from './catalog.ts';
import type { MapIntent } from './types.ts';

// These hit the real hfu/layers-martin catalog over the network, by design --
// there's no mock catalog to build against, this is the real reference
// implementation. If layers-martin's catalog changes shape or these specific
// source_ids stop existing, that's itself useful signal.

function intentWith(requiredIds: string[], optionalIds: string[] = []): MapIntent {
  return {
    spec_version: 'map-intent/v2',
    goal: 'test',
    catalog_context: {
      active_catalogs: [{ id: 'layers-martin', type: 'layers_txt', uri: 'https://hfu.github.io/layers-martin/catalog' }]
    },
    required_layers: requiredIds.map((source_id) => ({ source_id })),
    optional_layers: optionalIds.map((source_id) => ({ source_id })),
    provenance: { generated_by: 'test', generated_at: '2026-07-02T00:00:00Z', intent_id: 'test' }
  };
}

describe('resolveLayers (integration, live layers-martin catalog)', () => {
  it('resolves the worked example source_ids with correct TileJSON shape', async () => {
    const intent = intentWith(['std', '05_dosekiryukeikaikuiki', '05_jisuberikeikaikuiki', '05_kyukeishakeikaikuiki'], [
      'landslide'
    ]);
    const { resolved, missing } = await resolveLayers(intent);

    expect(missing).toEqual([]);
    expect(resolved).toHaveLength(5);

    const std = resolved.find((r) => r.source_id === 'std');
    expect(std?.required).toBe(true);
    expect(std?.tilejson.tilejson).toBe('3.0.0');
    expect(std?.tilejson.tiles[0]).toMatch(/^https:\/\//);
    expect(std?.tilejson.tiles[0]).toContain('{z}');

    const landslide = resolved.find((r) => r.source_id === 'landslide');
    expect(landslide?.required).toBe(false);
    // D16 in layers-martin: this host has a verified attribution default.
    expect(landslide?.tilejson.attribution).toBeTruthy();
  }, 20000);

  it('reports a fabricated source_id as missing rather than fabricating a result', async () => {
    const intent = intentWith(['std', 'this_source_id_does_not_exist_12345']);
    const { resolved, missing } = await resolveLayers(intent);

    expect(missing).toEqual(['this_source_id_does_not_exist_12345']);
    expect(resolved.map((r) => r.source_id)).toEqual(['std']);
  }, 20000);
});

describe('resolveLayers (integration, multiple live catalogs)', () => {
  // Confirms the "no aggregator needed" architecture decision (see
  // DECISIONS.md D23): Staff can simply list a second, unrelated
  // catalog_type "martin" catalog alongside hfu/layers-martin in one Map
  // Intent's catalog_context.active_catalogs, and both resolve without any
  // merging step anywhere. stars.optgeo.org is a real, independently
  // operated Martin server (not a static mirror), and its "bvmap" layer
  // publishes full vector_layers (GSI's optimal vector tile basemap
  // schema) that hfu/layers-martin structurally can't provide (D7).
  it('resolves layers from two unrelated catalogs (layers-martin + a real Martin server) in one intent', async () => {
    const intent: MapIntent = {
      spec_version: 'map-intent/v2',
      goal: 'test multi-catalog resolution',
      catalog_context: {
        active_catalogs: [
          { id: 'layers-martin', type: 'layers_txt', uri: 'https://hfu.github.io/layers-martin/catalog' },
          { id: 'stars-optgeo', type: 'martin', uri: 'https://stars.optgeo.org/catalog' }
        ]
      },
      required_layers: [{ source_id: 'std' }, { source_id: 'bvmap' }],
      provenance: { generated_by: 'test', generated_at: '2026-07-04T00:00:00Z', intent_id: 'test' }
    };

    const { resolved, missing } = await resolveLayers(intent);

    expect(missing).toEqual([]);
    const std = resolved.find((r) => r.source_id === 'std');
    const bvmap = resolved.find((r) => r.source_id === 'bvmap');
    expect(std?.catalog_id).toBe('layers-martin');
    expect(bvmap?.catalog_id).toBe('stars-optgeo');
    expect(bvmap?.tilejson.vector_layers?.length).toBeGreaterThan(0);
  }, 20000);
});

describe('resolveLayers (permissive input, mocked catalog)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Cartographer should be liberal in what it accepts (Postel's law, per
  // project direction): a tilejson version other than "3.x", or the field
  // missing entirely, must not by itself make an otherwise-usable document
  // ("tiles" is a non-empty array of URL strings) unresolvable.
  it('resolves a document with an unexpected/missing tilejson version, as long as "tiles" is usable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ tilejson: '2.2.0', tiles: ['https://example.org/{z}/{x}/{y}.png'] })
      }))
    );

    const intent = intentWith(['legacy_layer']);
    const { resolved, missing } = await resolveLayers(intent);

    expect(missing).toEqual([]);
    expect(resolved.map((r) => r.source_id)).toEqual(['legacy_layer']);
  });

  it('still rejects a response with no usable "tiles" array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ tilejson: '3.0.0' })
      }))
    );

    const intent = intentWith(['no_tiles_layer']);
    const { resolved, missing } = await resolveLayers(intent);

    expect(resolved).toEqual([]);
    expect(missing).toEqual(['no_tiles_layer']);
  });
});

// D39: required_styles/optional_styles reference a whole published Martin
// style (GET {base}/style/{style_id}) rather than a single source_id.
function intentWithStyles(catalog: { id: string; type: string; uri: string }, requiredStyleIds: string[]): MapIntent {
  return {
    spec_version: 'map-intent/v2',
    goal: 'test styles',
    catalog_context: { active_catalogs: [catalog] },
    required_styles: requiredStyleIds.map((style_id) => ({ style_id })),
    provenance: { generated_by: 'test', generated_at: '2026-07-21T00:00:00Z', intent_id: 'test' }
  } as MapIntent;
}

describe('resolveStyles (integration, live stars.optgeo.org catalog)', () => {
  // stars.optgeo.org's catalog currently publishes `"styles": {}` (empty) --
  // styles.vlcm isn't live yet (that's server-side Martin config, out of
  // scope for this repo, D39). GET /style/vlcm 404s with a plain-text "No
  // such style exists" body today, so this exercises the real "reports
  // missing, not an error" path end-to-end without depending on a style
  // that hasn't been published server-side yet.
  it('reports an unpublished style_id as missing rather than fabricating a result', async () => {
    const intent = intentWithStyles({ id: 'stars-optgeo', type: 'martin', uri: 'https://stars.optgeo.org/catalog' }, [
      'vlcm'
    ]);
    const { resolved, missing } = await resolveStyles(intent);

    expect(missing).toEqual(['vlcm']);
    expect(resolved).toEqual([]);
  }, 20000);

  // Confirms the narrower SUPPORTED_STYLE_CATALOG_TYPES gate: a layers_txt
  // catalog (hfu/layers-martin) has no "/style/{id}" endpoint at all (its
  // catalog document has no "styles" key whatsoever), so it must never even
  // be attempted for style resolution.
  it('never resolves a style against a layers_txt catalog', async () => {
    const intent = intentWithStyles(
      { id: 'layers-martin', type: 'layers_txt', uri: 'https://hfu.github.io/layers-martin/catalog' },
      ['vlcm']
    );
    const { resolved, missing } = await resolveStyles(intent);

    expect(missing).toEqual(['vlcm']);
    expect(resolved).toEqual([]);
  }, 20000);
});

describe('resolveStyles (permissive input, mocked catalog)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a published style, tagging it with the resolving catalog_id and required flag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          version: 8,
          sources: { vlcm: { type: 'vector', tiles: ['https://example.org/vlcm/{z}/{x}/{y}'] } },
          layers: [{ id: 'vlcm-natural-fill', type: 'fill', source: 'vlcm', 'source-layer': 'natural' }]
        })
      }))
    );

    const intent = intentWithStyles({ id: 'stars-optgeo', type: 'martin', uri: 'https://stars.optgeo.org/catalog' }, [
      'vlcm'
    ]);
    const { resolved, missing } = await resolveStyles(intent);

    expect(missing).toEqual([]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].style_id).toBe('vlcm');
    expect(resolved[0].required).toBe(true);
    expect(resolved[0].catalog_id).toBe('stars-optgeo');
    expect(resolved[0].style.layers).toHaveLength(1);
  });

  it('rejects a response with no usable "layers" array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ version: 8, sources: {} })
      }))
    );

    const intent = intentWithStyles({ id: 'stars-optgeo', type: 'martin', uri: 'https://stars.optgeo.org/catalog' }, [
      'no_layers_style'
    ]);
    const { resolved, missing } = await resolveStyles(intent);

    expect(resolved).toEqual([]);
    expect(missing).toEqual(['no_layers_style']);
  });
});
