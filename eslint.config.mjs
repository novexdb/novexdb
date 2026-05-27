import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // `website/` is a sibling Next.js project with its own lint toolchain — its
  // generated .next/ output and source files are not ours to police here.
  // `build/` holds generated icons; nothing in it is source.
  { ignores: ['out', 'dist', 'build', 'node_modules', 'website', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules
    }
  },
  // Node-only scripts (build tools, generators) need Node globals so
  // `console`, `process`, etc. don't fail the no-undef rule.
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' }
      ]
    }
  }
)
