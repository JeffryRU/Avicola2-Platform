import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Features (screaming) con capas hexagonales dentro: cada capa solo importa hacia adentro.
 * Ver docs/adr/0004 y docs/adr/0007.
 */
const layer = (files, patterns, message) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }] },
})

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'src/shared/ui/components/shadcn'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  layer(
    ['src/**/types/**'],
    ['react', 'react-*', '@tanstack/*', '**/application/**', '**/infrastructure/**', '**/ui/**', '@/app/*'],
    'types/ es vocabulario puro (tipos, nombres y textos): no importa React ni otras capas.',
  ),
  layer(
    ['src/**/domain/**'],
    ['react', 'react-*', '@tanstack/*', '**/application/**', '**/infrastructure/**', '**/ui/**', '@/app/*'],
    'El dominio es TypeScript puro: no importa React, aplicación, infraestructura ni UI.',
  ),
  layer(
    ['src/**/application/**'],
    ['react', 'react-*', '@tanstack/*', '**/infrastructure/**', '**/ui/**', '@/app/*'],
    'La aplicación depende solo del dominio y de sus puertos.',
  ),
  layer(
    ['src/**/infrastructure/**'],
    ['react', 'react-*', '**/ui/**', '@/app/*'],
    'Los adaptadores no conocen la interfaz.',
  ),
  layer(
    ['src/shared/ui/**', 'src/features/*/ui/**'],
    ['**/infrastructure/**'],
    'La interfaz usa casos de uso y puertos (vía useContainer), nunca adaptadores concretos.',
  ),
)
