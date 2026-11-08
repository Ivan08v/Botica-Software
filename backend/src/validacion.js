import { z } from "zod";
import { solicitudIncorrecta } from "./errores.js";

// Los mensajes por defecto de Zod salen en español ("Entrada inválida: se esperaba número...")
z.config(z.locales.es());

// Mensajes propios ("El precio debe ser mayor que cero"): se muestran tal cual.
// A los mensajes por defecto de Zod se les antepone el campo para saber a cuál se refieren.
const propios = new Set();
export function mensaje(texto) {
  propios.add(texto);
  return texto;
}

function describir(problema) {
  if (propios.has(problema.message) || problema.path.length === 0) return problema.message;
  return `${problema.path.join(".")}: ${problema.message}`;
}

// Valida y devuelve los datos ya limpios (con los recortes y conversiones del esquema).
// Si algo no cumple, responde 400 con la lista de problemas. Los esquemas usan
// z.strictObject: un campo que no está en el esquema también es un error.
export function validar(esquema, datos) {
  const resultado = esquema.safeParse(datos ?? {});
  if (!resultado.success) throw solicitudIncorrecta(resultado.error.issues.map(describir));
  return resultado.data;
}

// Un ":id" de la ruta como número entero
export function idDeRuta(valor) {
  if (!/^\d+$/.test(valor)) throw solicitudIncorrecta("El id de la ruta debe ser un número entero");
  return Number(valor);
}

// Recorta los espacios de un texto (los demás valores pasan igual)
export const recortado = (valor) => (typeof valor === "string" ? valor.trim() : valor);

// Un monto en soles: número con máximo 2 decimales (ej. 12.5 o 12.50, pero no 12.505)
export function monto(textoError) {
  const error = mensaje(textoError);
  return z.number({ error }).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, { error });
}
