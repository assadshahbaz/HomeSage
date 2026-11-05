import type { HybridRetrieval } from '../../retrieval/hybrid-retrieval.service.js';
import type { AllowedCitations } from './citation-guard.js';

/**
 * What a turn may cite, from exactly what it retrieved: its one aggregate
 * result when the SQL computed values, otherwise the properties it found.
 */
export function allowedCitations(retrieval: HybridRetrieval): AllowedCitations {
  if (retrieval.sql?.aggregate) {
    return { kind: 'aggregate' };
  }
  return {
    kind: 'properties',
    ids: new Set(retrieval.properties.map((entry) => entry.property.id)),
  };
}
