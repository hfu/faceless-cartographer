# faceless-cartographer

Cartographer implementation for the Staccato architecture (see [`unopengis/staccato-spec`](https://github.com/unopengis/staccato-spec)): an internet-facing service that receives a posted [Map Intent](https://github.com/unopengis/staccato-spec/blob/main/spec/map-intent-vnext.md) and deterministically renders a MapLibre GL JS map from it, without exposing map state in the URL ("faceless", per [ADR 0001](https://github.com/unopengis/staccato-spec/blob/main/spec/adr/0001-faceless-cartographer.md)).

- Project orientation, architecture positioning, current state: [`HANDOVER.md`](HANDOVER.md)
- Design decisions and their rationale: [`DECISIONS.md`](DECISIONS.md)
- Reference Library implementation used for catalog resolution: [`hfu/layers-martin`](https://github.com/hfu/layers-martin)

## Status

Initial implementation. `GET /` and `POST /` work end-to-end against the live `layers-martin` catalog, including a worked acceptance-test Map Intent (background map + three sediment-hazard overlays + one optional layer) — verified with an actual headless-browser screenshot, not just HTTP status codes. Not yet deployed anywhere.

## Try it

```sh
cp .env.example .env
just serve   # http://localhost:3000 -- installs dependencies on first run
```

(No [`just`](https://github.com/casey/just)? `npm install && npm run dev` works the same.)

`GET /` pre-fills the submission form with a real, catalog-verified example (the same one used in `src/catalog.test.ts`): submit it as-is to see a standard GSI base map with three sediment-disaster warning-zone overlays rendered on top, plus one optional layer (hidden by default, toggle with the checkbox).

The rendered map is full-bleed, with the title/notices/controls in a floating panel top-left (see [`DECISIONS.md`](DECISIONS.md) D11 for why, and what it deliberately does *not* borrow from `unopengis/7#869`) and a collapsible legend bottom-right showing only currently-visible layers' `legend_image_url` (D14). "Copy Map Intent" captures the map's current center/zoom/bearing/pitch into `render_hints` before copying, and embeds any resolution problems (missing/unrenderable layers) as a `cartographer_feedback` extension field (D15) — an optional feedback loop back to whatever Staff agent generated the intent. `GET /` also shows the current best Staff prompt (fetched live from `hfu/layers-martin`'s `STAFF_PROMPT.md`, D13), so setting up a matching Staff agent doesn't require leaving the page. Both pages are mobile-first; verified with real headless-browser checks at a 375px viewport, not just desktop.

## Architecture

```text
POST /  →  src/mapIntent.ts  →  src/catalog.ts  →  src/style.ts  →  src/render.ts  →  HTML response
           (parse + validate)   (resolve source_id  (build MapLibre    (server-rendered
                                 against catalogs)    style)             page + MapLibre GL JS)
```

- `src/mapIntent.ts` — parses and validates a posted Map Intent against `map-intent-vnext.md`'s schema. Rejects invalid/incomplete intents with a clear error rather than guessing.
- `src/catalog.ts` — resolves each `required_layers`/`optional_layers` `source_id` against `catalog_context.active_catalogs` (currently supports `catalog_type: "martin"` and `"layers_txt"`; `"stac"` is out of scope for v1). Honors `resolution_policy.precedence`/`first_match`. Unresolvable `source_id`s are reported as `missing`, never fabricated.
- `src/style.ts` — builds a MapLibre style (sources + layers) from resolved TileJSON, and picks an initial view (`render_hints` → `area.bbox` → combined bounds of required layers → a Japan-wide default).
- `src/render.ts` — server-rendered HTML for both the submission form and the rendered map page (MapLibre GL JS loaded from a CDN, no client-side build step).
- `src/staffPrompt.ts` — fetches the current Staff prompt from `hfu/layers-martin` live (cached 10 minutes, falls back to a bundled snapshot on failure) for display on `GET /`.
- `src/server.ts` — the Express app itself: `GET /` (form) and `POST /` (render). No other routes. No persistence of posted Map Intent beyond the request. `Referrer-Policy: no-referrer` is set on every response.

The core pipeline (`mapIntent.ts` → `catalog.ts` → `style.ts`) has no LLM dependency and none is planned for it — see [`HANDOVER.md`](HANDOVER.md) for why, and [`DECISIONS.md`](DECISIONS.md) D8 for how an eventual LLM-generated explanation feature would be kept separate from it.

## Development

```sh
just dev     # restarts on change, loads .env if present
just check   # typecheck + test (what CI runs)
```

or without `just`: `npm install`, then `npm run dev` / `npm run typecheck` / `npm test`.

## Deployment

Self-hosted on a Raspberry Pi 4B behind `cloudflared`, at `cartographer.optgeo.org` (see [`DECISIONS.md`](DECISIONS.md) D9). The whole point of the `Justfile`/`.env` setup above is that deployment is the same three steps as local dev (clone, copy `.env`, `just serve`) with a systemd unit wrapping `just serve` for process management (D17). Full setup instructions and the systemd unit template are in [`deploy/`](deploy/). Not yet actually deployed as of this writing.

## Known limitations (v1)

- Vector tile (`.pbf`/`.mvt`) sources are added to the MapLibre style but no layer is rendered for them, since `layers-martin`'s TileJSON doesn't include `vector_layers` (can't be recovered from `layers.txt` alone). Not currently exercised by the reference catalog, which has zero vector layers as of 2026-07-02. See [`DECISIONS.md`](DECISIONS.md) D5.
- No optional LLM explanation panel yet (see [`DECISIONS.md`](DECISIONS.md) D8).
- Not yet compliant with Japan's Digital Agency design system ([design.digital.go.jp](https://design.digital.go.jp/)) — backlogged in [`DECISIONS.md`](DECISIONS.md).
