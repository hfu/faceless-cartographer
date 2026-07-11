import maplibregl from 'maplibre-gl';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { LayerControl } from 'maplibre-gl-layer-control';
import 'maplibre-gl-layer-control/style.css';
import type { MapIntent, ResolvedLayer } from './types.ts';
import type { InitialView, MapLibreStyle } from './style.ts';
import { encodeIntentFragment } from './fragment.ts';

const EXAMPLE_MAP_INTENT = `spec_version: "map-intent/v2"
goal: "対象地域における土砂災害警戒区域（土石流・地すべり・急傾斜地の崩壊）の分布を、背景地形とともに示す。"
area:
  name: null
  bbox: null
catalog_context:
  active_catalogs:
    - id: "layers-martin"
      type: "layers_txt"
      uri: "https://hfu.github.io/layers-martin/catalog"
      version: "2026-07-09T00:00:00Z"
required_layers:
  - source_id: "05_dosekiryukeikaikuiki"
    label: "土石流の警戒区域・特別警戒区域"
  - source_id: "05_jisuberikeikaikuiki"
    label: "地すべりの警戒区域・特別警戒区域"
  - source_id: "05_kyukeishakeikaikuiki"
    label: "急傾斜地の崩壊の警戒区域・特別警戒区域"
optional_layers:
  - source_id: "landslide"
    label: "地すべり地形分布図（防災科学技術研究所、現況の警戒区域とは別の地形学的観点の補助情報）"
relationships_to_highlight:
  - "警戒区域分布と背景地形(hillshade)の視覚的関係"
sharing_policy:
  url_share: true
  intent_share: true
provenance:
  generated_by: "faceless-cartographer"
  generated_at: "2026-07-09T00:00:00Z"
  intent_id: "example-disaster-zones"
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
        <p><button type="submit" class="dads-button" data-type="solid-fill" data-size="md">Render</button></p>
      </form>
    </div>
    <div class="card">
      <details class="dads-disclosure">
        <summary class="dads-disclosure__summary">
          <svg class="dads-disclosure__icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="11" fill="currentcolor"/>
            <circle class="dads-disclosure__icon-circle" cx="12" cy="12" r="8" fill="currentcolor"/>
            <path class="dads-disclosure__icon-triangle" d="M17 10H7L12 15L17 10Z" fill="Canvas"/>
          </svg>
          現在の Staff プロンプト
        </summary>
        <div class="dads-disclosure__content">
          <p style="font-size:0.82rem;color:#555;">このCartographerと組み合わせて使う Staff エージェントのシステムプロンプトに、そのまま追加できる内容です。取得元: <a href="https://github.com/hfu/layers-martin/blob/main/STAFF_PROMPT.md" target="_blank" rel="noreferrer">hfu/layers-martin STAFF_PROMPT.md</a></p>
          <p><button id="copy-staff-prompt" type="button" class="dads-button" data-type="outline" data-size="md">Copy Staff Prompt</button></p>
          <pre>${staffPrompt}</pre>
        </div>
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
// pattern discussed in UNopenGIS/7#869. That issue also uses `hash: "map"`
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
  const { rawIntent, intent, view, style, resolved, missing, unrenderable, onBack } = opts;

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
  const urlShareNotice = '';

  // All layers (required and optional) displayed uniformly with checkboxes
  // Required layers default to checked; optional layers default to unchecked
  const allLayerCheckboxes = resolved
    .map(
      (r) =>
        `<div class="layer-item">
          <label class="dads-checkbox" data-size="sm">
            <span class="dads-checkbox__checkbox">
              <input class="dads-checkbox__input" type="checkbox" data-layer-toggle="${escapeHtml(r.source_id)}"${r.required ? ' checked' : ''}>
            </span>
            <span class="dads-checkbox__label">${escapeHtml(r.label ?? r.source_id)}</span>
          </label>
          <div class="legend-item-inline" data-legend-for="${escapeHtml(r.source_id)}" style="display:none;margin-top:.3rem;">
            <img src="" alt="${escapeHtml(r.label ?? r.source_id)}" style="max-width:100%;display:block;">
          </div>
        </div>`
    )
    .join('\n');

  container.innerHTML = `
<div class="map-view">
  <div id="map"></div>
  <div class="panel" data-collapsed="false">
    <button id="panel-toggle" class="panel__toggle" type="button" aria-expanded="true" aria-label="パネルを折りたたむ/展開する">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style="display:inline-block;">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <div class="panel__content">
      <h1>faceless-cartographer</h1>
      <p>${escapeHtml(intent.goal)}</p>
      ${missingNotice}
      ${unrenderableNotice}
      ${urlShareNotice}
      ${resolved.length > 0 ? `
      <div class="layer-search-wrapper" style="margin: .5rem 0;">
        <input type="text" id="layer-search" placeholder="🔍 Search layers..." class="dads-text-input" style="width: 100%; font-size: 0.88rem; padding: 0.4rem 0.6rem; border: 1px solid rgba(0, 0, 0, 0.2); border-radius: var(--border-radius-4);">
      </div>
      <div class="layers">${allLayerCheckboxes}</div>
      ` : ''}
      <div class="url-reflection-control" style="margin: .5rem 0; font-size: 0.82rem;">
        <label class="dads-checkbox" data-size="sm">
          <span class="dads-checkbox__checkbox">
            <input class="dads-checkbox__input" type="checkbox" id="url-share-enable" aria-label="Reflect Map Intent in URL fragment">
          </span>
          <span class="dads-checkbox__label">URLにMap Intentを反映</span>
        </label>
      </div>
      <div class="actions">
        <button id="copy-intent" type="button" class="dads-button" data-type="solid-fill" data-size="md">Copy Map Intent</button>
        <button id="back-button" type="button" class="dads-button" data-type="outline" data-size="md">戻る</button>
      </div>
    </div>
  </div>
</div>`;

  const map = new maplibregl.Map({
    container: container.querySelector('#map') as HTMLElement,
    style: style as maplibregl.StyleSpecification,
    center: view.center,
    zoom: view.zoom,
    bearing: view.bearing,
    pitch: view.pitch,
    attributionControl: false,
    localIdeographFontFamily: 'sans-serif'
  });
  if (view.bounds) {
    map.fitBounds(view.bounds, { padding: 40, duration: 0 });
  }
  map.addControl(new maplibregl.NavigationControl());
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.addControl(new maplibregl.TerrainControl({ source: 'mapterhorn', exaggeration: 1 }), 'top-right');

  // Layer Control: show only thematic layers (resolved), exclude bvmap background layers
  try {
    // Collect actual MapLibre layer IDs that correspond to resolved (required + optional) layers
    const thematicSourceIds = new Set(resolved.map((r) => r.source_id));
    const thematicLayerIds = style.layers
      .filter((layer) => {
        const source = layer.source as string | undefined;
        return source && thematicSourceIds.has(source);
      })
      .map((layer) => layer.id as string);

    const layerControl = new LayerControl({
      collapsed: true,
      layers: thematicLayerIds
    });
    map.addControl(layerControl, 'top-right');
  } catch (e) {
    // Graceful degradation: if LayerControl fails to initialize, continue without it
    console.warn('LayerControl initialization failed; proceeding without layer panel', e);
  }

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

  function updateLegendDisplay() {
    resolved.forEach((r) => {
      const legendEl = container.querySelector<HTMLElement>(`[data-legend-for="${escapeHtml(r.source_id)}"]`);
      if (!legendEl) return;

      const isVisible = visibility.get(r.source_id) ?? false;
      const hasLegend = legendBySourceId.has(r.source_id);

      if (isVisible && hasLegend) {
        const entry = legendBySourceId.get(r.source_id)!;
        legendEl.style.display = 'block';
        const img = legendEl.querySelector('img') as HTMLImageElement;
        img.src = entry.url;
        img.alt = entry.label;
        img.loading = 'lazy';
      } else {
        legendEl.style.display = 'none';
      }
    });
  }
  updateLegendDisplay();

  // A raster source has exactly one MapLibre layer named after its
  // source_id. A vector source with a known schema (D23) expands to several
  // fill/line/circle sub-layers (one set per source-layer, see
  // buildVectorSubLayers in style.ts) that all share `source: sourceId` but
  // have their own ids -- toggle every layer belonging to a source_id
  // together, not just one assumed to be named after it.
  const layerIdsBySourceId = new Map<string, string[]>();
  for (const styleLayer of style.layers) {
    const source = (styleLayer as { source?: string }).source;
    const id = (styleLayer as { id: string }).id;
    if (!source) continue;
    const list = layerIdsBySourceId.get(source) ?? [];
    list.push(id);
    layerIdsBySourceId.set(source, list);
  }

  container.querySelectorAll<HTMLInputElement>('[data-layer-toggle]').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.getAttribute('data-layer-toggle')!;
      const layerIds = layerIdsBySourceId.get(id) ?? [];
      for (const layerId of layerIds) {
        map.setLayoutProperty(layerId, 'visibility', el.checked ? 'visible' : 'none');
      }
      visibility.set(id, el.checked);
      updateLegendDisplay();
      updateFragment();
    });
  });

  // Layer search/filter: real-time filtering of layer list
  const searchInput = container.querySelector<HTMLInputElement>('#layer-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const searchText = searchInput.value.toLowerCase().trim();
      const layerItems = container.querySelectorAll<HTMLElement>('.layer-item');

      layerItems.forEach((item) => {
        // Get the layer label from the checkbox label text
        const labelElement = item.querySelector('.dads-checkbox__label');
        const layerLabel = labelElement?.textContent?.toLowerCase() ?? '';

        // Show if search is empty or label matches
        const matches = !searchText || layerLabel.includes(searchText);
        item.style.display = matches ? '' : 'none';
      });
    });
  }

  map.on('moveend', () => {
    updateFragment();
  });

  const panelElement = container.querySelector<HTMLElement>('.panel')!;
  const panelToggle = container.querySelector<HTMLButtonElement>('#panel-toggle')!;
  panelToggle.addEventListener('click', () => {
    const isCollapsed = panelElement.dataset.collapsed === 'true';
    panelElement.dataset.collapsed = isCollapsed ? 'false' : 'true';
    panelToggle.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
  });

  container.querySelector<HTMLButtonElement>('#back-button')!.addEventListener('click', onBack);

  // Builds the Map Intent YAML with the *current* view baked into
  // render_hints, so it reproduces what's on screen right now, not just the
  // original submission (map-intent-vnext.md §5: render_hints exist for
  // "practical re-opening"). If this render had resolution problems
  // (missing/unrenderable layers, an ignored url_share request), those are
  // embedded too as a non-normative "cartographer_feedback" extension field
  // -- an optional feedback loop back to Staff: a capable Staff agent that
  // receives this Map Intent back can read what didn't resolve last time
  // and adjust, without Cartographer needing a separate machine-readable
  // API. Only added when there's actually something to report, so a clean
  // render stays a clean copy. Falls back to the unmodified text if the YAML
  // can't be round-tripped for any reason. Shared by both "Copy Map Intent"
  // and "Copy Shareable Link" so they never drift apart (D32).
  function buildCurrentIntentYaml(): string {
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
      return yamlDump(doc);
    } catch (e) {
      console.error('Could not update render_hints; using the original Map Intent instead.', e);
      return rawIntent;
    }
  }

  let urlShareEnabled = intent.sharing_policy?.url_share ?? false;

  function updateFragment(): void {
    if (!urlShareEnabled) return;
    const yaml = buildCurrentIntentYaml();
    const encoded = encodeIntentFragment(yaml);
    history.replaceState(null, '', `${location.pathname}${location.search}#intent=${encoded}`);
  }

  const copyButton = container.querySelector<HTMLButtonElement>('#copy-intent')!;
  copyButton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(buildCurrentIntentYaml());
    const label = copyButton.textContent;
    copyButton.textContent = 'Copied!';
    setTimeout(() => {
      copyButton.textContent = label;
    }, 1500);
  });

  const urlShareToggle = container.querySelector<HTMLInputElement>('#url-share-enable')!;
  urlShareToggle.checked = urlShareEnabled;
  urlShareToggle.addEventListener('change', () => {
    urlShareEnabled = urlShareToggle.checked;
    if (urlShareEnabled) {
      updateFragment();
    }
  });
}
