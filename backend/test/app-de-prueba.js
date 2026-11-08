import { crearApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";

// Levanta la API en un puerto libre para las pruebas (sin el prefijo /api: las rutas
// se piden como "/productos"). Devuelve el servidor, Prisma y cómo apagar todo al final.
export async function iniciarApp() {
  const servidor = crearApp({ prefijo: "" }).listen(0);
  await new Promise((listo) => servidor.once("listening", listo));

  // Seguro contra accidentes: las pruebas escriben y borran datos, jamás sobre una base real
  const [{ base }] = await prisma.$queryRaw`SELECT current_database() AS base`;
  if (!base.endsWith("_test")) throw new Error(`Las pruebas no pueden correr sobre la base "${base}"`);

  async function cerrar() {
    await new Promise((listo) => servidor.close(listo));
    await prisma.$disconnect();
  }
  return { servidor, prisma, cerrar };
}
