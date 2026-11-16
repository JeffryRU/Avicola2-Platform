/** Panel izquierdo del login (solo escritorio): el producto y para qué sirve, en una frase. Plano, sin adornos. */
export function LoginShowcase() {
  return (
    <div className="hidden flex-col justify-between bg-head p-12 text-head-foreground dsk:flex">
      <span className="text-md font-semibold hc:font-extrabold">AviPlanner</span>
      <div>
        <h2 className="max-w-[18ch] text-4xl font-semibold hc:font-extrabold">Planifica la demanda de cada día</h2>
        <p className="mt-3 max-w-[44ch] text-md text-head-muted">
          Registra tu proyección por producto, aunque no tengas señal, y compárala con la venta real.
        </p>
      </div>
    </div>
  )
}
