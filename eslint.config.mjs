import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/.next/**',
      '**/.expo/**',
      '**/next-env.d.ts',
      'artifacts/**',
      'test-results/**',
      'playwright-report/**',
      'examples/web/public/vendor/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['*'], message: 'Core must have no external or platform imports.' }],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'fetch',
        'XMLHttpRequest',
        'process',
      ],
    },
  },
];
