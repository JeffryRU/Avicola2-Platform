/**
 * Fondo del formulario de login: retícula de puntos que se desvanece hacia el centro y unas
 * pocas siluetas de huevo en línea fina, en las esquinas. Decorativo (aria-hidden), usa los
 * tokens del tema (sirve en claro, oscuro y alto contraste) y se oculta con «Ocultar imágenes».
 */
export function LoginBackdrop() {
  return (
    <div aria-hidden data-decor className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-90 hc:opacity-25"
        style={{
          backgroundImage: 'radial-gradient(var(--border) 1.2px, transparent 1.2px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse 55% 50% at 50% 50%, transparent 35%, black 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 55% 50% at 50% 50%, transparent 35%, black 100%)',
        }}
      />
      <svg
        className="absolute -bottom-16 -left-14 h-72 w-60 text-primary opacity-[0.14]"
        viewBox="0 0 120 150"
        fill="none"
      >
        <path
          d="M60 4C30 4 6 58 6 94c0 30 24 52 54 52s54-22 54-52C114 58 90 4 60 4Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M60 22C38 22 20 64 20 94c0 22 18 38 40 38"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
      </svg>
      <svg
        className="absolute -top-10 -right-8 h-48 w-40 rotate-[18deg] text-primary opacity-[0.12]"
        viewBox="0 0 120 150"
        fill="none"
      >
        <path
          d="M60 4C30 4 6 58 6 94c0 30 24 52 54 52s54-22 54-52C114 58 90 4 60 4Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <svg
        className="absolute right-[12%] bottom-[14%] size-24 text-primary opacity-[0.12]"
        viewBox="0 0 100 100"
        fill="none"
      >
        <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="50" cy="50" r="30" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />
      </svg>
      <svg className="absolute top-[18%] left-[10%] size-5 text-primary opacity-25" viewBox="0 0 20 20" fill="none">
        <path d="M10 2v16M2 10h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <svg className="absolute top-[30%] right-[22%] size-3.5 text-primary opacity-25" viewBox="0 0 20 20" fill="none">
        <path d="M10 2v16M2 10h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <svg className="absolute bottom-[30%] left-[18%] size-3 text-primary opacity-30" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  )
}
