# faceless-cartographer

Cartographer implementation for the Staccato architecture (see [`unopengis/staccato-spec`](https://github.com/unopengis/staccato-spec)): an internet-facing service that receives a posted [Map Intent](https://github.com/unopengis/staccato-spec/blob/main/spec/map-intent-vnext.md) and deterministically renders a MapLibre GL JS map from it, without exposing map state in the URL ("faceless", per [ADR 0001](https://github.com/unopengis/staccato-spec/blob/main/spec/adr/0001-faceless-cartographer.md)).

Background and design rationale: [`JUMPSTART.md`](JUMPSTART.md). Reference Library implementation used for catalog resolution: [`hfu/layers-martin`](https://github.com/hfu/layers-martin).

## Status

Initial implementation. `GET /` and `POST /` work end-to-end against the live `layers-martin` catalog, including the worked acceptance-test Map Intent from `JUMPSTART.md` (background map + three hazard-zone overlays + one optional layer). Not yet deployed anywhere.

## Architecture

- `src/mapIntent.ts` — parses and validates a posted Map Intent against `map-intent-vnext.md`'s schema. Rejects invalid/incomplete intents with a clear error rather than guessing.
- `src/catalog.ts` — resolves each `required_layers`/`optional_layers` `source_id` against `catalog_context.active_catalogs` (currently supports `catalog_type: "martin"` and `"layers_txt"`; `"stac"` is out of scope for v1). Honors `resolution_policy.precedence`/`first_match`. Unresolvable `source_id`s are reported, never fabricated.
- `src/style.ts` — builds a MapLibre style (sources + layers) from resolved TileJSON, and picks an initial view (`render_hints` → `area.bbox` → combined bounds of required layers → a Japan-wide default).
- `src/render.ts` — server-rendered HTML for both the submission form and the rendered map page (MapLibre GL JS loaded from a CDN, no client-side build step).
- `src/server.ts` — the Express app itself: `GET /` (form) and `POST /` (render). No other routes. No persistence of posted Map Intent beyond the request.

The core pipeline (`mapIntent.ts` → `catalog.ts` → `style.ts`) has no LLM dependency and none is planned for it — see `JUMPSTART.md` for why. An LLM-generated explanation panel is a possible future addition, out of scope for this initial implementation.

## Development

```sh
npm install
npm run dev        # http://localhost:3000, restarts on change
npm run typecheck
npm test            # includes integration tests against the live layers-martin catalog
```

## Known limitations (v1)

- Vector tile (`.pbf`/`.mvt`) sources are added to the MapLibre style but no layer is rendered for them, since `layers-martin`'s TileJSON doesn't include `vector_layers` (can't be recovered from `layers.txt` alone). Not currently exercised by the reference catalog, which has zero vector layers as of 2026-07-02.
- No deployment target chosen yet.
- No optional LLM explanation panel yet.
