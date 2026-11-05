/**
 * Wire contracts shared with the web app, plus the checks both apps narrow
 * values with. The API owns every request and response shape; the web app
 * imports these through the `@api/contracts` alias. Files here may import only
 * `zod` and each other, never NestJS or anything else in the API. They import
 * it as `import * as z from 'zod'`: the `{ z }` form keeps all of zod in the
 * web bundle, about 350 kB more.
 */
export * from './chat.contract.js';
export * from './health.contract.js';
export * from './property.contract.js';
export * from './question.contract.js';
export * from './rate-limit.contract.js';
export * from './router.contract.js';
export * from './search.contract.js';
export * from './sql.contract.js';
export * from './type-guards.js';
