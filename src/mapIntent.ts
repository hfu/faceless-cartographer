import { load } from 'js-yaml';
import type { CatalogEntry, MapIntent } from './types.ts';

export type ParseResult =
  | { ok: true; intent: MapIntent }
  | { ok: false; error: string };

// Validation rules from unopengis/staccato-spec spec/map-intent-vnext.md §6.
// Reject clearly rather than guessing -- a partially-valid intent should
// never render silently as if it were complete.
export function parseMapIntent(yamlText: string): ParseResult {
  let raw: unknown;
  try {
    raw = load(yamlText);
  } catch (e) {
    return { ok: false, error: `Map Intent is not valid YAML: ${(e as Error).message}` };
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Map Intent must be a YAML mapping (object) at the top level.' };
  }

  const doc = raw as Record<string, unknown>;

  for (const required of ['spec_version', 'goal', 'catalog_context', 'required_layers', 'provenance']) {
    if (!(required in doc) || doc[required] === null || doc[required] === undefined) {
      return { ok: false, error: `Map Intent is missing required field "${required}".` };
    }
  }

  if (typeof doc.spec_version !== 'string') {
    return { ok: false, error: '"spec_version" must be a string.' };
  }
  if (typeof doc.goal !== 'string') {
    return { ok: false, error: '"goal" must be a string.' };
  }

  const catalogContext = doc.catalog_context as Record<string, unknown>;
  if (typeof catalogContext !== 'object' || catalogContext === null) {
    return { ok: false, error: '"catalog_context" must be a mapping.' };
  }
  const activeCatalogs = catalogContext.active_catalogs;
  if (!Array.isArray(activeCatalogs) || activeCatalogs.length === 0) {
    return { ok: false, error: '"catalog_context.active_catalogs" must be a non-empty array.' };
  }
  for (const [i, entry] of activeCatalogs.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, error: `catalog_context.active_catalogs[${i}] must be a mapping.` };
    }
    const e = entry as Record<string, unknown>;
    for (const field of ['id', 'type', 'uri']) {
      if (typeof e[field] !== 'string' || e[field] === '') {
        return { ok: false, error: `catalog_context.active_catalogs[${i}] is missing required field "${field}".` };
      }
    }
  }
  const catalogTypes = new Set((activeCatalogs as CatalogEntry[]).map((c) => c.type));

  const resolutionPolicy = catalogContext.resolution_policy as Record<string, unknown> | undefined;
  if (resolutionPolicy !== undefined) {
    if (typeof resolutionPolicy !== 'object' || resolutionPolicy === null) {
      return { ok: false, error: '"catalog_context.resolution_policy" must be a mapping.' };
    }
    const precedence = resolutionPolicy.precedence;
    if (precedence !== undefined) {
      if (!Array.isArray(precedence)) {
        return { ok: false, error: '"catalog_context.resolution_policy.precedence" must be an array.' };
      }
      for (const type of precedence) {
        if (!catalogTypes.has(type as string)) {
          return {
            ok: false,
            error: `"catalog_context.resolution_policy.precedence" references catalog_type "${type}", which is not present in active_catalogs.`
          };
        }
      }
    }
  }

  const requiredLayers = doc.required_layers;
  if (!Array.isArray(requiredLayers) || requiredLayers.length === 0) {
    return { ok: false, error: '"required_layers" must be a non-empty array.' };
  }
  for (const [i, layer] of requiredLayers.entries()) {
    if (typeof layer !== 'object' || layer === null || typeof (layer as Record<string, unknown>).source_id !== 'string') {
      return { ok: false, error: `required_layers[${i}] must have a string "source_id".` };
    }
  }

  const optionalLayers = doc.optional_layers;
  if (optionalLayers !== undefined) {
    if (!Array.isArray(optionalLayers)) {
      return { ok: false, error: '"optional_layers" must be an array.' };
    }
    for (const [i, layer] of optionalLayers.entries()) {
      if (typeof layer !== 'object' || layer === null || typeof (layer as Record<string, unknown>).source_id !== 'string') {
        return { ok: false, error: `optional_layers[${i}] must have a string "source_id".` };
      }
    }
  }

  const provenance = doc.provenance as Record<string, unknown>;
  if (typeof provenance !== 'object' || provenance === null) {
    return { ok: false, error: '"provenance" must be a mapping.' };
  }
  for (const field of ['generated_by', 'generated_at', 'intent_id']) {
    if (typeof provenance[field] !== 'string' || provenance[field] === '') {
      return { ok: false, error: `"provenance.${field}" must be a non-empty string.` };
    }
  }

  return { ok: true, intent: doc as unknown as MapIntent };
}
