import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'tests/**', 'vitest.config.js', 'eslint.config.mjs'] },
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'tests/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['off'],
      'no-console': 'off',
      'no-constant-condition': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'eqeqeq': 'off',
      'no-var': 'error',
      'prefer-const': 'off',
    },
  },
];
