# Example Map Intents (evaluation fixtures)

Verified-good Map Intents used as regression fixtures for the evaluation
harness (`../eval-intent.ts`). Each one resolves fully and renders in this
Cartographer against the live `layers-martin` (and, for aerial/volcano,
`stars.optgeo.org`) catalogs.

Run the harness over all of them:

```sh
node --experimental-strip-types scripts/eval-intent.ts scripts/example-intents/*.yaml
```

All eight should report `RESULT: PASS` (suite 8/8). A failure means either a
catalog `source_id`/`style_id` was renamed/removed upstream, or a layer lost
data coverage over its `area.bbox` — both worth investigating.

| file | user question it answers | notes |
|------|--------------------------|-------|
| 01-sediment-hazard | 札幌市の土砂災害警戒区域 | 3 hazard-zone rasters |
| 02-ishikari-flood-control | 石狩川の治水について考えたい | 治水地形分類図 × 洪水浸水想定 |
| 03-flood-inundation | 石狩平野の洪水浸水想定 | max-scale + plan-scale |
| 04-land-condition | 石狩平野の土地条件 | uses lcmfc2 (lcm25k has no data there) |
| 05-aerial-photo | 石狩平野を空中写真で | second catalog (stars.optgeo, raster) |
| 06-volcano-geology | 北海道（道央）の火山地質図 | second catalog (stars.optgeo, vector), source_id-based (`required_layers`) |
| 07-volcano-land-condition-map | 北海道（道央）の火山土地条件図 | D39: `required_styles`/`optional_styles` (style_id-based), resolves against the live `stars.optgeo.org/style/vlcm`+`/vbm`. Matches `layers-martin` STAFF_PROMPT.md's worked example 3 verbatim. |
| 08-volcano-land-condition-map-esan | 恵山の火山土地条件図が見たい | Same D39 mechanism as 07, but for a *different* volcano than the prompt's own worked example -- produced by an isolated agent role-playing Staff against the (updated) `layers-martin` STAFF_PROMPT.md text alone, verifying the prompt's *general* guidance (not just its worked example) reliably steers a fresh Staff instance to `required_styles`. |

These were produced while metric-driving improvements to the `layers-martin`
`STAFF_PROMPT.md` (its DECISIONS.md D24). The "液状化" (liquefaction) test
question is intentionally absent: the correct Staff behavior there is to
decline (no such layer exists), so there is no intent to render.
