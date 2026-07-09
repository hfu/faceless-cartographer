# faceless-cartographer

Cartographer implementation for the Staccato architecture (see [`UNopenGIS/staccato-spec`](https://github.com/UNopenGIS/staccato-spec)): a static single-page app that takes a pasted [Map Intent](https://github.com/UNopenGIS/staccato-spec/blob/main/spec/map-intent-vnext.md) and deterministically renders a MapLibre GL JS map from it. Operates in two modes: by default, keeps the URL clean ("faceless" mode, per [ADR 0001](https://github.com/UNopenGIS/staccato-spec/blob/main/spec/adr/0001-faceless-cartographer.md)); optionally, users can enable live URL-fragment reflection ("idempotent" mode, see [DECISIONS.md D36](DECISIONS.md#d36-cartographer-の2つのモードfaceless-と-idempotent)) to share map state directly from the address bar.

- Project orientation, architecture positioning, current state: [`HANDOVER.md`](HANDOVER.md)
- Design decisions and their rationale: [`DECISIONS.md`](DECISIONS.md)
- Reference Library implementation used for catalog resolution: [`hfu/layers-martin`](https://github.com/hfu/layers-martin)

## Status

Static SPA, builds to `docs/` for GitHub Pages. Background map is permanently set to GSI-optimized vector tiles (`bvmap`, grayscale) + Mapterhorn terrain (hillshade + 3D) — see [`DECISIONS.md`](DECISIONS.md) D24. Works end-to-end against the live `layers-martin` catalog, including a worked acceptance-test Map Intent (three sediment-hazard overlays + one optional layer) rendered on top of the bvmap background — verified with an actual headless-browser screenshot, not just HTTP status codes. Also verified against a second, independently-operated live catalog (`stars.optgeo.org/catalog`, a real Martin server) in the same Map Intent, including genuine vector-tile rendering of its `bvmap` layer (D23) — no catalog-aggregator repository needed, since Map Intent already supports multiple `active_catalogs`. UI is styled using Japan's Digital Agency Design System (DADS) design tokens and accessibility patterns, with Button/Checkbox/Disclosure components following DADS conventions (D25).

## Try it

```sh
just dev   # or: npm install && npm run dev
```

The form pre-fills with a real, catalog-verified example (the same one used in `src/catalog.test.ts`): submit it as-is to see a standard GSI base map with three sediment-disaster warning-zone overlays rendered on top, plus one optional layer (hidden by default, toggle with the checkbox). Submitting is a client-side state transition — no page reload, no HTTP request beyond fetching tiles/catalog data, the URL never changes.

The rendered map is full-bleed, with the title/notices/controls in a floating panel top-left (see [`DECISIONS.md`](DECISIONS.md) D11 for why, and what it deliberately does *not* borrow from `UNopenGIS/7#869`) and a collapsible legend bottom-right showing only currently-visible layers' `legend_image_url` (D14). A terrain-control button (top-right) toggles 3D terrain visualization via Mapterhorn hillshade exaggeration. "Copy Map Intent" captures the map's current center/zoom/bearing/pitch into `render_hints` before copying, and embeds any resolution problems (missing/unrenderable layers) as a `cartographer_feedback` extension field (D15) — an optional feedback loop back to whatever Staff agent generated the intent. The form also shows the current best Staff prompt (fetched at build time from `hfu/layers-martin`'s `STAFF_PROMPT.md`, D13/D19) with its own "Copy Staff Prompt" button (D22), so setting up a matching Staff agent doesn't require leaving the page. Both views are mobile-first; verified with real headless-browser checks at a 375px viewport, not just desktop. A page load with a `#intent=...` URL fragment auto-renders that Map Intent immediately — the fragment is read once and cleared via `history.replaceState` before rendering, so it never persists as bookmarkable state (unlike a query string, it's also never sent to the server) (D32). A "URLにMap Intentを反映" checkbox (in the panel) switches from faceless mode to idempotent mode: when enabled, the URL fragment auto-updates as the user pans/zooms/toggles layers, allowing users to copy a deeplinkable URL directly from the address bar and share the current map view — while the default (unchecked) keeps the URL clean by never reflecting state, honoring each Map Intent's intent (D34, D36). Layer search/filtering is available in both modes to quickly find specific layers among many.

## Architecture

```text
index.html + src/main.ts (SPA shell, no routing)
  │
  ├─ renderFormView  ──user submits──▶  src/mapIntent.ts (parse + validate)
  │                                          │
  │                                          ▼
  │                                     src/catalog.ts (resolve source_id
  │                                          against catalog_context)
  │                                          │
  │                                          ▼
  │                                     src/style.ts (build MapLibre style)
  │                                          │
  └─ renderMapView  ◀────────────────────────┘
```

- `src/mapIntent.ts` — parses and validates a submitted Map Intent against `map-intent-vnext.md`'s schema. Rejects invalid/incomplete intents with a clear error rather than guessing.
- `src/catalog.ts` — resolves each `required_layers`/`optional_layers` `source_id` against `catalog_context.active_catalogs` (currently supports `catalog_type: "martin"` and `"layers_txt"`; `"stac"` is out of scope for v1). Honors `resolution_policy.precedence`/`first_match`. Unresolvable `source_id`s are reported as `missing`, never fabricated.
- `src/style.ts` — builds a MapLibre style (sources + layers) from a fixed background (`src/base-style.json`, imported from `hfu/kitavolca`: bvmap grayscale vector tiles + Mapterhorn terrain) and thematic layers resolved from the Map Intent's TileJSON. Constructs the layer stack as `[baseStyle.before (background/water/terrain), ...thematic layers..., contours (topographic lines), baseStyle.after (roads/labels)]` so that Staff-supplied overlays sit between foundational map elements and decorative labels, with contours visible above thematic fills (D26). Initial view: `render_hints` → `area.bbox` → combined bounds of required layers → Japan-wide default (D6). Vector tiles with `vector_layers` schema are rendered generically per geometry type (D23).
- `src/render.ts` — builds the form view and the map view by writing into the `#app` DOM node and wiring event listeners. No page navigation, ever (D18). Includes `TerrainControl` for 3D hillshade toggling (D24) and `localIdeographFontFamily: 'sans-serif'` to use browser system fonts for CJK text instead of loading glyph PBFs.
- `src/main.ts` — the whole app: shows the form, and on submit runs the pipeline above and swaps in the map view.
- `src/base-style.json` — vendored snapshot of bvmap + Mapterhorn background from `hfu/kitavolca` (commit `0c23a4a`), with layers split into `before` (background + water) and `after` (roads + labels) to allow thematic layer insertion in the middle (D24).
- `scripts/fetch-staff-prompt.mjs` — a build-time (`prebuild`) script that refreshes `src/staff-prompt.txt` from `hfu/layers-martin`'s live `STAFF_PROMPT.md`, bundled via Vite's `?raw` import (D19). No runtime fetch.

The core pipeline (`mapIntent.ts` → `catalog.ts` → `style.ts`) has no LLM dependency, and this generation of Cartographer doesn't have one anywhere else either (D20) — see [`HANDOVER.md`](HANDOVER.md) for why. If an LLM-generated explanation feature is ever added, it's meant to be a separate callable API, not embedded in this app.

## Development

```sh
just dev      # Vite dev server with hot reload
just check    # typecheck + test (what CI runs)
just build    # refresh Staff prompt snapshot + build to docs/
just preview  # build, then serve docs/ locally
```

or without `just`: `npm install`, then `npm run dev` / `npm run typecheck` / `npm test` / `npm run build`.

## Deployment

Static site, built to `docs/` and served by GitHub Pages (`base: './'` in `vite.config.ts`, matching `hfu/layers-martin` and `hfu/attachbar`'s `examples/mgrs-pmtiles`). `.github/workflows/build-docs.yml` rebuilds on every push to `main` and daily via cron (to pick up upstream `STAFF_PROMPT.md` changes even without a push here), committing `docs/` when it changes — see [`DECISIONS.md`](DECISIONS.md) D21. `docs/` is a single `index.html` file containing all JS and CSS bundled inline via vite-plugin-singlefile (D27), eliminating the need for separate asset files. No server to operate.

## Known limitations (v1)

- Background map (`bvmap` + Mapterhorn) is fixed and vendored from `hfu/kitavolca`. Future improvements to `kitavolca`'s style do not automatically propagate; manual re-vendoring of `src/base-style.json` is required (D24).
- Vector tile sources are only rendered when their TileJSON carries `vector_layers` (D23). `layers-martin`'s TileJSON doesn't include it (can't be recovered from `layers.txt` alone, D7), so its vector tiles — none exist in the reference catalog as of 2026-07-04 anyway — would still show up as `unrenderable`. A real Martin server like `stars.optgeo.org` does publish `vector_layers` and renders correctly; see D23. Styling is generic per geometry type (fill/line/circle), not tailored per layer semantics (e.g. `BldA` = buildings, `RdCL` = road centerlines) — backlogged.
- No LLM explanation feature, by design this generation (see [`DECISIONS.md`](DECISIONS.md) D20).
