# faceless-cartographer

Cartographer implementation for the Staccato architecture (see [`unopengis/staccato-spec`](https://github.com/unopengis/staccato-spec)): an internet-facing service that receives a posted [Map Intent](https://github.com/unopengis/staccato-spec/blob/main/spec/map-intent-vnext.md) and deterministically renders a MapLibre GL JS map from it, without exposing map state in the URL ("faceless", per [ADR 0001](https://github.com/unopengis/staccato-spec/blob/main/spec/adr/0001-faceless-cartographer.md)).

This repository is not yet implemented. Start with [`JUMPSTART.md`](JUMPSTART.md), which briefs an implementer (human or AI) on the architecture, the normative constraints, the Map Intent schema, and a first acceptance test validated against the reference Library implementation, [`hfu/layers-martin`](https://github.com/hfu/layers-martin).
