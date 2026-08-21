import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src-tauri'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // core/ 는 순수 로직만 둔다. 브라우저 전역과 현재 시각 접근을 막는다.
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: '현재 시각은 인자로 받는다.' },
        { name: 'window', message: 'core 는 브라우저에 의존하지 않는다.' },
        { name: 'document', message: 'core 는 브라우저에 의존하지 않는다.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: '현재 시각은 인자로 받는다.' },
        { object: 'Math', property: 'random', message: 'core 는 결정적이어야 한다.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: '현재 시각은 인자로 받는다. core 에서 Date 를 만들지 않는다.',
        },
      ],
    },
  }
)
