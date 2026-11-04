import js from '@eslint/js'
import vitest from '@vitest/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Features (screaming) con capas hexagonales dentro: cada capa solo importa hacia adentro.
 * Ver docs/adr/0004 y docs/adr/0008.
 */
const layer = (files, patterns, message) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }] },
})

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'src/shared/ui/components/shadcn'] },
  {
    // Reglas con información de tipos (typescript-eslint): estrictas y de estilo.
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Tipos: imports de tipos explícitos y switch exhaustivos sobre uniones.
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // Números en plantillas (`${n} días`) son comunes y seguros; el resto, no.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Handlers async en props de React (onClick={async () => ...}) están bien.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      // Flechas cortas que devuelven void (onClick={() => setOpen(false)}) son idiomáticas.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // Sin `noUncheckedIndexedAccess`, marca como innecesarios los `?.` sobre Records
      // (units[d]?.[id]), que sí pueden faltar en tiempo de ejecución.
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // Valores por defecto de contextos y callbacks opcionales: () => {}.
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],
      // Calidad general.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'object-shorthand': 'error',
      'prefer-template': 'error',
      // Reglas del proyecto (CLAUDE.md): sin diálogos nativos (los bloquean navegadores
      // embebidos: usar ConfirmDialog) y almacenamiento del navegador solo vía puertos.
      'no-restricted-globals': [
        'error',
        { name: 'confirm', message: 'Usa ConfirmDialog.' },
        { name: 'alert', message: 'Usa toast o ConfirmDialog.' },
        { name: 'prompt', message: 'Usa un formulario o un diálogo.' },
        { name: 'localStorage', message: 'Usa el puerto KeyValueStore (container.preferences).' },
        { name: 'sessionStorage', message: 'Usa el puerto KeyValueStore.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'confirm', message: 'Usa ConfirmDialog.' },
        { object: 'window', property: 'alert', message: 'Usa toast o ConfirmDialog.' },
        { object: 'window', property: 'localStorage', message: 'Usa el puerto KeyValueStore.' },
      ],
    },
  },
  {
    // Solo la raíz de composición y los adaptadores tocan el almacenamiento del navegador.
    files: ['src/app/container.ts', 'src/**/infrastructure/**'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    files: ['eslint.config.js', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Pruebas unitarias (Vitest).
    files: ['src/**/unit-tests/**'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/consistent-test-it': ['error', { fn: 'it' }],
      'vitest/no-focused-tests': 'error',
      'vitest/prefer-to-be': 'error',
      // Los dobles de prueba usan `as` y métodos sin `this`.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // Los dobles de prueba implementan puertos async sin esperar nada.
      '@typescript-eslint/require-await': 'off',
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
