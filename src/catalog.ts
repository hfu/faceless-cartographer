import type { CatalogEntry, LayerRef, MapIntent, ResolvedLayer, ResolveResult, TileJson } from './types.ts';

// TileJSON 3.0 (collection model) is the canonical consumption model per
// unopengis/staccato-spec spec/catalog-integration.md §10. A Martin-style
// catalog exposes GET /{source_id} for that document; the catalog root itself
// (…/catalog) is only used to discover the base URL, not fetched here.
const SUPPORTED_CATALOG_TYPES = new Set(['martin', 'layers_txt']);

function catalogBaseUrl(uri: string): string {
  return uri.replace(/\/catalog(\.json)?\/?$/, '');
}

async function fetchTileJson(catalog: CatalogEntry, sourceId: string): Promise<TileJson | null> {
  if (!SUPPORTED_CATALOG_TYPES.has(catalog.type)) {
    // catalog_type "stac" (or anything else) is out of scope for v1 -- see
    // HANDOVER.md "v1 のスコープ外". Treat as unresolvable rather than guessing.
    return null;
  }
  const base = catalogBaseUrl(catalog.uri);
  try {
    const res = await fetch(`${base}/${sourceId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (
      data !== null &&
      typeof data === 'object' &&
      typeof (data as Record<string, unknown>).tilejson === 'string' &&
      Array.isArray((data as Record<string, unknown>).tiles)
    ) {
      return data as TileJson;
    }
    return null;
  } catch {
    // Network failure, CORS failure, non-JSON body, etc. -- all count as
    // "could not resolve," not a hard error for the whole render.
    return null;
  }
}

function orderCatalogsByPrecedence(intent: MapIntent): CatalogEntry[] {
  const catalogs = intent.catalog_context.active_catalogs;
  const precedence = intent.catalog_context.resolution_policy?.precedence;
  if (!precedence || precedence.length === 0) {
    return catalogs;
  }
  const rank = new Map(precedence.map((type, i) => [type, i]));
  return [...catalogs].sort((a, b) => {
    const ra = rank.has(a.type) ? rank.get(a.type)! : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.type) ? rank.get(b.type)! : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

async function resolveOne(
  layerRef: LayerRef,
  required: boolean,
  orderedCatalogs: CatalogEntry[]
): Promise<ResolvedLayer | { source_id: string }> {
  // on_conflict: "first_match" -- try catalogs in precedence order, first
  // successful resolution wins.
  for (const catalog of orderedCatalogs) {
    const tilejson = await fetchTileJson(catalog, layerRef.source_id);
    if (tilejson) {
      return { source_id: layerRef.source_id, label: layerRef.label, required, catalog_id: catalog.id, tilejson };
    }
  }
  return { source_id: layerRef.source_id };
}

export async function resolveLayers(intent: MapIntent): Promise<ResolveResult> {
  const orderedCatalogs = orderCatalogsByPrecedence(intent);

  const tasks: Promise<ResolvedLayer | { source_id: string }>[] = [
    ...intent.required_layers.map((l) => resolveOne(l, true, orderedCatalogs)),
    ...(intent.optional_layers ?? []).map((l) => resolveOne(l, false, orderedCatalogs))
  ];

  const settled = await Promise.all(tasks);

  const resolved: ResolvedLayer[] = [];
  const missing: string[] = [];
  for (const item of settled) {
    if ('tilejson' in item) {
      resolved.push(item);
    } else {
      missing.push(item.source_id);
    }
  }

  return { resolved, missing };
}
