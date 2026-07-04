import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLayers } from './catalog.ts';
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
