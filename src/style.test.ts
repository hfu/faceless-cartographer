import { describe, expect, it } from 'vitest';
import { buildStyle, computeInitialView } from './style.ts';
import type { MapIntent, ResolvedLayer } from './types.ts';

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

    expect(style.layers.map((l) => l.id)).toEqual(['std', 'hazard', 'extra']);
    expect((style.layers[0].layout as { visibility: string }).visibility).toBe('visible');
    expect((style.layers[2].layout as { visibility: string }).visibility).toBe('none');
    expect(unrenderable).toEqual([]);
  });

  it('adds a source but no renderable layer for vector tiles, and flags it', () => {
    const resolved: ResolvedLayer[] = [
      { source_id: 'std', required: true, catalog_id: 'x', tilejson: tilejson(['https://e/std/{z}/{x}/{y}.png']) },
      { source_id: 'hazard', required: true, catalog_id: 'x', tilejson: tilejson(['https://e/h/{z}/{x}/{y}.pbf']) }
    ];

    const { style, unrenderable } = buildStyle(intent, resolved);

    expect(Object.keys(style.sources)).toContain('hazard');
    expect(style.layers.map((l) => l.id)).toEqual(['std']);
    expect(unrenderable).toEqual(['hazard']);
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
