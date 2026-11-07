import Icono from './Icono.jsx'
import { POR_PAGINA } from './usePaginacion.js'

// Números de página a mostrar: todas si son pocas; si no, la primera, la última y las vecinas
// de la actual, con "…" en los saltos. Ej. en la página 5 de 9: 1 … 4 5 6 … 9
function numerosDePagina(pagina, totalPaginas) {
  if (totalPaginas <= 7) return Array.from({ length: totalPaginas }, (_, i) => i + 1)
  const desde = Math.max(2, Math.min(pagina - 1, totalPaginas - 4))
  const hasta = Math.min(totalPaginas - 1, Math.max(pagina + 1, 5))
  const numeros = [1]
  if (desde > 2) numeros.push('…')
  for (let n = desde; n <= hasta; n++) numeros.push(n)
  if (hasta < totalPaginas - 1) numeros.push('…')
  numeros.push(totalPaginas)
  return numeros
}

// Controles de paginación. No se muestran si todo cabe en una página.
// Recibe lo que devuelve usePaginacion: <Paginador {...paginacion} nombre="lotes" />
export default function Paginador({
  pagina,
  totalPaginas,
  total,
  inicio,
  irA,
  porPagina = POR_PAGINA,
  nombre = 'registros',
}) {
  if (totalPaginas <= 1) return null
  const fin = Math.min(inicio + porPagina, total)

  return (
    <nav className="paginacion" aria-label="Paginación">
      <span className="tenue">
        Mostrando{' '}
        <strong>
          {inicio + 1}–{fin}
        </strong>{' '}
        de <strong>{total}</strong> {nombre}
      </span>
      <span className="paginas">
        <button type="button" disabled={pagina === 1} onClick={() => irA(pagina - 1)} aria-label="Página anterior">
          <Icono nombre="chevron_left" />
        </button>
        {numerosDePagina(pagina, totalPaginas).map((n, i) =>
          n === '…' ? (
            <span key={`salto-${i}`} className="salto">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={n === pagina ? 'actual' : undefined}
              aria-current={n === pagina ? 'page' : undefined}
              onClick={() => irA(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={pagina === totalPaginas}
          onClick={() => irA(pagina + 1)}
          aria-label="Página siguiente"
        >
          <Icono nombre="chevron_right" />
        </button>
      </span>
    </nav>
  )
}
