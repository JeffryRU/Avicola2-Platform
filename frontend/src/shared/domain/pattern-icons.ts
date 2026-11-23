/**
 * Íconos para las figuras de fondo: trazos de lucide (licencia ISC), en una cuadrícula de 24.
 * Copiados de lucide-react (ids cortos: la cuenta guarda hasta 4 juntos en 40 letras).
 */

export interface PatternIcon {
  id: string
  name: string
  group: string
  /** Trazos SVG del ícono (sin el <svg>), en coordenadas de 0 a 24. */
  body: string
}

export const PATTERN_ICONS: PatternIcon[] = [
  {
    id: 'egg',
    name: 'Huevo',
    group: 'Granja',
    body: "<path d='M12 2C8 2 4 8 4 14a8 8 0 0 0 16 0c0-6-4-12-8-12'/>",
  },
  {
    id: 'fried',
    name: 'Huevo frito',
    group: 'Granja',
    body: "<circle cx='11.5' cy='12.5' r='3.5'/><path d='M3 8c0-3.5 2.5-6 6.5-6 5 0 4.83 3 7.5 5s5 2 5 6c0 4.5-2.5 6.5-7 6.5-2.5 0-2.5 2.5-6 2.5s-7-2-7-5.5c0-3 1.5-3 1.5-5C3.5 10 3 9 3 8Z'/>",
  },
  {
    id: 'bird',
    name: 'Ave',
    group: 'Granja',
    body: "<path d='M16 7h.01'/><path d='M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20'/><path d='m20 7 2 .5-2 .5'/><path d='M10 18v3'/><path d='M14 17.75V21'/><path d='M7 18a6 6 0 0 0 3.84-10.61'/>",
  },
  {
    id: 'feather',
    name: 'Pluma',
    group: 'Granja',
    body: "<path d='M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49z'/><path d='M16 8 2 22'/><path d='M17.488 15H9'/>",
  },
  {
    id: 'leg',
    name: 'Presa',
    group: 'Granja',
    body: "<path d='M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23'/><path d='m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59'/>",
  },
  {
    id: 'wheat',
    name: 'Trigo',
    group: 'Granja',
    body: "<path d='M2 22 16 8'/><path d='M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z'/><path d='M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z'/><path d='M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z'/><path d='M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z'/><path d='M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z'/><path d='M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z'/><path d='M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z'/>",
  },
  {
    id: 'bean',
    name: 'Grano',
    group: 'Granja',
    body: "<path d='M10.165 6.598C9.954 7.478 9.64 8.36 9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22c7.732 0 14-6.268 14-14a6 6 0 0 0-11.835-1.402Z'/><path d='M5.341 10.62a4 4 0 1 0 5.279-5.28'/>",
  },
  {
    id: 'sprout',
    name: 'Brote',
    group: 'Granja',
    body: "<path d='M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3'/><path d='M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4'/><path d='M5 21h14'/>",
  },
  {
    id: 'leaf',
    name: 'Hoja',
    group: 'Granja',
    body: "<path d='M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20'/><path d='M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13'/>",
  },
  {
    id: 'clover',
    name: 'Trébol',
    group: 'Granja',
    body: "<path d='M16.17 7.83 2 22'/><path d='M4.02 12a2.827 2.827 0 1 1 3.81-4.17A2.827 2.827 0 1 1 12 4.02a2.827 2.827 0 1 1 4.17 3.81A2.827 2.827 0 1 1 19.98 12a2.827 2.827 0 1 1-3.81 4.17A2.827 2.827 0 1 1 12 19.98a2.827 2.827 0 1 1-4.17-3.81A1 1 0 1 1 4 12'/><path d='m7.83 7.83 8.34 8.34'/>",
  },
  {
    id: 'tractor',
    name: 'Tractor',
    group: 'Granja',
    body: "<path d='m10 11 11 .9a1 1 0 0 1 .8 1.1l-.665 4.158a1 1 0 0 1-.988.842H20'/><path d='M16 18h-5'/><path d='M18 5a1 1 0 0 0-1 1v5.573'/><path d='M3 4h8.129a1 1 0 0 1 .99.863L13 11.246'/><path d='M4 11V4'/><path d='M7 15h.01'/><path d='M8 10.1V4'/><circle cx='18' cy='18' r='2'/><circle cx='7' cy='15' r='5'/>",
  },
  {
    id: 'barn',
    name: 'Galpón',
    group: 'Granja',
    body: "<path d='M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11'/><path d='M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z'/><path d='M6 13h12'/><path d='M6 17h12'/>",
  },
  {
    id: 'truck',
    name: 'Camión',
    group: 'Reparto',
    body: "<path d='M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2'/><path d='M15 18H9'/><path d='M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14'/><circle cx='17' cy='18' r='2'/><circle cx='7' cy='18' r='2'/>",
  },
  {
    id: 'package',
    name: 'Paquete',
    group: 'Reparto',
    body: "<path d='M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z'/><path d='M12 22V12'/><polyline points='3.29 7 12 12 20.71 7'/><path d='m7.5 4.27 9 5.15'/>",
  },
  {
    id: 'scale',
    name: 'Balanza',
    group: 'Reparto',
    body: "<path d='M12 3v18'/><path d='m19 8 3 8a5 5 0 0 1-6 0zV7'/><path d='M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1'/><path d='m5 8 3 8a5 5 0 0 1-6 0zV7'/><path d='M7 21h10'/>",
  },
  {
    id: 'basket',
    name: 'Canasta',
    group: 'Reparto',
    body: "<path d='m15 11-1 9'/><path d='m19 11-4-7'/><path d='M2 11h20'/><path d='m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4'/><path d='M4.5 15.5h15'/><path d='m5 11 4-7'/><path d='m9 11 1 9'/>",
  },
  {
    id: 'store',
    name: 'Tienda',
    group: 'Reparto',
    body: "<path d='M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5'/><path d='M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244'/><path d='M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05'/>",
  },
  {
    id: 'sun',
    name: 'Sol',
    group: 'Naturaleza',
    body: "<circle cx='12' cy='12' r='4'/><path d='M12 2v2'/><path d='M12 20v2'/><path d='m4.93 4.93 1.41 1.41'/><path d='m17.66 17.66 1.41 1.41'/><path d='M2 12h2'/><path d='M20 12h2'/><path d='m6.34 17.66-1.41 1.41'/><path d='m19.07 4.93-1.41 1.41'/>",
  },
  {
    id: 'moon',
    name: 'Luna',
    group: 'Naturaleza',
    body: "<path d='M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401'/>",
  },
  {
    id: 'cloud',
    name: 'Nube',
    group: 'Naturaleza',
    body: "<path d='M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'/>",
  },
  {
    id: 'snow',
    name: 'Copo',
    group: 'Naturaleza',
    body: "<path d='m10 20-1.25-2.5L6 18'/><path d='M10 4 8.75 6.5 6 6'/><path d='m14 20 1.25-2.5L18 18'/><path d='m14 4 1.25 2.5L18 6'/><path d='m17 21-3-6h-4'/><path d='m17 3-3 6 1.5 3'/><path d='M2 12h6.5L10 9'/><path d='m20 10-1.5 2 1.5 2'/><path d='M22 12h-6.5L14 15'/><path d='m4 10 1.5 2L4 14'/><path d='m7 21 3-6-1.5-3'/><path d='m7 3 3 6h4'/>",
  },
  {
    id: 'flower',
    name: 'Flor',
    group: 'Naturaleza',
    body: "<path d='M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1'/><circle cx='12' cy='8' r='2'/><path d='M12 10v12'/><path d='M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z'/><path d='M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z'/>",
  },
  {
    id: 'pine',
    name: 'Pino',
    group: 'Naturaleza',
    body: "<path d='m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z'/><path d='M12 22v-3'/>",
  },
  {
    id: 'droplet',
    name: 'Gota',
    group: 'Naturaleza',
    body: "<path d='M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'/>",
  },
  {
    id: 'cherry',
    name: 'Cereza',
    group: 'Naturaleza',
    body: "<path d='M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z'/><path d='M12 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z'/><path d='M7 14c3.22-2.91 4.29-8.75 5-12 1.66 2.38 4.94 9 5 12'/><path d='M22 9c-4.29 0-7.14-2.33-10-7 5.71 0 10 4.67 10 7Z'/>",
  },
  {
    id: 'apple',
    name: 'Manzana',
    group: 'Naturaleza',
    body: "<path d='M12 6.528V3a1 1 0 0 1 1-1h0'/><path d='M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21'/>",
  },
  {
    id: 'carrot',
    name: 'Zanahoria',
    group: 'Naturaleza',
    body: "<path d='M15 16a1 1 0 0 0-7-7q-4 4-5.987 12.385a.5.5 0 0 0 .602.602Q11 20 15 16l-3-3'/><path d='M15 9q4 4 7 0-3-4-7 0 4-4 0-7-4 3 0 7'/><path d='m8 15-2.58-2.58'/>",
  },
  {
    id: 'fish',
    name: 'Pez',
    group: 'Naturaleza',
    body: "<path d='M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z'/><path d='M18 12v.5'/><path d='M16 17.93a9.77 9.77 0 0 1 0-11.86'/><path d='M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33'/><path d='M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4'/><path d='m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98'/>",
  },
  {
    id: 'star',
    name: 'Estrella',
    group: 'Formas',
    body: "<path d='M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'/>",
  },
  {
    id: 'heart',
    name: 'Corazón',
    group: 'Formas',
    body: "<path d='M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5'/>",
  },
  {
    id: 'circle',
    name: 'Círculo',
    group: 'Formas',
    body: "<circle cx='12' cy='12' r='10'/>",
  },
  {
    id: 'square',
    name: 'Cuadrado',
    group: 'Formas',
    body: "<rect width='18' height='18' x='3' y='3' rx='2'/>",
  },
  {
    id: 'triangle',
    name: 'Triángulo',
    group: 'Formas',
    body: "<path d='M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z'/>",
  },
  {
    id: 'hexagon',
    name: 'Hexágono',
    group: 'Formas',
    body: "<path d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'/>",
  },
  {
    id: 'diamond',
    name: 'Rombo',
    group: 'Formas',
    body: "<path d='M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z'/>",
  },
  {
    id: 'sparkle',
    name: 'Destello',
    group: 'Formas',
    body: "<path d='M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z'/>",
  },
  {
    id: 'zap',
    name: 'Rayo',
    group: 'Formas',
    body: "<path d='M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z'/>",
  },
  {
    id: 'smile',
    name: 'Carita',
    group: 'Formas',
    body: "<path d='M15 10V9'/><path d='M16.472 15a6 6 0 01-8.943 0'/><path d='M9 10V9'/><circle cx='12' cy='12' r='10'/>",
  },
]

export const PATTERN_ICON_IDS = new Set(PATTERN_ICONS.map((i) => i.id))
export const iconById = (id: string) => PATTERN_ICONS.find((i) => i.id === id)
