// Linter: bewusst schmal -- Regeln, die echte Fehler finden (unbekannte Namen,
// falsch benutzte Hooks, unerreichbarer Code), keine Stilvorgaben.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const relaxed = {
  'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
};

export default [
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  { ignores: ['**/node_modules/**', 'client/dist/**', 'client/public/**', 'server/data/**', 'e2e/**'] },
  {
    files: ['server/**/*.js', 'scripts/**/*.{js,mjs}', '*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { ...js.configs.recommended.rules, ...relaxed },
  },
  {
    // Werkzeug-Skripte: enthalten Code, der im Browser ausgewertet wird, und arabische Sonderzeichen.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-irregular-whitespace': 'off' },
  },
  {
    files: ['client/src/**/*.{js,jsx}', 'client/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...relaxed,
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-key': 'warn',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];
