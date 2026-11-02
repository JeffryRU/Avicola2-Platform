import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Arquitectura hexagonal: cada capa solo importa hacia adentro (ver docs/adr/0004). */
const layer = (files, patterns, message) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }] },
})

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'src/ui/components/shadcn'] },
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
    ['src/ui/**', 'src/modules/*/ui/**'],
    ['**/infrastructure/**'],
    'La interfaz usa casos de uso y puertos (vía useContainer), nunca adaptadores concretos.',
  ),
)
