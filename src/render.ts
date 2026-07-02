import type { MapIntent, ResolvedLayer } from './types.ts';
import type { InitialView, MapLibreStyle } from './style.ts';

const MAPLIBRE_VERSION = '5.24.0';
const JS_YAML_VERSION = '5.2.1';

const EXAMPLE_MAP_INTENT = `spec_version: "map-intent/v2"
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
  - source_id: "05_jisuberikeikaikuiki"
    label: "地すべりの警戒区域・特別警戒区域"
  - source_id: "05_kyukeishakeikaikuiki"
    label: "急傾斜地の崩壊の警戒区域・特別警戒区域"
optional_layers:
  - source_id: "landslide"
    label: "地すべり地形分布図（防災科学技術研究所、現況の警戒区域とは別の地形学的観点の補助情報）"
sharing_policy:
  url_share: false
  intent_share: true
provenance:
  generated_by: "manual-test"
  generated_at: "2026-07-02T00:00:00Z"
  intent_id: "test-001"
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; line-height: 1.5; }
  textarea { width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 0.85rem; }
  .error { color: #b00020; white-space: pre-wrap; border: 1px solid #b00020; padding: .75rem; border-radius: 4px; }
  button { cursor: pointer; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// GET / -- the faceless entry point. No map state is ever encoded in the URL;
// this always renders the same form. Pre-filled with a real, catalog-verified
// example (see hfu/layers-martin STAFF_PROMPT.md) so the acceptance test is
// one click away.
export function renderFormPage(opts: { prefill?: string; error?: string } = {}): string {
  const value = escapeHtml(opts.prefill ?? EXAMPLE_MAP_INTENT);
  const errorBlock = opts.error ? `<div class="error">${escapeHtml(opts.error)}</div>` : '';
  return pageShell(
    'faceless-cartographer',
    `
<h1>faceless-cartographer</h1>
<p>Map Intent (YAML) を貼り付けて送信してください。URL には状態を持たせません。</p>
${errorBlock}
<form method="post" action="/">
  <textarea name="map_intent" rows="24">${value}</textarea>
  <p><button type="submit">Render</button></p>
</form>
`
  );
}

// POST / -- renders the map for a validated, resolved Map Intent. Full-bleed
// map with a floating panel (title/notices/controls) overlaid on top-left,
// following the full-screen-map-plus-overlay-panel pattern discussed in
// unopengis/7#869. That issue also uses `hash: "map"` URL-based position
// sharing -- deliberately NOT adopted here, since encoding map state in the
// URL is exactly what ADR 0001 (faceless Cartographer) prohibits. Only the
// visual layout pattern is reused, not the URL-state mechanism.
export function renderMapPage(opts: {
  rawIntent: string;
  intent: MapIntent;
  view: InitialView;
  style: MapLibreStyle;
  resolved: ResolvedLayer[];
  missing: string[];
  unrenderable: string[];
}): string {
  const { rawIntent, intent, view, style, resolved, missing, unrenderable } = opts;

  const missingNotice =
    missing.length > 0
      ? `<div class="notice"><strong>見つからないレイヤー(missing_layers)</strong>: ${missing.map(escapeHtml).join(', ')}</div>`
      : '';
  const unrenderableNotice =
    unrenderable.length > 0
      ? `<div class="notice"><strong>ベクトルタイルのため描画をスキップしたレイヤー</strong>: ${unrenderable
          .map(escapeHtml)
          .join(', ')}(vector_layers が catalog 側に無く、描画に必要なスタイル情報を復元できません)</div>`
      : '';

  const optionalLayers = resolved.filter((r) => !r.required);
  const toggles = optionalLayers
    .map(
      (r) =>
        `<label style="display:block"><input type="checkbox" data-layer-toggle="${escapeHtml(r.source_id)}"> ${escapeHtml(
          r.label ?? r.source_id
        )}</label>`
    )
    .join('\n');

  const viewJson = JSON.stringify(view);
  const styleJson = JSON.stringify(style);

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml('faceless-cartographer')}</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; font-family: system-ui, sans-serif; }
  #map { position: fixed; inset: 0; }
  .panel {
    position: absolute;
    top: 1rem;
    left: 1rem;
    max-width: 22rem;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: 10px;
    padding: .9rem 1rem;
    box-shadow: 0 2px 16px rgba(0, 0, 0, 0.18);
    z-index: 10;
    line-height: 1.45;
    font-size: 0.88rem;
  }
  .panel h1 { font-size: 1rem; margin: 0 0 .4rem; }
  .panel .notice { color: #7a5b00; background: rgba(216, 169, 0, 0.14); border-radius: 6px; padding: .5rem .6rem; margin: .4rem 0; font-size: 0.82rem; }
  .panel .layers { margin: .5rem 0; }
  .panel .layers strong { display: block; margin-bottom: .2rem; }
  .panel .actions { display: flex; gap: .5rem; align-items: center; margin-top: .6rem; }
  button { cursor: pointer; }
</style>
</head>
<body>
<div id="map"></div>
<div class="panel">
  <h1>faceless-cartographer</h1>
  <p>${escapeHtml(intent.goal)}</p>
  ${missingNotice}
  ${unrenderableNotice}
  ${optionalLayers.length > 0 ? `<div class="layers"><strong>任意レイヤー</strong>${toggles}</div>` : ''}
  <div class="actions">
    <button id="copy-intent" type="button">Copy Map Intent</button>
    <a href="/">戻る</a>
  </div>
</div>
<textarea id="raw-intent" hidden>${escapeHtml(rawIntent)}</textarea>

<script src="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js"></script>
<link href="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css" rel="stylesheet">
<script type="module">
  import { load as yamlLoad, dump as yamlDump } from 'https://unpkg.com/js-yaml@${JS_YAML_VERSION}/dist/js-yaml.mjs';

  const view = ${viewJson};
  const style = ${styleJson};

  const map = new maplibregl.Map({
    container: 'map',
    style,
    center: view.center,
    zoom: view.zoom,
    bearing: view.bearing,
    pitch: view.pitch
  });
  if (view.bounds) {
    map.fitBounds(view.bounds, { padding: 40, duration: 0 });
  }
  map.addControl(new maplibregl.NavigationControl());

  document.querySelectorAll('[data-layer-toggle]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-layer-toggle');
      map.setLayoutProperty(id, 'visibility', e.target.checked ? 'visible' : 'none');
    });
  });

  // Copy Map Intent with the *current* view baked into render_hints, so the
  // copied text reproduces what's on screen right now, not just the
  // original submission (map-intent-vnext.md §5: render_hints exist for
  // "practical re-opening"). Falls back to copying the unmodified text if
  // the YAML can't be round-tripped for any reason.
  const copyButton = document.getElementById('copy-intent');
  copyButton.addEventListener('click', async () => {
    const original = document.getElementById('raw-intent').value;
    let toCopy = original;
    try {
      const doc = yamlLoad(original) || {};
      const center = map.getCenter();
      doc.render_hints = {
        ...(doc.render_hints || {}),
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch()
      };
      toCopy = yamlDump(doc);
    } catch (e) {
      console.error('Could not update render_hints before copying; copying the original Map Intent instead.', e);
    }
    await navigator.clipboard.writeText(toCopy);
    const label = copyButton.textContent;
    copyButton.textContent = 'Copied!';
    setTimeout(() => { copyButton.textContent = label; }, 1500);
  });
</script>
</body>
</html>`;
}
