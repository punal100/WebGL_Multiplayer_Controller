import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // Ignore build output, dependencies, and shipped artifacts.
  {
    ignores: ['dist/**', 'node_modules/**', 'release/**', '.kilo/**', 'public/**'],
  },

  // Base recommended JS rules for every file.
  js.configs.recommended,

  // Browser + React source (src/).
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      // This project uses Vite's automatic JSX runtime, so `import React`
      // is not required in every file (react/react-in-jsx-scope is off via
      // the jsx-runtime preset above).
      // Not using prop-types in this small app.
      'react/prop-types': 'off',
      // Syncing to an external system's current value on mount (e.g. a live
      // socket's connected flag) is a legitimate effect pattern; keep it a
      // warning rather than a hard error.
      'react-hooks/set-state-in-effect': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // Node code: server, build scripts, and config.
  {
    files: [
      'server/**/*.js',
      'scripts/**/*.js',
      'vite.config.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // Playwright scripts (*.mjs): Node entrypoint, but page.evaluate() closures
  // run in the browser, so allow both global sets.
  {
    files: ['*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
