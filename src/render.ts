import maplibregl from 'maplibre-gl';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import type { MapIntent, ResolvedLayer } from './types.ts';
import type { InitialView, MapLibreStyle } from './style.ts';

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

// staff-prompt.txt (fetched at build time, see scripts/fetch-staff-prompt.mjs)
// is the full HANDOVER-style hfu/layers-martin STAFF_PROMPT.md document;
// only the fenced ````text block is the actual prompt meant to be pasted
// into a Staff system prompt. Falls back to the whole document if the fence
// markers aren't found (e.g. upstream reformatting), so something is always
// shown rather than nothing.
function extractStaffPromptBlock(markdown: string): string {
  const match = markdown.match(/````text\n([\s\S]*?)\n````/);
  return (match ? match[1] : markdown).trim();
}

// GET /-equivalent view: the faceless entry point. No map state is ever
// encoded in the URL -- this is a single static page, and "submitting" the
// form is a client-side transition to renderMapView, not a navigation.
// Pre-filled with a real, catalog-verified example (see
// hfu/layers-martin STAFF_PROMPT.md) so the acceptance test is one click
// away. The current best Staff prompt is included below the form so anyone
// setting up a Staff agent against this Cartographer + Library combination
// has it at hand without leaving the page.
export function renderFormView(
  container: HTMLElement,
  opts: { prefill?: string; error?: string; staffPromptMarkdown: string; onSubmit: (rawIntent: string) => void }
): void {
  const value = escapeHtml(opts.prefill ?? EXAMPLE_MAP_INTENT);
  const errorBlock = opts.error ? `<div class="notice error">${escapeHtml(opts.error)}</div>` : '';
  const staffPromptRaw = extractStaffPromptBlock(opts.staffPromptMarkdown);
  const staffPrompt = escapeHtml(staffPromptRaw);

  container.innerHTML = `
<div class="form-view">
  <div class="wrap">
    <div class="card">
      <h1>faceless-cartographer</h1>
      <p>Map Intent (YAML) を貼り付けて送信してください。URL には状態を持たせません。</p>
      ${errorBlock}
      <form id="intent-form">
        <textarea name="map_intent" rows="22">${value}</textarea>
        <p><button type="submit">Render</button></p>
      </form>
    </div>
    <div class="card">
      <details>
        <summary>現在の Staff プロンプト</summary>
        <p style="font-size:0.82rem;color:#555;">このCartographerと組み合わせて使う Staff エージェントのシステムプロンプトに、そのまま追加できる内容です。取得元: <a href="https://github.com/hfu/layers-martin/blob/main/STAFF_PROMPT.md" target="_blank" rel="noreferrer">hfu/layers-martin STAFF_PROMPT.md</a></p>
        <p><button id="copy-staff-prompt" type="button">Copy Staff Prompt</button></p>
        <pre>${staffPrompt}</pre>
      </details>
    </div>
  </div>
</div>`;

  const copyPromptButton = container.querySelector<HTMLButtonElement>('#copy-staff-prompt')!;
  copyPromptButton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(staffPromptRaw);
    const label = copyPromptButton.textContent;
    copyPromptButton.textContent = 'Copied!';
    setTimeout(() => {
      copyPromptButton.textContent = label;
    }, 1500);
  });

  const form = container.querySelector<HTMLFormElement>('#intent-form')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea[name=map_intent]')!;
    opts.onSubmit(textarea.value);
  });
}

// POST /-equivalent view: renders the map for a validated, resolved Map
// Intent. Full-bleed map with a floating panel (title/notices/controls)
// overlaid on top-left, following the full-screen-map-plus-overlay-panel
// pattern discussed in unopengis/7#869. That issue also uses `hash: "map"`
// URL-based position sharing -- deliberately NOT adopted here, since
// encoding map state in the URL is exactly what ADR 0001 (faceless
// Cartographer) prohibits. Only the visual layout pattern is reused, not
// the URL-state mechanism.
export function renderMapView(
  container: HTMLElement,
  opts: {
    rawIntent: string;
    intent: MapIntent;
    view: InitialView;
    style: MapLibreStyle;
    resolved: ResolvedLayer[];
    missing: string[];
    unrenderable: string[];
    urlShareWarning: boolean;
    onBack: () => void;
  }
): void {
  const { rawIntent, intent, view, style, resolved, missing, unrenderable, urlShareWarning, onBack } = opts;

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

  container.innerHTML = `
<div class="map-view">
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
      <button id="back-button" type="button">戻る</button>
    </div>
  </div>
  <details id="legend">
    <summary>凡例</summary>
    <div class="legend-body"></div>
  </details>
</div>`;

  const map = new maplibregl.Map({
    container: container.querySelector('#map') as HTMLElement,
    style: style as maplibregl.StyleSpecification,
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

  // Legend images, keyed by source_id, for whichever layers currently have
  // one (hfu/layers-martin DECISIONS.md D18: legend_image_url extension).
  // Only shown for layers that are actually visible right now (same
  // principle as MapLibre's own attribution control -- see
  // hfu/layers-martin STAFF_PROMPT.md's note on attribution visibility,
  // D17), so it stays useful rather than cluttered when Staff sends many
  // layers.
  const legendBySourceId = new Map(
    resolved.filter((r) => r.tilejson.legend_image_url).map((r) => [r.source_id, { url: r.tilejson.legend_image_url!, label: r.label ?? r.source_id }])
  );
  const visibility = new Map<string, boolean>();
  legendBySourceId.forEach((_v, id) => visibility.set(id, false));
  resolved.filter((r) => r.required).forEach((r) => visibility.set(r.source_id, true));

  const legendRoot = container.querySelector<HTMLElement>('#legend')!;
  const legendBody = legendRoot.querySelector<HTMLElement>('.legend-body')!;

  function renderLegend() {
    const entries = [...legendBySourceId.entries()].filter(([id]) => visibility.get(id));
    legendRoot.dataset.hasEntries = entries.length > 0 ? 'true' : 'false';
    legendBody.innerHTML = '';
    for (const [, entry] of entries) {
      const wrap = document.createElement('div');
      wrap.className = 'legend-entry';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = entry.label;
      const img = document.createElement('img');
      img.src = entry.url;
      img.alt = entry.label;
      img.loading = 'lazy';
      wrap.append(label, img);
      legendBody.append(wrap);
    }
  }
  renderLegend();

  container.querySelectorAll<HTMLInputElement>('[data-layer-toggle]').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.getAttribute('data-layer-toggle')!;
      map.setLayoutProperty(id, 'visibility', el.checked ? 'visible' : 'none');
      visibility.set(id, el.checked);
      renderLegend();
    });
  });

  container.querySelector<HTMLButtonElement>('#back-button')!.addEventListener('click', onBack);

  // Copy Map Intent with the *current* view baked into render_hints, so the
  // copied text reproduces what's on screen right now, not just the
  // original submission (map-intent-vnext.md §5: render_hints exist for
  // "practical re-opening"). If this render had resolution problems
  // (missing/unrenderable layers, an ignored url_share request), those are
  // embedded too as a non-normative "cartographer_feedback" extension field
  // -- an optional feedback loop back to Staff: a capable Staff agent that
  // receives this Map Intent back can read what didn't resolve last time
  // and adjust, without Cartographer needing a separate machine-readable
  // API. Only added when there's actually something to report, so a clean
  // render stays a clean copy. Falls back to copying the unmodified text if
  // the YAML can't be round-tripped for any reason.
  const copyButton = container.querySelector<HTMLButtonElement>('#copy-intent')!;
  copyButton.addEventListener('click', async () => {
    let toCopy = rawIntent;
    try {
      const doc = (yamlLoad(rawIntent) as Record<string, unknown>) || {};
      const center = map.getCenter();
      doc.render_hints = {
        ...(doc.render_hints as Record<string, unknown> | undefined),
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch()
      };
      if (missing.length > 0 || unrenderable.length > 0) {
        doc.cartographer_feedback = {
          missing_layers: missing,
          unrenderable_layers: unrenderable
        };
      }
      toCopy = yamlDump(doc);
    } catch (e) {
      console.error('Could not update render_hints before copying; copying the original Map Intent instead.', e);
    }
    await navigator.clipboard.writeText(toCopy);
    const label = copyButton.textContent;
    copyButton.textContent = 'Copied!';
    setTimeout(() => {
      copyButton.textContent = label;
    }, 1500);
  });
}
