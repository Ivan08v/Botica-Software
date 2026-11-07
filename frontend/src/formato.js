export function soles(monto) {
  return `S/ ${Number(monto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Las fechas de vencimiento llegan como "2027-03-15T00:00:00.000Z" (medianoche UTC).
// Se muestra la parte de la fecha tal cual, sin pasar por la zona horaria del navegador,
// para que no aparezca el día anterior.
export function fecha(iso) {
  const [anio, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${anio}`
}

export function fechaHora(iso) {
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
}
