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

// The live source (fetched in staffPrompt.ts) is a full HANDOVER-style
// document with repo-ownership commentary etc.; only the fenced ````text
// block is the actual prompt meant to be pasted into a Staff system prompt.
// Falls back to the whole document if the fence markers aren't found (e.g.
// upstream reformatting), so something is always shown rather than nothing.
function extractStaffPromptBlock(markdown: string): string {
  const match = markdown.match(/````text\n([\s\S]*?)\n````/);
  return (match ? match[1] : markdown).trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Shared look between GET / and POST / (per direction: keep the two pages
// visually related). Both use the same card treatment (white, rounded,
// shadowed) and font; POST's card floats over a full-bleed map, GET's is
// the whole page since there's no map to show yet. Mobile-first: the card
// has no fixed width, just a max-width capped to the viewport, so it works
// down to narrow phone screens without a separate breakpoint set.
const SHARED_CSS = `
  :root { --card-bg: rgba(255,255,255,0.92); --shadow: 0 2px 16px rgba(0,0,0,0.18); --radius: 10px; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; }
  button { cursor: pointer; font: inherit; }
  code { background: rgba(0,0,0,0.06); padding: .1rem .3rem; border-radius: 4px; }
  .notice { color: #7a5b00; background: rgba(216, 169, 0, 0.14); border-radius: 6px; padding: .5rem .6rem; margin: .4rem 0; font-size: 0.82rem; }
`;

// GET / -- the faceless entry point. No map state is ever encoded in the URL;
// this always renders the same form. Pre-filled with a real, catalog-verified
// example (see hfu/layers-martin STAFF_PROMPT.md) so the acceptance test is
// one click away. The current best Staff prompt is included below the form
// so anyone setting up a Staff agent against this Cartographer + Library
// combination has it at hand without leaving the page.
export function renderFormPage(opts: { prefill?: string; error?: string; staffPromptMarkdown: string }): string {
  const value = escapeHtml(opts.prefill ?? EXAMPLE_MAP_INTENT);
  const errorBlock = opts.error ? `<div class="notice" style="color:#b00020;background:rgba(176,0,32,0.08);">${escapeHtml(opts.error)}</div>` : '';
  const staffPrompt = escapeHtml(extractStaffPromptBlock(opts.staffPromptMarkdown));

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>faceless-cartographer</title>
<style>
${SHARED_CSS}
  body { background: #f2f1ee; padding: 1.25rem; }
  .wrap { max-width: 42rem; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; }
  .card { background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow); padding: 1.25rem 1.5rem; }
  .card h1 { font-size: 1.15rem; margin: 0 0 .3rem; }
  .card h2 { font-size: 0.95rem; margin: 0 0 .5rem; }
  textarea { width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 0.82rem; border-radius: 6px; border: 1px solid #ccc; padding: .6rem; }
  pre { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 0.78rem; max-height: 24rem; overflow-y: auto; background: rgba(0,0,0,0.04); border-radius: 6px; padding: .75rem; margin: 0; }
  summary { cursor: pointer; font-weight: 600; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>faceless-cartographer</h1>
    <p>Map Intent (YAML) を貼り付けて送信してください。URL には状態を持たせません。</p>
    ${errorBlock}
    <form method="post" action="/">
      <textarea name="map_intent" rows="22">${value}</textarea>
      <p><button type="submit">Render</button></p>
    </form>
  </div>
  <div class="card">
    <details>
      <summary>現在の Staff プロンプト(<a href="https://github.com/hfu/layers-martin/blob/main/STAFF_PROMPT.md" target="_blank" rel="noreferrer">hfu/layers-martin STAFF_PROMPT.md</a> より取得)</summary>
      <p style="font-size:0.82rem;color:#555;">このCartographerと組み合わせて使う Staff エージェントのシステムプロンプトに、そのまま追加できる内容です。</p>
      <pre>${staffPrompt}</pre>
    </details>
  </div>
</div>
</body>
</html>`;
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
  urlShareWarning: boolean;
}): string {
  const { rawIntent, intent, view, style, resolved, missing, unrenderable, urlShareWarning } = opts;

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
  const urlShareNotice = urlShareWarning
    ? `<div class="notice">この Map Intent は <code>sharing_policy.url_share: true</code> を指定していますが、この Cartographer は faceless 構成(URLに状態を持たせない)で動作しているため無視されます。共有は Map Intent のテキスト自体で行ってください。</div>`
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

  // Legend images, keyed by source_id, for whichever layers currently have
  // one (hfu/layers-martin DECISIONS.md D18: legend_image_url extension).
  // Populated into the legend panel client-side, filtered to only the
  // layers that are actually visible right now (same principle as
  // MapLibre's own attribution control -- see hfu/layers-martin
  // STAFF_PROMPT.md's note on attribution visibility, D17), so it stays
  // useful rather than cluttered when Staff sends many layers.
  const legendBySourceId = Object.fromEntries(
    resolved.filter((r) => r.tilejson.legend_image_url).map((r) => [r.source_id, { url: r.tilejson.legend_image_url, label: r.label ?? r.source_id }])
  );
  const requiredVisibleIds = resolved.filter((r) => r.required).map((r) => r.source_id);

  const viewJson = JSON.stringify(view);
  const styleJson = JSON.stringify(style);
  const legendJson = JSON.stringify(legendBySourceId);
  const requiredVisibleJson = JSON.stringify(requiredVisibleIds);
  const missingJson = JSON.stringify(missing);
  const unrenderableJson = JSON.stringify(unrenderable);

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>faceless-cartographer</title>
<style>
${SHARED_CSS}
  html, body { height: 100%; overflow: hidden; }
  #map { position: fixed; inset: 0; }
  .panel {
    position: absolute;
    top: 1rem;
    left: 1rem;
    right: 1rem;
    max-width: 22rem;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    background: var(--card-bg);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: var(--radius);
    padding: .9rem 1rem;
    box-shadow: var(--shadow);
    z-index: 10;
    line-height: 1.45;
    font-size: 0.88rem;
  }
  .panel h1 { font-size: 1rem; margin: 0 0 .4rem; }
  .panel .layers { margin: .5rem 0; }
  .panel .layers strong { display: block; margin-bottom: .2rem; }
  .panel .actions { display: flex; gap: .5rem; align-items: center; margin-top: .6rem; flex-wrap: wrap; }

  /* Legend: bottom-right is the web-map convention. Collapsible so it
     doesn't compete for screen space with the map, especially on phones. */
  #legend {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    max-width: min(16rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    background: var(--card-bg);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    z-index: 10;
    font-size: 0.82rem;
    display: none;
  }
  #legend[data-has-entries="true"] { display: block; }
  #legend summary { padding: .5rem .7rem; font-weight: 600; }
  #legend .legend-body { padding: 0 .7rem .7rem; }
  #legend .legend-entry { margin-top: .5rem; }
  #legend .legend-entry .label { display: block; font-size: 0.76rem; color: #444; margin-bottom: .2rem; }
  #legend .legend-entry img { max-width: 100%; display: block; border-radius: 4px; }

  /* Mobile-first: on narrow screens, let the top panel take the full width
     instead of a fixed max-width column, and keep the legend from growing
     wider than the viewport allows. */
  @media (max-width: 30rem) {
    .panel { max-width: none; }
  }

  /* MapLibre's own controls: keep NavigationControl at top-right (default)
     and move the default AttributionControl to bottom-left so it doesn't
     collide with the legend panel at bottom-right. */
  .maplibregl-ctrl-bottom-left { max-width: calc(100vw - 12rem); }
</style>
</head>
<body>
<div id="map"></div>
<div class="panel">
  <h1>faceless-cartographer</h1>
  <p>${escapeHtml(intent.goal)}</p>
  ${missingNotice}
  ${unrenderableNotice}
  ${urlShareNotice}
  ${optionalLayers.length > 0 ? `<div class="layers"><strong>任意レイヤー</strong>${toggles}</div>` : ''}
  <div class="actions">
    <button id="copy-intent" type="button">Copy Map Intent</button>
    <a href="/">戻る</a>
  </div>
</div>
<details id="legend">
  <summary>凡例</summary>
  <div class="legend-body"></div>
</details>
<textarea id="raw-intent" hidden>${escapeHtml(rawIntent)}</textarea>

<script src="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js"></script>
<link href="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css" rel="stylesheet">
<script type="module">
  import { load as yamlLoad, dump as yamlDump } from 'https://unpkg.com/js-yaml@${JS_YAML_VERSION}/dist/js-yaml.mjs';

  const view = ${viewJson};
  const style = ${styleJson};
  const legendBySourceId = ${legendJson};
  const missingLayers = ${missingJson};
  const unrenderableLayers = ${unrenderableJson};

  const map = new maplibregl.Map({
    container: 'map',
    style,
    center: view.center,
    zoom: view.zoom,
    bearing: view.bearing,
    pitch: view.pitch,
    attributionControl: false
  });
  if (view.bounds) {
    map.fitBounds(view.bounds, { padding: 40, duration: 0 });
  }
  map.addControl(new maplibregl.NavigationControl());
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

  // Legend: only show entries for layers that are currently visible, same
  // principle MapLibre already applies to attribution (see
  // hfu/layers-martin STAFF_PROMPT.md D17 note). Recomputed whenever a
  // layer's visibility changes.
  const legendRoot = document.getElementById('legend');
  const legendBody = legendRoot.querySelector('.legend-body');
  const visibility = {};
  Object.keys(legendBySourceId).forEach((id) => { visibility[id] = false; });
  ${requiredVisibleJson}.forEach((id) => { visibility[id] = true; });

  function renderLegend() {
    const entries = Object.entries(legendBySourceId).filter(([id]) => visibility[id]);
    legendRoot.dataset.hasEntries = entries.length > 0 ? 'true' : 'false';
    legendBody.innerHTML = entries
      .map(([, entry]) => {
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = entry.label;
        const img = document.createElement('img');
        img.src = entry.url;
        img.alt = entry.label;
        img.loading = 'lazy';
        const wrap = document.createElement('div');
        wrap.className = 'legend-entry';
        wrap.append(label, img);
        return wrap.outerHTML;
      })
      .join('');
  }
  renderLegend();

  document.querySelectorAll('[data-layer-toggle]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-layer-toggle');
      map.setLayoutProperty(id, 'visibility', e.target.checked ? 'visible' : 'none');
      visibility[id] = e.target.checked;
      renderLegend();
    });
  });

  // Copy Map Intent with the *current* view baked into render_hints, so the
  // copied text reproduces what's on screen right now, not just the
  // original submission (map-intent-vnext.md §5: render_hints exist for
  // "practical re-opening"). If this render had resolution problems
  // (missing/unrenderable layers, an ignored url_share request), those are
  // embedded too as a non-normative "cartographer_feedback" extension field
  // -- an optional feedback loop back to Staff: a capable Staff agent that
  // receives this Map Intent back (e.g. the User pastes it back in for a
  // follow-up question) can read what didn't resolve last time and adjust,
  // without Cartographer needing a separate machine-readable API. Only
  // added when there's actually something to report, so a clean render
  // stays a clean copy. Falls back to copying the unmodified text if the
  // YAML can't be round-tripped for any reason.
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
      if (missingLayers.length > 0 || unrenderableLayers.length > 0) {
        doc.cartographer_feedback = {
          missing_layers: missingLayers,
          unrenderable_layers: unrenderableLayers
        };
      }
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
