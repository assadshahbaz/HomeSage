import js from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';
import { typeScriptBase } from '../config/eslint.base.mjs';

const SELECTOR_PREFIX = 'hs';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', '.angular/**'] },
  ...typeScriptBase({ js, tseslint, prettier, tsconfigRootDir: import.meta.dirname }),
  {
    files: ['**/*.ts'],
    extends: [angular.configs.tsRecommended],
    // Inline templates are linted with the template rules below.
    processor: angular.processInlineTemplates,
    rules: {
      // A component with no members is still a component: the decorator is the body.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: SELECTOR_PREFIX, style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: SELECTOR_PREFIX, style: 'camelCase' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
);
