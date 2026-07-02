import type { MapIntent, ResolvedLayer } from './types.ts';

// A minimal MapLibre style object. Typed loosely here (rather than pulling in
// the maplibre-gl package as a server dependency) since MapLibre GL JS itself
// only runs client-side, loaded from a CDN by the rendered page -- this
// module just produces the JSON it will consume.
export interface MapLibreStyle {
  version: 8;
  sources: Record<string, Record<string, unknown>>;
  layers: Array<Record<string, unknown>>;
  glyphs?: string;
}

function isVectorTileUrl(url: string): boolean {
  return /\.(pbf|mvt)(\?|$)/i.test(url);
}

// Layer ordering: required layers first (so a base map listed first in
// required_layers sits underneath), then optional layers on top -- per
// JUMPSTART.md "Catalog resolution" §4. Optional layers are added to the
// style but start hidden (visibility: "none"); the rendered page provides
// checkboxes to reveal them, matching JUMPSTART.md's "can be toggled off by
// default" note.
export function buildStyle(intent: MapIntent, resolved: ResolvedLayer[]): { style: MapLibreStyle; unrenderable: string[] } {
  const sources: MapLibreStyle['sources'] = {};
  const layers: MapLibreStyle['layers'] = [];
  const unrenderable: string[] = [];

  const requiredOrder = intent.required_layers.map((l) => l.source_id);
  const optionalOrder = (intent.optional_layers ?? []).map((l) => l.source_id);
  const order = [...requiredOrder, ...optionalOrder];

  const bySourceId = new Map(resolved.map((r) => [r.source_id, r]));

  for (const sourceId of order) {
    const layer = bySourceId.get(sourceId);
    if (!layer) continue; // already reported as missing by catalog resolution

    const tileUrl = layer.tilejson.tiles[0];
    const visible = layer.required ? 'visible' : 'none';

    if (isVectorTileUrl(tileUrl)) {
      // Vector tile TileJSON from layers-martin deliberately omits
      // vector_layers (source-layer names can't be recovered from
      // layers.txt alone -- see that repo's DECISIONS.md D7), so a
      // meaningful paint/fill layer can't be constructed generically. Add
      // the source for completeness but skip adding a renderable layer,
      // and surface this as a known limitation rather than guessing at a
      // source-layer name.
      sources[sourceId] = {
        type: 'vector',
        tiles: layer.tilejson.tiles,
        minzoom: layer.tilejson.minzoom,
        maxzoom: layer.tilejson.maxzoom,
        bounds: layer.tilejson.bounds,
        attribution: layer.tilejson.attribution
      };
      unrenderable.push(sourceId);
      continue;
    }

    sources[sourceId] = {
      type: 'raster',
      tiles: layer.tilejson.tiles,
      tileSize: 256,
      minzoom: layer.tilejson.minzoom,
      maxzoom: layer.tilejson.maxzoom,
      bounds: layer.tilejson.bounds,
      attribution: layer.tilejson.attribution
    };
    layers.push({
      id: sourceId,
      type: 'raster',
      source: sourceId,
      layout: { visibility: visible }
    });
  }

  return { style: { version: 8, sources, layers }, unrenderable };
}

export interface InitialView {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  bounds?: [number, number, number, number];
}

// Default view when neither render_hints nor area.bbox nor any required
// layer's bounds give us something to work with: Japan-wide, since the
// reference Library (hfu/layers-martin) is GSI-derived data.
const DEFAULT_VIEW: InitialView = { center: [138.0, 38.0], zoom: 5, bearing: 0, pitch: 0 };

export function computeInitialView(intent: MapIntent, resolved: ResolvedLayer[]): InitialView {
  const hints = intent.render_hints;
  if (hints?.center) {
    return {
      center: hints.center,
      zoom: hints.zoom ?? DEFAULT_VIEW.zoom,
      bearing: hints.bearing ?? DEFAULT_VIEW.bearing,
      pitch: hints.pitch ?? DEFAULT_VIEW.pitch
    };
  }

  if (intent.area?.bbox) {
    return { ...DEFAULT_VIEW, bounds: intent.area.bbox };
  }

  const requiredBounds = resolved
    .filter((r) => r.required && r.tilejson.bounds)
    .map((r) => r.tilejson.bounds as [number, number, number, number]);
  if (requiredBounds.length > 0) {
    const combined = requiredBounds.reduce<[number, number, number, number]>(
      (acc, b) => [Math.min(acc[0], b[0]), Math.min(acc[1], b[1]), Math.max(acc[2], b[2]), Math.max(acc[3], b[3])],
      requiredBounds[0]
    );
    return { ...DEFAULT_VIEW, bounds: combined };
  }

  return DEFAULT_VIEW;
}
