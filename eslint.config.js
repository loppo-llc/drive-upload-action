const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  {
    files: ['eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    }
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-console': 'off'
    }
  }
];
