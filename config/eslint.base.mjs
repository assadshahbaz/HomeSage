const TYPESCRIPT_FILES = ['**/*.ts'];
const TEST_FILES = ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'];

/** Numbers that carry their own meaning wherever they appear. */
const ALLOWED_NUMBERS = [0, 1, -1];

const SHARED_RULES = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/explicit-function-return-type': [
    'error',
    {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
    },
  ],
  '@typescript-eslint/explicit-module-boundary-types': 'error',
  '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
  '@typescript-eslint/no-magic-numbers': [
    'error',
    {
      ignore: ALLOWED_NUMBERS,
      ignoreArrayIndexes: true,
      ignoreDefaultValues: true,
      ignoreEnums: true,
      ignoreNumericLiteralTypes: true,
      ignoreReadonlyClassProperties: true,
      ignoreTypeIndexes: true,
      enforceConst: true,
    },
  ],
  '@typescript-eslint/no-floating-promises': 'error',
  // A number reads the same either way, so interpolating one hides nothing.
  '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
  '@typescript-eslint/naming-convention': [
    'error',
    {
      selector: 'default',
      format: ['camelCase'],
      leadingUnderscore: 'forbid',
      trailingUnderscore: 'forbid',
    },
    { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
    {
      selector: 'variable',
      modifiers: ['const', 'global'],
      format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
    },
    // A leading underscore marks a parameter that only exists to reach the next one.
    { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
    { selector: 'typeLike', format: ['PascalCase'] },
    { selector: 'enumMember', format: ['UPPER_CASE'] },
    { selector: 'import', format: ['camelCase', 'PascalCase'] },
    // Wire shapes and config keys are named by whatever produced them.
    { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
  ],
  'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
};

const TEST_RULES = {
  '@typescript-eslint/no-magic-numbers': 'off',
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/no-non-null-assertion': 'off',
  '@typescript-eslint/unbound-method': 'off',
  '@typescript-eslint/no-dynamic-delete': 'off',
  // A stub that does nothing is the point of the stub.
  '@typescript-eslint/no-empty-function': 'off',
  // Matchers like `expect.any` and Nest's `getHttpServer` hand back `any` by
  // design. Member access and calls on an `any` stay errors.
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
};

/**
 * Flat config entries that every TypeScript file in the repo is held to.
 *
 * The toolchain is passed in rather than imported, because this file sits at
 * the repo root where neither app's `node_modules` is reachable. Each app
 * therefore lints with the eslint and typescript versions it builds with.
 */
export function typeScriptBase({ js, tseslint, prettier, tsconfigRootDir }) {
  return tseslint.config(
    {
      files: TYPESCRIPT_FILES,
      extends: [
        js.configs.recommended,
        tseslint.configs.strictTypeChecked,
        tseslint.configs.stylisticTypeChecked,
      ],
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: SHARED_RULES,
    },
    { files: TEST_FILES, rules: TEST_RULES },
    // Last, so formatting is Prettier's job alone.
    { files: TYPESCRIPT_FILES, ...prettier },
  );
}
