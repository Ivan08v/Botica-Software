import { useState } from 'react'

export const POR_PAGINA = 10

// Pagina una lista ya cargada, de 10 en 10.
// `reinicio` es lo que define la lista (texto buscado, filtro elegido): si cambia, se vuelve a la página 1.
export function usePaginacion(items, reinicio) {
  const [estado, setEstado] = useState({ pagina: 1, reinicio })
  const totalPaginas = Math.max(1, Math.ceil(items.length / POR_PAGINA))
  const elegida = Object.is(estado.reinicio, reinicio) ? estado.pagina : 1
  // Si la lista se achica (por ejemplo al desactivar un producto), no quedarse en una página vacía
  const pagina = Math.min(elegida, totalPaginas)
  const inicio = (pagina - 1) * POR_PAGINA

  return {
    visibles: items.slice(inicio, inicio + POR_PAGINA),
    pagina,
    totalPaginas,
    total: items.length,
    inicio,
    irA: (nueva) => setEstado({ pagina: nueva, reinicio }),
  }
}
