import { readdirSync } from 'node:fs'
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

/**
 * Dependencias permitidas entre features, siempre por su punto de entrada (`@/features/<x>`, su
 * index.ts). Cada una solo puede depender de las que aparecen antes: así no hay ciclos. Lo que
 * necesitan varias y no depende de la app (sesión, productos, fechas, formatos) va a shared/.
 */
const FEATURE_DEPS = {
  auth: [],
  catalog: [],
  sellers: [],
  versions: [],
  notifications: ['auth'],
  editing: ['auth', 'sellers'],
  projections: ['auth', 'catalog', 'editing', 'sellers'],
  connection: ['auth', 'projections'],
  dashboards: ['auth', 'catalog', 'editing', 'projections', 'sellers'],
  history: ['auth', 'catalog', 'sellers'],
  production: ['auth', 'catalog'],
  saca: ['auth', 'catalog', 'production'],
  stock: ['auth', 'catalog'],
  accounts: ['auth', 'editing'],
  profile: ['auth', 'versions'],
  home: ['auth', 'catalog', 'dashboards', 'editing', 'notifications', 'projections'],
}

// Toda carpeta de src/features debe estar declarada, y sin ciclos (solo hacia atrás en la lista).
const declared = Object.keys(FEATURE_DEPS)
const onDisk = readdirSync(new URL('./src/features', import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
for (const name of onDisk) {
  if (!declared.includes(name)) throw new Error(`eslint.config.js: falta la feature "${name}" en FEATURE_DEPS.`)
}
for (const name of declared) {
  if (!onDisk.includes(name)) throw new Error(`eslint.config.js: la feature "${name}" de FEATURE_DEPS ya no existe.`)
}
declared.forEach((name, i) => {
  for (const dep of FEATURE_DEPS[name]) {
    if (declared.indexOf(dep) >= i) throw new Error(`eslint.config.js: "${name}" depende de "${dep}", que va después.`)
  }
})

/** Lo que cada capa no puede importar (además de las fronteras entre features). */
const PURE = ['react', 'react-*', '@tanstack/*', '**/application/**', '**/infrastructure/**', '**/ui/**', '@/app/*']
const LAYERS = {
  types: {
    patterns: PURE,
    message: 'types/ es vocabulario puro (tipos, nombres y textos): no importa React ni otras capas.',
  },
  domain: {
    patterns: PURE,
    message: 'El dominio es TypeScript puro: no importa React, aplicación, infraestructura ni UI.',
  },
  application: {
    patterns: ['react', 'react-*', '@tanstack/*', '**/infrastructure/**', '**/ui/**', '@/app/*'],
    message: 'La aplicación depende solo del dominio y de sus puertos.',
  },
  infrastructure: {
    patterns: ['react', 'react-*', '**/ui/**', '@/app/*'],
    message: 'Los adaptadores no conocen la interfaz.',
  },
  ui: {
    patterns: ['**/infrastructure/**'],
    message: 'La interfaz usa casos de uso y puertos (vía useContainer), nunca adaptadores concretos.',
  },
}
/** Capas que no pueden ejecutar código de otra feature (su index.ts arrastra React): solo `import type`. */
const PURE_LAYERS = new Set(['types', 'domain', 'application', 'infrastructure'])

const restrict = (files, patterns) => ({ files, rules: { 'no-restricted-imports': ['error', { patterns }] } })

/** `import()` dinámico: no-restricted-imports no lo revisa, así que se cubre con no-restricted-syntax. */
const noDynamicImport = (files, pattern, message) => ({
  files,
  rules: {
    'no-restricted-syntax': ['error', { selector: `ImportExpression[source.value=/${pattern}/]`, message }],
  },
})

/** Rutas con «..»: relativas hacia arriba (`../`, `./../`) o alias que vuelven atrás (`@/features/x/../y`). */
const UP_RELATIVE = {
  regex: '^\\.{1,2}/(.*/)?\\.\\.(/|$)|^\\.\\./|^@/(features|shared|app)/.*\\.\\.(/|$)',
  message: 'Usa el alias @/ sin «..» (las rutas que vuelven atrás saltan las fronteras).',
}

/** Reglas de import de una carpeta de una feature: su capa + fronteras con las demás features y con app/. */
function featureRules(feature, layer) {
  const deps = FEATURE_DEPS[feature]
  const others = declared.filter((f) => f !== feature)
  const forbidden = others.filter((f) => !deps.includes(f))
  const patterns = [
    {
      group: ['@/features/*/**', `!@/features/${feature}/**`],
      message:
        'Otra feature se importa solo por su punto de entrada (@/features/<feature>), nunca sus archivos internos.',
    },
    UP_RELATIVE,
    {
      regex: `^@/features/${feature}$`,
      message: 'Dentro de la feature se importa el archivo, no su propio index.ts (evita ciclos).',
    },
  ]
  if (forbidden.length) {
    patterns.push({
      group: forbidden.map((f) => `@/features/${f}`),
      message: `"${feature}" no depende de esa feature (FEATURE_DEPS en eslint.config.js, ADR 0008). Si ambas la necesitan, va a shared/.`,
    })
  }
  if (layer && PURE_LAYERS.has(layer) && deps.length) {
    patterns.push({
      group: deps.map((f) => `@/features/${f}`),
      allowTypeImports: true,
      message: `En ${layer}/ de otra feature solo se usan tipos (import type). Lo que se ejecuta en varias features va a shared/.`,
    })
  }
  if (layer && LAYERS[layer]) patterns.push({ group: LAYERS[layer].patterns, message: LAYERS[layer].message })
  // app/ es la raíz de composición: una feature solo usa de ahí el contenedor, las rutas y la instalación.
  patterns.push({
    group: ['@/app/*', '!@/app/di', '!@/app/routes', '!@/app/install'],
    message: 'Una feature solo importa de app/ el contenedor (di), las rutas (routes) y la instalación (install).',
  })
  return patterns
}

const featureBoundaries = declared.flatMap((feature) => [
  restrict([`src/features/${feature}/**`], featureRules(feature, null)),
  noDynamicImport(
    [`src/features/${feature}/**`],
    `^@\\u002Ffeatures\\u002F(?!${feature}\\u002F)`,
    'Una feature no carga con import() archivos de otra; las pantallas las carga app/.',
  ),
  ...Object.keys(LAYERS).map((layer) =>
    restrict([`src/features/${feature}/${layer}/**`], featureRules(feature, layer)),
  ),
])

/** shared/ es lo común: no conoce ninguna feature ni la app. */
const SHARED_BOUNDARY = {
  group: ['@/features/*', '@/app/*'],
  message: 'shared/ no importa features ni app/: lo de una sola feature vuelve a su feature.',
}
const sharedBoundaries = [
  restrict(['src/shared/**'], [SHARED_BOUNDARY, UP_RELATIVE]),
  noDynamicImport(['src/shared/**'], '^@\\u002F(features|app)\\u002F', SHARED_BOUNDARY.message),
  ...Object.entries(LAYERS).map(([layer, { patterns, message }]) =>
    restrict([`src/shared/${layer}/**`], [SHARED_BOUNDARY, UP_RELATIVE, { group: patterns, message }]),
  ),
]

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
  ...featureBoundaries,
  ...sharedBoundaries,
)
