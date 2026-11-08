// Las fechas de vencimiento son columnas DATE: Prisma las entrega como medianoche UTC.
// "Hoy" se calcula con el calendario de Perú, no con el del servidor (que en la nube suele estar en UTC).
export function hoyEnLima(ahora = new Date()) {
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(ahora);
  return new Date(`${fecha}T00:00:00.000Z`);
}

// Instante en que empieza un día del calendario de Perú, para filtrar columnas con hora
// (como la fecha de una venta). Perú está en UTC-5 todo el año (no cambia de horario):
// las 00:00 en Lima son las 05:00 UTC.
export function inicioDelDiaEnLima(fecha) {
  return new Date(`${fecha}T05:00:00.000Z`);
}

// Fecha del calendario de Perú (AAAA-MM-DD) en que ocurrió un instante
export function fechaEnLima(instante) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(instante);
}
