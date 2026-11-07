import { POR_PAGINA } from './usePaginacion.js'

// Controles "Anterior / Página X de Y / Siguiente". No se muestran si todo cabe en una página.
// Recibe lo que devuelve usePaginacion: <Paginador {...paginacion} />
export default function Paginador({ pagina, totalPaginas, total, inicio, irA }) {
  if (totalPaginas <= 1) return null
  const fin = Math.min(inicio + POR_PAGINA, total)

  return (
    <nav className="paginacion" aria-label="Paginación">
      <span className="tenue">
        {inicio + 1}–{fin} de {total}
      </span>
      <span className="fila">
        <button
          type="button"
          className="boton secundario chico"
          disabled={pagina === 1}
          onClick={() => irA(pagina - 1)}
        >
          ‹ Anterior
        </button>
        <span aria-live="polite">
          {pagina} / {totalPaginas}
        </span>
        <button
          type="button"
          className="boton secundario chico"
          disabled={pagina === totalPaginas}
          onClick={() => irA(pagina + 1)}
        >
          Siguiente ›
        </button>
      </span>
    </nav>
  )
}
