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

// Tipos de documento de un cliente (los mismos que acepta el backend)
export const TIPOS_DOCUMENTO = {
  DNI: { nombre: 'DNI', ayuda: '8 dígitos', largo: 8 },
  RUC: { nombre: 'RUC', ayuda: '11 dígitos, empieza con 10 o 20', largo: 11 },
  CE: { nombre: 'Carné de extranjería', ayuda: '9 a 12 caracteres', largo: 12 },
}

// Los precios incluyen IGV (18 %): se separa la base imponible del impuesto para el comprobante
export function desgloseIgv(total) {
  const base = Math.round((Number(total) / 1.18) * 100) / 100
  return { base, igv: Math.round((Number(total) - base) * 100) / 100 }
}
