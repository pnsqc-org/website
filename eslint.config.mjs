import js from '@eslint/js';
import htmlPlugin from '@html-eslint/eslint-plugin';
import globals from 'globals';

const htmlRecommended = htmlPlugin.configs['flat/recommended'];

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'content/**',
      'design/**',
      'src/docs/**',
      'src/images/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: ['src/js/**/*.js'],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    ...js.configs.recommended,
    files: ['*.mjs'],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ...htmlRecommended,
    files: ['src/**/*.html'],
    rules: {
      ...htmlRecommended.rules,
      '@html-eslint/attrs-newline': 'off',
      '@html-eslint/element-newline': 'off',
      '@html-eslint/indent': 'off',
      '@html-eslint/no-extra-spacing-attrs': 'off',
      '@html-eslint/quotes': 'off',
      '@html-eslint/require-closing-tags': 'off',
      '@html-eslint/require-title': 'off',
      '@html-eslint/use-baseline': 'off',
    },
  },
];
