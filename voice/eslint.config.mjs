import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';
import { typeScriptBase } from '../config/eslint.base.mjs';

/** Files that are allowed to read the environment directly. */
const ENVIRONMENT_READERS = ['src/infra/config/**/*.ts', 'test/**/*.ts', 'tools/**/*.ts'];

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'data/**'] },
  ...typeScriptBase({ js, tseslint, prettier, tsconfigRootDir: import.meta.dirname }),
  {
    files: ['**/*.ts'],
    rules: {
      // Nest resolves an injected class at runtime, so its import has to survive erasure.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],
      // Config is the one place that reads raw env, and it validates before anything else sees it.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration through src/infra/config instead of process.env.',
        },
      ],
    },
  },
  { files: ENVIRONMENT_READERS, rules: { 'no-restricted-properties': 'off' } },
  // A Nest module is an empty class carrying decorator metadata, which is what it is for.
  { files: ['**/*.module.ts'], rules: { '@typescript-eslint/no-extraneous-class': 'off' } },
);
