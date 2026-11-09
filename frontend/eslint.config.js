import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const API_LITERAL_MESSAGE =
  'Do not hard-code "/api/..." (it breaks in production). Use apiUrl() from src/config/api.ts, ' +
  'or apiFetch() from src/app/apiFetch.ts, with the path after /api (e.g. "/consistency/...").'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      'react-refresh/only-export-components': 'warn',
    }
  },
  {
    // Backend URLs come from one place (src/config/api.ts). A hard-coded
    // "/api/..." works locally (Vite proxy) but in production it hits the
    // frontend host and gets index.html back. Paths start after /api.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/config/api.ts', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'Literal[value=/^\\/api(\\/|$)/]',
          message: API_LITERAL_MESSAGE,
        },
        {
          selector: 'TemplateLiteral > TemplateElement:first-child[value.raw=/^\\/api(\\/|$)/]',
          message: API_LITERAL_MESSAGE,
        },
      ],
    },
  },
])
