import { isRecord, isString } from '../../contracts/index.js';

/**
 * Turns a `LoggerService` call's trailing arguments into log fields. Nest puts
 * the source class last and the stack before it; our own callers pass fields.
 */
export function toLogFields(params: readonly unknown[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const rest = [...params];

  if (rest.length > 0 && isString(rest[rest.length - 1])) {
    fields['source'] = rest.pop();
  }

  for (const param of rest) {
    if (isRecord(param)) {
      Object.assign(fields, param);
    } else {
      fields['detail'] = param;
    }
  }

  return fields;
}
