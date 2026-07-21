// Map Intent schema, mirrored from UNopenGIS/staccato-spec spec/map-intent-vnext.md.
// Field names here are normative -- do not rename them locally.

export interface CatalogEntry {
  id: string;
  type: string; // catalog_type: "martin" | "layers_txt" | "stac" (others tolerated, just won't resolve)
  uri: string;
  version?: string;
}

export interface ResolutionPolicy {
  precedence?: string[];
  on_conflict?: string; // only "first_match" is implemented
}

export interface CatalogContext {
  active_catalogs: CatalogEntry[];
  resolution_policy?: ResolutionPolicy;
}

export interface LayerRef {
  source_id: string;
  label?: string;
}

// A reference to a whole published Martin style (sources+layers), not a
// single source_id -- see DECISIONS.md D39. Only resolvable against a real
// Martin server (catalog_type "martin"); layers_txt catalogs have no
// concept of a published style to serve.
export interface StyleRef {
  style_id: string;
  label?: string;
}

export interface Area {
  name?: string | null;
  bbox?: [number, number, number, number] | null;
}

export interface RenderHints {
  center?: [number, number];
  zoom?: number;
  bearing?: number;
  pitch?: number;
}

export interface SharingPolicy {
  url_share?: boolean;
  intent_share?: boolean;
}

export interface Provenance {
  generated_by: string;
  generated_at: string;
  intent_id: string;
}

export interface MapIntent {
  spec_version: string;
  goal: string;
  area?: Area;
  catalog_context: CatalogContext;
  // D39: at least one of required_layers/required_styles must be non-empty
  // (parseMapIntent enforces this) -- neither alone is mandatory at the type
  // level, mirroring how optional_layers/optional_styles are already handled.
  required_layers?: LayerRef[];
  optional_layers?: LayerRef[];
  required_styles?: StyleRef[];
  optional_styles?: StyleRef[];
  relationships_to_highlight?: string[];
  render_hints?: RenderHints;
  sharing_policy?: SharingPolicy;
  provenance: Provenance;
  // Unknown top-level keys are tolerated per spec 4/7 -- don't invent new ones,
  // but don't reject payloads that carry them either.
  [key: string]: unknown;
}

// TileJSON's vector_layers entry (present when a real Martin server can
// inspect actual MVT contents, e.g. stars.optgeo.org -- absent from
// hfu/layers-martin's TileJSON since it can't recover this from layers.txt
// alone, D7 there).
export interface VectorLayerDescriptor {
  id: string;
  fields?: Record<string, string>;
  minzoom?: number;
  maxzoom?: number;
  description?: string;
}

// TileJSON 3.0.0 (loose), as served by a Martin-compatible Library such as
// hfu/layers-martin or a real Martin server (e.g. stars.optgeo.org). Only
// the fields Cartographer actually reads are typed.
export interface TileJson {
  tilejson: string;
  name?: string;
  tiles: string[];
  scheme?: string;
  minzoom?: number;
  maxzoom?: number;
  bounds?: [number, number, number, number];
  attribution?: string;
  description?: string;
  vector_layers?: VectorLayerDescriptor[];
  // Extension key, not part of TileJSON 3.0 proper. See
  // hfu/layers-martin DECISIONS.md D18.
  legend_image_url?: string;
  // Legend published only as a PDF (no inline image). See hfu/layers-martin
  // D26 -- surfaced by the Cartographer as a "凡例 (PDF)" link, not an <img>.
  legend_pdf_url?: string;
  [key: string]: unknown;
}

export interface ResolvedLayer {
  source_id: string;
  label?: string;
  required: boolean;
  catalog_id: string;
  tilejson: TileJson;
}

export interface ResolveResult {
  resolved: ResolvedLayer[];
  missing: string[]; // source_ids that could not be resolved from any active catalog
}

// A published MapLibre style document, as served by a real Martin server's
// GET {base}/style/{style_id} (Martin's own convention, not part of
// TileJSON). Only the fields Cartographer actually reads are typed, same
// policy as TileJson above (Postel's law, D12).
export interface PublishedStyle {
  version?: number;
  sources: Record<string, Record<string, unknown>>;
  layers: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ResolvedStyle {
  style_id: string;
  label?: string;
  required: boolean;
  catalog_id: string;
  style: PublishedStyle;
}

export interface ResolveStylesResult {
  resolved: ResolvedStyle[];
  missing: string[]; // style_ids that could not be resolved from any active catalog
}
