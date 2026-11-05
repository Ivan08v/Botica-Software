import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import type { ResumenAlertas } from '../tipos'

const CADA_MINUTO = 60_000

// Aviso fijo en el encabezado: cuántos productos hay que reponer y cuántos lotes
// están vencidos o vencen en 30 días. Se actualiza al cambiar de pantalla y cada minuto.
export default function AvisoAlertas({ destino }: { destino: string }) {
  const [alertas, setAlertas] = useState<ResumenAlertas | null>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    let vigente = true
    const cargar = () =>
      api<ResumenAlertas>('/alertas')
        .then((r) => vigente && setAlertas(r))
        // Si falla, no se muestra el aviso: no debe estorbar la atención
        .catch(() => vigente && setAlertas(null))
    cargar()
    const intervalo = setInterval(cargar, CADA_MINUTO)
    return () => {
      vigente = false
      clearInterval(intervalo)
    }
  }, [pathname])

  if (!alertas || alertas.total === 0) return null

  const partes = [
    alertas.stockBajo > 0 && `${alertas.stockBajo} por reponer`,
    alertas.vencidos > 0 && `${alertas.vencidos} lotes vencidos`,
    alertas.porVencer30 > 0 && `${alertas.porVencer30} vencen en 30 días`,
  ].filter(Boolean)

  return (
    <Link to={destino} className="aviso-alertas" title={partes.join(' · ')} aria-label={`Alertas: ${partes.join(', ')}`}>
      <span aria-hidden="true">⚠</span> {alertas.total}
      <span className="solo-escritorio"> {alertas.total === 1 ? 'alerta' : 'alertas'}</span>
    </Link>
  )
}
