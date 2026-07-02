This repository is `hfu/faceless-cartographer`. Build its initial implementation of "Cartographer" — the internet-facing, faceless map-rendering service in the Staccato architecture (a four-party model: User, Staff, Cartographer, Library). Cartographer's one job: receive a posted Map Intent (a structured YAML payload) and deterministically render a MapLibre GL JS map from it, with an explanation. It does not interpret user intent (that's Staff's job) and it does not decide what data means (that's already decided by the time Map Intent reaches it).

## Architectural context (read this first, it shapes every decision below)

Staccato separates responsibilities across a trust boundary:

- **User**: submits a natural-language question, reviews the rendered map, and is accountable for the decision to transfer a Map Intent across the trust boundary (enterprise → internet).
- **Staff**: runs *inside* an enterprise's secure network. Interprets the user's natural-language query using generative AI, and produces a Map Intent — a declarative, technically concrete description of what to render (not a natural-language brief). Staff MUST receive its `catalog_context.active_catalogs` configuration at startup, MUST only resolve layers from those configured catalogs, and MUST NOT silently fall back to unspecified catalogs (`unopengis/staccato-spec` ADR 0002). Cartographer can therefore assume an incoming Map Intent's `catalog_context` is deliberate and complete, but MUST NOT assume every referenced `source_id` will actually resolve — Staff can still reference layers that turn out to be unreachable at render time (network issues, catalog changes since Staff ran), so Cartographer must handle resolution failure gracefully regardless of Staff's good behavior.
- **Cartographer** (this repo, `hfu/faceless-cartographer`): runs on the internet side. Receives a posted Map Intent and renders it. Deliberately "faceless": a single public endpoint (`/`) with no map state in the URL, ever. This pattern is a normative baseline decision, not a suggestion — see `unopengis/staccato-spec` ADR 0001 ("Adopt Faceless Cartographer as Baseline"), which explicitly says any relaxation requires a superseding ADR. Don't design around it as if it were optional.
- **Library**: publishes catalog metadata (TileJSON etc.) that Staff resolves against and Cartographer fetches tiles from. A reference implementation, `hfu/layers-martin` (repo: https://github.com/hfu/layers-martin, live catalog: https://hfu.github.io/layers-martin/catalog), already exists and is the catalog you should build and test against — it is not a mock, it's the real first Library implementation in this ecosystem, actively maintained. It exposes a Martin-compatible static catalog: `GET /catalog` lists `{source_id: {name, content_type}}`, and `GET /{source_id}` returns a TileJSON 3.0.0 document for that source. Read `hfu/layers-martin`'s `HANDOVER.md` (project orientation + current state), `DECISIONS.md` (every curation decision as ADRs, D1–D16 as of 2026-07-02), and `STAFF_PROMPT.md` (how Staff is expected to use this specific catalog, including known gaps) before you assume anything about what the catalog will hand you.

Full normative specs live in `unopengis/staccato-spec`: `spec/architecture-principles.md`, `spec/map-intent-vnext.md`, `spec/catalog-integration.md`, `spec/usecase.md`, `spec/background.md`, and `spec/adr/0001-faceless-cartographer.md` / `spec/adr/0002-staff-startup-catalog-contract.md`. Treat that repo as authoritative for anything this prompt doesn't cover explicitly. If you find a gap or inconsistency between this prompt and that repo, the spec repo wins — note the discrepancy rather than silently improvising past it.

## Why Cartographer must be light, not smart

Two separate reasons converge on the same architectural constraint, and you should let this shape your technology choices, not just your prose:

1. **Information governance.** Cartographer is a public, internet-facing service. A Map Intent that leaked enterprise business logic (why a decision was made, internal reasoning, sensitive context) would be a real exposure. Map Intent is deliberately concrete/mechanical (exact `source_id` references, exact `area.bbox` coordinates, exact `render_hints`) specifically so nothing sensitive needs to ride along — Staff already did the "why," Cartographer only needs the "what."
2. **Cost and scalability asymmetry.** Staff runs inside an enterprise and can reasonably be paired with an expensive, high-capability LLM. Cartographer is a public service that needs to scale cheaply. The architecture's whole premise is that Cartographer should be renderable **without any LLM at all** for the core map-building path — it is close enough to a mechanical transform (Map Intent → MapLibre style + sources) that a deterministic renderer should suffice. An LLM MAY be used for the optional natural-language explanation text that accompanies the map, but the map itself must render correctly even if that LLM call fails or is disabled.

Concretely: **do not build Cartographer's core rendering path as an LLM agent that "figures out" how to draw the map.** Build it as a deterministic function: parse Map Intent → resolve each `source_id` against `catalog_context.active_catalogs` → fetch TileJSON → build MapLibre sources/layers → render. An LLM, if used at all in v1, should be confined to generating the plain-language explanation panel, and should be easy to strip out entirely without breaking rendering.

## The faceless pattern (normative — `unopengis/staccato-spec` ADR 0001)

- The public interactive endpoint MUST be `/`. No other semantic paths for map state.
- `GET /` MUST return an HTML page with a way to paste/submit a Map Intent (a form is enough for v1 — a textarea for YAML plus a submit button).
- `POST /` MUST accept a Map Intent payload and render the map.
- URL paths, query parameters, and the hash MUST NOT carry map state, ever. After rendering, the URL should still just be `/` — no `?layers=...`, no `#/12/35.6/139.7`.
- The primary share artifact is the Map Intent text itself, not a URL. Provide a visible "Copy Map Intent" affordance in the UI (see `spec/usecase.md` Case 3) so a User can copy it and hand it to someone else's Cartographer instance to reproduce the same map. URL sharing is explicitly not a recommended workflow — don't build a "shareable link" feature.
- Data minimization: implementations SHOULD avoid persistent server-side storage of posted Map Intent. Logs MUST NOT include raw Map Intent payloads (scrub them from access/error logs). Client-side automatic persistence (e.g. localStorage autosave of the submitted intent) SHOULD be disabled by default. Consider `Referrer-Policy: no-referrer` on responses.

## Map Intent schema (from `spec/map-intent-vnext.md` — implement against this exactly, field names included)

```yaml
spec_version: "map-intent/v2"

goal: "Understand evacuation zones and land use around target volcano"

area:
  name: "target area name"
  bbox: [lon_w, lat_s, lon_e, lat_n]  # optional

catalog_context:
  active_catalogs:
    - id: "martin-catalog"
      type: "martin"
      uri: "https://library.example/catalog"
      version: "2026-06-24"
    - id: "gsi-layers"
      type: "layers_txt"
      uri: "https://example.org/layers.txt"
      version: "2026-06-20"
    - id: "stac-main"
      type: "stac"
      uri: "https://example.org/stac"
      version: "1.0.0"
  resolution_policy:
    precedence: ["martin", "layers_txt", "stac"]
    on_conflict: "first_match"

required_layers:
  - source_id: "hazard.evacuation_zone"
    label: "Evacuation Zone"

optional_layers:
  - source_id: "forest.admin"
    label: "Forest Boundary"

relationships_to_highlight:
  - "overlap between evacuation zones and populated land use"

render_hints:
  center: [lng, lat]   # optional
  zoom: 10.5           # optional
  bearing: 0           # optional
  pitch: 0             # optional

sharing_policy:
  url_share: false
  intent_share: true

provenance:
  generated_by: "staff-agent-name"
  generated_at: "2026-06-24T12:34:56Z"
  intent_id: "uuid-or-ulid"
```

Validation rules you must actually enforce (reject/error clearly, don't silently guess):

1. `spec_version`, `goal`, `catalog_context`, `required_layers`, and `provenance` are REQUIRED. Reject a Map Intent missing any of these with a clear error; don't try to render a partial intent.
2. `required_layers` MUST contain at least one entry.
3. Each entry in `catalog_context.active_catalogs` MUST have `id`, `type`, and `uri`.
4. `resolution_policy.precedence`, if present, MUST only reference `catalog_type` values that exist in `active_catalogs`.
5. Unknown top-level keys SHOULD be ignored, not treated as errors (forward compatibility) — but don't invent your own top-level keys either. If you need to represent something not in the schema (e.g. a background/base layer), fold it into `required_layers` with a descriptive `label`, since a receiving Cartographer (yours or someone else's) is only obligated to honor the documented fields. `hfu/layers-martin`'s `STAFF_PROMPT.md` documents this exact lesson: an earlier draft put base maps in a made-up `base:` field and it was silently ignored by spec-compliant consumers.

## Catalog resolution (from `spec/catalog-integration.md`)

For each `catalog_type: "layers_txt"` or `catalog_type: "martin"` catalog in `catalog_context.active_catalogs`:

1. The `uri` points at a Martin-style catalog root (e.g. `https://hfu.github.io/layers-martin/catalog`), which returns `{"tiles": {source_id: {name, content_type}}, "sprites": {}, "fonts": {}, "styles": {}}`.
2. For each `required_layers[*].source_id` / `optional_layers[*].source_id`, fetch `{uri-without-"/catalog"}/{source_id}` to get a TileJSON 3.0.0 document (`tilejson`, `name`, `tiles: [url]`, `scheme`, `minzoom`/`maxzoom`, optionally `bounds`, `attribution`, `description`/`html`, plus GSI-specific passthrough keys like `legendUrl`/`iconUrl`/`path` — see a real example at https://hfu.github.io/layers-martin/05_dosekiryukeikaikuiki).
3. TileJSON 3.0 (collection model) is the canonical consumption model per `catalog-integration.md` §10 — treat it as the thing you actually render from, not `layers_txt`'s raw shape.
4. Build a MapLibre raster source (`content_type` starts with `image/`) or vector source (`application/x-protobuf`) from each resolved TileJSON's `tiles` array, and add layers in list order: required layers first (so a base map placed first in `required_layers` sits underneath), then optional layers on top.
5. **Known gaps in `layers-martin`'s current catalog, read graciously, don't treat as bugs to route around cleverly:** `bounds`/`center` are absent on roughly half of entries (don't assume you can auto-fit viewport from catalog metadata alone — fall back to `render_hints` or a sensible default view), and `attribution` is present on a bit over half of entries as of `layers-martin` DECISIONS.md D16 (render it when present; when absent, just omit an attribution string for that layer rather than fabricating one).
6. **If a `source_id` cannot be resolved** (catalog fetch fails, or the ID isn't present), do not silently drop it and do not fabricate a placeholder. Per `spec/usecase.md` Case 2 and the error-response fields discussed in `spec/background.md` §10, surface the failure explicitly: at minimum a `missing_layers` list of the unresolved `source_id`s alongside whatever *did* render. A fuller shape worth adopting (still a design candidate in the spec, not yet finalized normatively, so treat it as a reasonable default you may need to adjust as the spec matures):
   ```json
   {
     "error_code": "layer_resolution_partial",
     "message": "...",
     "missing_layers": ["source_id_a"],
     "provenance_snapshot": { "...": "subset of catalog_context and what was attempted" },
     "suggested_action": "..."
   }
   ```
   Don't hard-fail the whole render if some layers resolved and others didn't — render what you can and disclose what you couldn't, visibly, in the rendered page (not just a buried log line).
7. If multiple catalogs could resolve the same conceptual layer, honor `resolution_policy.precedence` (first `catalog_type` in the precedence list wins, per `on_conflict: "first_match"`). For v1 with a single active catalog this mostly won't matter, but implement it correctly rather than hard-coding a single-catalog assumption — Map Intent producers won't all be single-catalog, and `spec/catalog-integration.md` treats `stac` as a real third `catalog_type` even though you're not implementing STAC resolution itself in v1 (see Non-goals).

## A concrete, already-validated test case (use this as your first acceptance test)

This exact Map Intent was constructed against `hfu/layers-martin`'s real catalog and its `source_id`s confirmed to exist and resolve as of 2026-07-02 (it's adapted from a worked example in that repo's `STAFF_PROMPT.md`):

```yaml
spec_version: "map-intent/v2"
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
```

`std` is a raster base map (`image/png`, standard GSI base tiles). The three `05_*` layers are raster hazard-zone overlays with transparency baked into the source imagery (they should composite visually on top of `std` without you needing to set opacity — check this by actually looking at the rendered result, don't assume). `landslide` is optional and can be toggled off by default. Getting this one example to render correctly — base map underneath, three hazard overlays visible on top, at a reasonable default view (Japan-wide is fine since `area.bbox` is null here) — is a good definition of "v1 works." A second good test: deliberately misspell one `source_id` and confirm you get a visible `missing_layers` notice plus a map that still renders the other three layers, rather than a crash or a silently incomplete map.

## Also worth testing: layer-selection failure modes Staff is known to hit

`hfu/layers-martin`'s `STAFF_PROMPT.md` documents real failure modes observed when testing Staff against this catalog (fabricated `source_id`s, confusing historical/educational layers for current-risk layers, regional-series noise). Cartographer isn't responsible for fixing bad Staff output, but it IS responsible for failing visibly rather than silently when it receives a Map Intent referencing a nonexistent `source_id` — which is exactly the kind of Map Intent a not-fully-careful Staff can produce. Don't treat "every Map Intent Cartographer receives is well-formed and every source_id resolves" as a safe assumption during development; assume the opposite and build the missing-layer path first, not last.

## Non-goals for v1 (resist scope creep)

- No user accounts, no persistence of Map Intents beyond what's needed to render the current request, no history/URL-based revisiting of past maps.
- No attempt to implement `catalog_type: "stac"` resolution in v1 — `layers_txt`/`martin` (TileJSON) is the only catalog type you need to actually implement against; just don't architect yourself into a corner that makes adding STAC later painful (keep catalog resolution behind an interface keyed on `catalog_type`, not hard-coded to one type).
- No LLM dependency for the core render path (see above). A natural-language explanation feature is fine as an *optional*, clearly separable add-on.
- No custom URL-based sharing mechanism (explicitly rejected in ADR 0001 as "Alternatives Considered": query/hash state, opaque permalink IDs, and encrypted URL tokens were all rejected for baseline).

## Suggested starting shape (adjust if you have a strong reason to, but don't overthink this)

A minimal web app is enough:

- A small server (any language/framework you're comfortable with) exposing `GET /` (HTML form: paste Map Intent YAML, submit) and `POST /` (parse YAML, resolve catalog(s), build a MapLibre style, return an HTML page embedding MapLibre GL JS with that style plus a "Copy Map Intent" button and, if any layers failed to resolve, a visible `missing_layers` notice).
- MapLibre GL JS itself runs client-side; the server's job is producing a valid MapLibre `style.json`-equivalent (sources + layers) from the resolved TileJSON documents, and handing that to the browser. You do not need server-side tile rendering.
- Keep the YAML parsing, catalog resolution, and style-building as small, separately testable functions — this is the part that should work identically whether or not an LLM is anywhere in the stack.

## What to do first

1. Scaffold the repo (README describing the project purpose in 2-3 sentences, referencing this architecture and linking `unopengis/staccato-spec` + `hfu/layers-martin`; a LICENSE; basic project structure for your chosen stack).
2. Implement Map Intent parsing + the validation rules above, with tests using both the worked example above and a couple of deliberately-invalid intents (missing `required_layers`, missing `provenance`, an unresolvable `source_id`) to confirm you get clear errors / `missing_layers` reporting rather than silent failures or crashes.
3. Implement catalog resolution against `layers-martin`'s live catalog (real HTTP calls in an integration test are fine and encouraged — there's no mock catalog to build against, this is the real reference implementation).
4. Implement the `GET /` form and `POST /` render flow, get the worked example above actually rendering correctly in a browser, and confirm the URL never gains query params or a hash.
5. Only after that works: consider the optional LLM-generated explanation panel, and confirm the map still renders correctly with it disabled.
