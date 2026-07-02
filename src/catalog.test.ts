import { describe, expect, it } from 'vitest';
import { resolveLayers } from './catalog.ts';
import type { MapIntent } from './types.ts';

// These hit the real hfu/layers-martin catalog over the network, by design
// (JUMPSTART.md: "there's no mock catalog to build against, this is the real
// reference implementation"). If layers-martin's catalog changes shape or
// these specific source_ids stop existing, that's itself useful signal.

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
