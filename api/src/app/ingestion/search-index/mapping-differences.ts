import type { estypes } from '@elastic/elasticsearch';
import { isRecord } from '../../../contracts/index.js';

/**
 * How an index's live mapping differs from the one the code expects, as one
 * readable line per difference; empty when they match. Elasticsearch adds
 * defaults of its own when it stores a mapping (HNSW's `m`, for one), so a
 * setting present only in the live mapping is not a difference. A field
 * present in only one of them always is.
 */
export function mappingDifferences(
  expected: estypes.MappingTypeMapping,
  actual: estypes.MappingTypeMapping,
): string[] {
  const differences: string[] = [];
  if (String(actual.dynamic) !== String(expected.dynamic)) {
    differences.push(
      `dynamic is ${describe(actual.dynamic)} in the index, expected ${describe(expected.dynamic)}`,
    );
  }

  const expectedFields = expected.properties ?? {};
  const actualFields = actual.properties ?? {};
  for (const [field, definition] of Object.entries(expectedFields)) {
    if (field in actualFields) {
      differences.push(...settingDifferences(field, definition, actualFields[field]));
    } else {
      differences.push(`${field} is missing from the index`);
    }
  }
  for (const field of Object.keys(actualFields)) {
    if (!(field in expectedFields)) {
      differences.push(`${field} is in the index but not in the mapping`);
    }
  }
  return differences;
}

function settingDifferences(path: string, expected: unknown, actual: unknown): string[] {
  if (isRecord(expected) && isRecord(actual)) {
    return Object.entries(expected).flatMap(([key, value]) =>
      settingDifferences(`${path}.${key}`, value, actual[key]),
    );
  }
  // Elasticsearch may return a number or boolean setting as a string.
  return String(expected) === String(actual)
    ? []
    : [`${path} is ${describe(actual)} in the index, expected ${describe(expected)}`];
}

function describe(value: unknown): string {
  return value === undefined ? 'not set' : JSON.stringify(value);
}
