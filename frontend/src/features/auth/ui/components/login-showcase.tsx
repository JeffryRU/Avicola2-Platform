import chickens from '@/features/auth/ui/assets/login-chickens.webp'

/**
 * Panel izquierdo del login (solo escritorio): foto de la granja bajo un velo del color de la
 * barra, y el producto en una frase. En alto contraste el velo es más denso para que el texto
 * siga pasando contraste; con «Ocultar imágenes» queda el fondo plano.
 */
export function LoginShowcase() {
  return (
    <div className="relative hidden overflow-hidden bg-head text-head-foreground dsk:flex">
      <img
        src={chickens}
        alt=""
        aria-hidden
        decoding="async"
        className="absolute inset-0 size-full object-cover object-[50%_40%] dark:brightness-75 dark:saturate-75"
      />
      {/* Velo: deja ver la foto arriba y oscurece abajo, donde va el texto. */}
      <div
        aria-hidden
        data-decor
        className="absolute inset-0 bg-linear-to-t from-head via-head/75 to-head/35 dark:from-background dark:via-background/85 dark:to-head/55 hc:via-head/90 hc:to-head/60 hc:dark:from-head hc:dark:via-head/90 hc:dark:to-head/70"
      />
      {/* Borde derecho en curva suave (como un huevo) en lugar de un corte recto, con un filo de la marca. */}
      <svg
        aria-hidden
        viewBox="0 0 64 1000"
        preserveAspectRatio="none"
        data-decor
        className="absolute inset-y-0 right-0 h-full w-16"
      >
        <path d="M64 0H40C8 220 0 420 14 600C24 760 44 900 40 1000H64Z" fill="var(--background)" />
        <path
          d="M40 0C8 220 0 420 14 600C24 760 44 900 40 1000"
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.45"
          strokeWidth="2"
          className="hc:[stroke-width:3px] hc:[stroke-opacity:1]"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative flex flex-1 flex-col justify-between p-12 pr-20">
        <span className="text-md font-semibold hc:font-extrabold">AviPlanner</span>
        <div>
          <h2 className="max-w-[18ch] text-4xl font-semibold hc:font-extrabold">Planifica la demanda de cada día</h2>
          <p className="mt-3 max-w-[44ch] text-md text-head-foreground/85 hc:text-head-muted">
            Registra tu proyección por producto, aunque no tengas señal, y compárala con el pedido real.
          </p>
        </div>
      </div>
    </div>
  )
}
