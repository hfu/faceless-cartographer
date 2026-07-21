import type { MapIntent, ResolvedLayer, ResolvedStyle, VectorLayerDescriptor } from './types.ts';
import baseStyle from './base-style.json' with { type: 'json' };

// A minimal MapLibre style object. Typed loosely here (rather than pulling in
// the maplibre-gl package as a server dependency) since MapLibre GL JS itself
// only runs client-side, loaded from a CDN by the rendered page -- this
// module just produces the JSON it will consume.
export interface MapLibreStyle {
  version: 8;
  sources: Record<string, Record<string, unknown>>;
  layers: Array<Record<string, unknown>>;
  glyphs?: string;
  sprite?: string;
  terrain?: Record<string, unknown>;
}

function isVectorTileUrl(url: string): boolean {
  return /\.(pbf|mvt)(\?|$)/i.test(url);
}

// Opacity for a raster overlay that has another thematic layer stacked beneath
// it, so the lower layer stays visible through it (see the raster occlusion
// handling in buildStyle, D37). Below 1.0 enough to reveal the correspondence,
// high enough to keep hazard/landform colors legible.
const OVERLAY_RASTER_OPACITY = 0.7;

// Generic paint for a vector source-layer whose actual geometry type isn't
// known ahead of time (TileJSON's vector_layers doesn't declare it). Rather
// than guess per layer name/schema (which would tie this code to one
// catalog's naming convention, e.g. stars.optgeo.org's 基盤地図情報 layers),
// add one style layer per geometry type, each filtered with the
// `["geometry-type"]` expression -- MapLibre simply renders nothing for a
// filter that matches no features in that source-layer, so this stays
// correct for any vector catalog that publishes vector_layers, not just the
// one this was written against.
//
// NOTE: Fill layers now include 'paint-blend-mode': 'multiply' to allow
// background hillshade to show through polygon fills (D29). This preserves
// visual relationships between thematic hazard zones and terrain.
function buildVectorSubLayers(sourceId: string, vectorLayers: VectorLayerDescriptor[], visible: string): MapLibreStyle['layers'] {
  const out: MapLibreStyle['layers'] = [];
  for (const vl of vectorLayers) {
    const zoomBounds: Record<string, unknown> = {};
    if (vl.minzoom !== undefined) zoomBounds.minzoom = vl.minzoom;
    if (vl.maxzoom !== undefined) zoomBounds.maxzoom = vl.maxzoom;

    out.push(
      {
        id: `${sourceId}__${vl.id}__fill`,
        type: 'fill',
        source: sourceId,
        'source-layer': vl.id,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#5b7c99', 'fill-opacity': 0.25, 'fill-opacity-transition': { duration: 200 } },
        'paint-blend-mode': 'multiply',
        layout: { visibility: visible },
        ...zoomBounds
      },
      {
        id: `${sourceId}__${vl.id}__line`,
        type: 'line',
        source: sourceId,
        'source-layer': vl.id,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#3a5a75', 'line-width': 1 },
        layout: { visibility: visible },
        ...zoomBounds
      },
      {
        id: `${sourceId}__${vl.id}__circle`,
        type: 'circle',
        source: sourceId,
        'source-layer': vl.id,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': '#3a5a75', 'circle-radius': 2 },
        layout: { visibility: visible },
        ...zoomBounds
      }
    );
  }
  return out;
}

// Layer ordering: required layers first (so a base map listed first in
// required_layers sits underneath), then optional layers on top. Optional
// layers are added to the style but start hidden (visibility: "none"); the
// rendered page provides checkboxes to reveal them -- see DECISIONS.md D4.
//
// Background layers (bvmap + Mapterhorn terrain) are provided by base-style.json
// and are always rendered regardless of Map Intent content -- see DECISIONS.md D24.
// Thematic layers (from Map Intent required_layers/optional_layers) are inserted
// between baseStyle.before (background + hillshade) and baseStyle.after (roads/labels),
// matching the insertion point where kitavolca places VBM/VLCM data.
export function buildStyle(
  intent: MapIntent,
  resolved: ResolvedLayer[],
  resolvedStyles: ResolvedStyle[] = []
): { style: MapLibreStyle; unrenderable: string[]; styleLayerIds: Record<string, string[]> } {
  const sources: MapLibreStyle['sources'] = { ...baseStyle.sources };
  const thematicLayers: MapLibreStyle['layers'] = [];
  const unrenderable: string[] = [];

  const requiredOrder = (intent.required_layers ?? []).map((l) => l.source_id);
  const optionalOrder = (intent.optional_layers ?? []).map((l) => l.source_id);
  const order = [...requiredOrder, ...optionalOrder];

  const bySourceId = new Map(resolved.map((r) => [r.source_id, r]));

  for (const sourceId of order) {
    const layer = bySourceId.get(sourceId);
    if (!layer) continue; // already reported as missing by catalog resolution

    const tileUrl = layer.tilejson.tiles[0];
    const visible = layer.required ? 'visible' : 'none';
    const hasVectorLayers = (layer.tilejson.vector_layers?.length ?? 0) > 0;
    // A real Martin server's tile URLs don't necessarily carry a file
    // extension (e.g. stars.optgeo.org's are .../{z}/{x}/{y} with no
    // suffix), so a vector_layers presence is treated as an equally strong
    // signal as the URL looking like a vector tile.
    if (isVectorTileUrl(tileUrl) || hasVectorLayers) {
      sources[sourceId] = {
        type: 'vector',
        tiles: layer.tilejson.tiles,
        minzoom: layer.tilejson.minzoom,
        maxzoom: layer.tilejson.maxzoom,
        bounds: layer.tilejson.bounds,
        attribution: layer.tilejson.attribution
      };

      // Some vector catalogs (e.g. a real Martin server like
      // stars.optgeo.org, inspecting actual MVT contents) publish
      // vector_layers; hfu/layers-martin deliberately can't (D7: can't
      // recover source-layer names from layers.txt alone). Only render
      // when the schema is actually known -- guessing a source-layer name
      // would be worse than not rendering at all.
      if (hasVectorLayers) {
        thematicLayers.push(...buildVectorSubLayers(sourceId, layer.tilejson.vector_layers!, visible));
      } else {
        unrenderable.push(sourceId);
      }
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
    // Occlusion control (raster analogue of the vector fills' translucency,
    // D29/D37): an opaque raster overlay hides whatever thematic layer sits
    // beneath it -- exactly the correspondence a "重ねて対応を見せる" intent
    // wants visible (layers-martin STAFF_PROMPT D24). A raster that already has
    // a thematic layer stacked below it is drawn semi-transparent; the
    // bottom-most thematic raster (single-overlay / basemap-like use such as an
    // aerial photo) stays fully opaque so it isn't washed out over the
    // grayscale background. `relief` keeps its own dedicated value -- a
    // full-coverage elevation tint meant to let the hillshade show through.
    const rasterOpacity =
      sourceId === 'relief' ? 0.6 : thematicLayers.length > 0 ? OVERLAY_RASTER_OPACITY : 1;
    thematicLayers.push({
      id: sourceId,
      type: 'raster',
      source: sourceId,
      paint: { 'raster-opacity': rasterOpacity },
      layout: { visibility: visible }
    });
  }

  // D39: required_styles/optional_styles reference a whole published Martin
  // style rather than a single source_id. Processed after the layer loop
  // above (its thematicLayers entries land first, style-derived ones after --
  // simple declaration order, not interleaved) and inserted into the same
  // thematic band, keeping the D24 invariant that background (bvmap +
  // Mapterhorn) is always drawn regardless of Map Intent content.
  const styleOrder = [
    ...(intent.required_styles ?? []).map((s) => s.style_id),
    ...(intent.optional_styles ?? []).map((s) => s.style_id)
  ];
  const styleById = new Map(resolvedStyles.map((s) => [s.style_id, s]));
  const styleLayerIds: Record<string, string[]> = {};

  for (const styleId of styleOrder) {
    const resolvedStyle = styleById.get(styleId);
    if (!resolvedStyle) continue; // already reported as missing by catalog resolution

    const styleLayers = resolvedStyle.style.layers;
    if (!Array.isArray(styleLayers) || styleLayers.length === 0) {
      unrenderable.push(styleId);
      continue;
    }

    // Later entries win on source-id collision -- same last-write-wins
    // semantics as the base-then-per-layer source assembly above. A
    // style_id colliding with a source_id string is an unhandled, narrow
    // edge case (last write here wins); Staff is expected to keep the two
    // namespaces distinct in practice.
    Object.assign(sources, resolvedStyle.style.sources ?? {});

    const visible = resolvedStyle.required ? 'visible' : 'none';
    const ids: string[] = [];
    for (const layer of styleLayers) {
      // Force visibility to match required/optional state, same as an
      // individual layer -- overriding whatever the published style itself
      // set, never mutating the original fetched object in place.
      const layerCopy: Record<string, unknown> = {
        ...layer,
        layout: { ...(layer.layout as Record<string, unknown> | undefined), visibility: visible }
      };
      thematicLayers.push(layerCopy);
      ids.push(layerCopy.id as string);
    }
    styleLayerIds[styleId] = ids;
  }

  const contours = (baseStyle as Record<string, unknown>).contours as Array<Record<string, unknown>> | undefined || [];
  const layers = [
    ...baseStyle.before,
    ...thematicLayers,
    ...contours,
    ...baseStyle.after
  ];

  return {
    style: {
      version: 8,
      sources,
      layers,
      glyphs: baseStyle.glyphs,
      sprite: baseStyle.sprite,
      terrain: baseStyle.terrain
    },
    unrenderable,
    styleLayerIds
  };
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
