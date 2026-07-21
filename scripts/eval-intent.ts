// Map Intent evaluation harness.
//
// Given one or more Map Intent YAML files, computes objective quality metrics
// by reusing the Cartographer's own resolution pipeline. Used to drive
// empirical, metric-based improvement of a Staff prompt (e.g. hfu/layers-martin
// STAFF_PROMPT.md): generate intents, score them, fix the prompt, re-score.
//
// Run with Node's native TypeScript stripping (no build step):
//   node --experimental-strip-types scripts/eval-intent.ts <file.yaml> [more.yaml...]
//
// Metrics (see the project discussion in DECISIONS / STAFF_PROMPT iteration):
//   M1 parse        schema-valid per parseMapIntent (mapIntent.ts)
//   M2 resolution   resolved / (resolved + missing), across BOTH required_layers/
//                   optional_layers (source_id) and required_styles/optional_styles
//                   (style_id, D39) -- target 1.0
//   M3 renderable   renderable / resolved, same combined layers+styles pool -- target 1.0
//                   (a vector source with no vector_layers is unrenderable, D5/D23;
//                   a resolved style with no usable `layers` array is unrenderable, D39)
//   M4 data_in_view fraction of resolved *raster* layers whose tile at the
//                   area.bbox centre returns real (non-trivial) data
//                   (styles aren't probed here -- they resolve/render as a unit,
//                   D39 doesn't expose a per-style raster tile URL to sample)
//   M5 framing      area.bbox present and well-formed
//   M6 extra_keys   non-spec top-level keys (reported, not failed -- spec
//                   tolerates unknown keys, but rendering-critical info in a
//                   non-spec key would be silently ignored)
//
// A file "passes" when M1 ok, M2 == 1, M3 == 1, and M5 ok. M4/M6 are reported
// for judgement, not gated (a layer can legitimately have no data at a given
// spot, and output_notes-style keys are allowed).

import { readFileSync } from 'node:fs';
import { load as yamlLoad } from 'js-yaml';
import { parseMapIntent } from '../src/mapIntent.ts';
import { resolveLayers, resolveStyles } from '../src/catalog.ts';
import type { MapIntent, ResolvedLayer, ResolvedStyle } from '../src/types.ts';

const SPEC_TOP_LEVEL_KEYS = new Set([
  'spec_version',
  'goal',
  'area',
  'catalog_context',
  'required_layers',
  'optional_layers',
  'required_styles',
  'optional_styles',
  'relationships_to_highlight',
  'render_hints',
  'sharing_policy',
  'provenance'
]);

// A resolved style is renderable iff it has at least one usable layer --
// mirrors buildStyle's own unrenderable check (style.ts, D39): an empty or
// missing `layers` array means nothing to draw, even though the style_id
// itself resolved.
function isRenderableStyle(style: ResolvedStyle): boolean {
  return Array.isArray(style.style.layers) && style.style.layers.length > 0;
}

// A resolved layer is unrenderable when it is a vector tile source (tiles URL
// ends in .pbf/.mvt) that carries no vector_layers schema -- the Cartographer
// can add the source but cannot build any draw layers from it (style.ts / D5).
function isRenderable(layer: ResolvedLayer): boolean {
  const url = layer.tilejson.tiles?.[0] ?? '';
  const isVector = /\.(pbf|mvt)(\?|$)/i.test(url);
  if (!isVector) return true; // raster: always renderable
  return Array.isArray(layer.tilejson.vector_layers) && layer.tilejson.vector_layers.length > 0;
}

// The Cartographer renders a source as raster iff it is neither a vector-tile
// URL nor carries a vector_layers schema (style.ts buildStyle). Mirror that so
// the data-in-view probe only runs on layers actually drawn as raster.
function isRasterLayer(layer: ResolvedLayer): boolean {
  const url = layer.tilejson.tiles?.[0] ?? '';
  const isVectorUrl = /\.(pbf|mvt)(\?|$)/i.test(url);
  const hasVectorLayers = Array.isArray(layer.tilejson.vector_layers) && layer.tilejson.vector_layers.length > 0;
  return !isVectorUrl && !hasVectorLayers;
}

function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

// Pick a zoom for the sample tile: aim for ~12 but clamp into the layer's
// advertised [minzoom, maxzoom] so we don't request a level it doesn't serve.
function pickZoom(layer: ResolvedLayer): number {
  const min = typeof layer.tilejson.minzoom === 'number' ? layer.tilejson.minzoom : 0;
  const max = typeof layer.tilejson.maxzoom === 'number' ? layer.tilejson.maxzoom : 18;
  return Math.max(min, Math.min(max, 12));
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Does this raster layer actually have data at the map's focus point? Fetch the
// single tile covering the bbox centre and treat a 200 with a non-trivial body
// as "has data". Fully-transparent GSI tiles are typically served as 404 or as
// a tiny (<1 KB) blank PNG, so a size threshold separates real content from
// blank fills without decoding pixels.
async function hasDataInView(
  layer: ResolvedLayer,
  center: { lon: number; lat: number }
): Promise<{ ok: boolean; note: string }> {
  const template = layer.tilejson.tiles?.[0];
  if (!template) return { ok: false, note: 'no tiles url' };
  const z = pickZoom(layer);
  const { x, y } = lonLatToTile(center.lon, center.lat, z);
  const url = template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{s}', 'a');
  const res = await fetchWithTimeout(url, 8000);
  if (!res) return { ok: false, note: `fetch failed z${z}/${x}/${y}` };
  if (!res.ok) return { ok: false, note: `HTTP ${res.status} z${z}/${x}/${y}` };
  const buf = await res.arrayBuffer();
  const bytes = buf.byteLength;
  return { ok: bytes > 1000, note: `${bytes}B z${z}/${x}/${y}` };
}

function bboxCenter(intent: MapIntent): { lon: number; lat: number } | null {
  const bbox = intent.area?.bbox;
  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => typeof n === 'number')) {
    return { lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
  }
  const c = intent.render_hints?.center;
  if (Array.isArray(c) && c.length === 2) return { lon: c[0], lat: c[1] };
  return null;
}

interface Scorecard {
  file: string;
  m1_parse: boolean;
  parseError?: string;
  m2_resolution: number | null;
  missing: string[];
  m3_renderable: number | null;
  unrenderable: string[];
  m4_data: string | null;
  m5_framing: boolean;
  m6_extraKeys: string[];
  pass: boolean;
}

async function evaluate(file: string): Promise<Scorecard> {
  const yamlText = readFileSync(file, 'utf8');
  const parsed = parseMapIntent(yamlText);
  if (!parsed.ok) {
    return {
      file,
      m1_parse: false,
      parseError: parsed.error,
      m2_resolution: null,
      missing: [],
      m3_renderable: null,
      unrenderable: [],
      m4_data: null,
      m5_framing: false,
      m6_extraKeys: [],
      pass: false
    };
  }

  const intent = parsed.intent;
  const raw = (yamlLoad(yamlText) as Record<string, unknown>) ?? {};
  const extraKeys = Object.keys(raw).filter((k) => !SPEC_TOP_LEVEL_KEYS.has(k));

  const [{ resolved, missing }, { resolved: resolvedStyles, missing: missingStyles }] = await Promise.all([
    resolveLayers(intent),
    resolveStyles(intent)
  ]);
  const total = resolved.length + missing.length + resolvedStyles.length + missingStyles.length;
  const m2 = total > 0 ? (resolved.length + resolvedStyles.length) / total : 0;

  const renderableLayers = resolved.filter(isRenderable);
  const renderableStyles = resolvedStyles.filter(isRenderableStyle);
  const unrenderable = [
    ...resolved.filter((l) => !isRenderable(l)).map((l) => l.source_id),
    ...resolvedStyles.filter((s) => !isRenderableStyle(s)).map((s) => s.style_id)
  ];
  const resolvedTotal = resolved.length + resolvedStyles.length;
  const m3 = resolvedTotal > 0 ? (renderableLayers.length + renderableStyles.length) / resolvedTotal : 1;

  const center = bboxCenter(intent);
  let m4: string | null = null;
  if (center) {
    const rasters = resolved.filter(isRasterLayer);
    const results = await Promise.all(rasters.map((l) => hasDataInView(l, center)));
    const withData = results.filter((r) => r.ok).length;
    const detail = rasters
      .map((l, i) => `${l.source_id}:${results[i].ok ? 'Y' : 'N'}(${results[i].note})`)
      .join(', ');
    m4 = `${withData}/${rasters.length} [${detail}]`;
  }

  const m5 = center !== null && Array.isArray(intent.area?.bbox);

  const pass = m2 === 1 && m3 === 1 && m5;

  return {
    file,
    m1_parse: true,
    m2_resolution: m2,
    missing: [...missing, ...missingStyles],
    m3_renderable: m3,
    unrenderable,
    m4_data: m4,
    m5_framing: m5,
    m6_extraKeys: extraKeys,
    pass
  };
}

function fmt(n: number | null): string {
  return n === null ? 'n/a' : n.toFixed(2);
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: node --experimental-strip-types scripts/eval-intent.ts <file.yaml> [...]');
    process.exit(2);
  }

  const cards: Scorecard[] = [];
  for (const file of files) {
    const card = await evaluate(file);
    cards.push(card);
    console.log(`\n=== ${file} ===`);
    if (!card.m1_parse) {
      console.log(`  M1 parse:      FAIL -- ${card.parseError}`);
      console.log('  RESULT: FAIL');
      continue;
    }
    console.log('  M1 parse:      OK');
    console.log(
      `  M2 resolution: ${fmt(card.m2_resolution)}${card.missing.length ? `  missing: ${card.missing.join(', ')}` : ''}`
    );
    console.log(
      `  M3 renderable: ${fmt(card.m3_renderable)}${card.unrenderable.length ? `  unrenderable: ${card.unrenderable.join(', ')}` : ''}`
    );
    console.log(`  M4 data_view:  ${card.m4_data ?? 'n/a (no bbox/center)'}`);
    console.log(`  M5 framing:    ${card.m5_framing ? 'OK' : 'FAIL (no bbox)'}`);
    console.log(`  M6 extra_keys: ${card.m6_extraKeys.length ? card.m6_extraKeys.join(', ') : 'none'}`);
    console.log(`  RESULT: ${card.pass ? 'PASS' : 'FAIL'}`);
  }

  const passed = cards.filter((c) => c.pass).length;
  console.log(`\n----- SUITE: ${passed}/${cards.length} passed -----`);
}

main();
