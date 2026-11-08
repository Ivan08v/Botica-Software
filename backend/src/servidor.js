import "dotenv/config";
import { crearApp } from "./app.js";
import { prisma } from "./prisma.js";

const puerto = process.env.PORT ?? 3001;

const servidor = crearApp().listen(puerto, () => {
  console.log(`API de la botica en http://localhost:${puerto}/api`);
});

// Los errores de una ruta ya los atiende Express (responde 500 y los registra). Esto es para lo que
// ocurra fuera de una petición: que quede escrito el motivo en vez de que el proceso termine en silencio.
process.on("unhandledRejection", (error) => {
  console.error("Promesa rechazada sin manejar:", error);
});
process.on("uncaughtException", (error) => {
  console.error("Error no controlado, el servidor se detiene:", error);
  process.exit(1);
});

// Al detenerlo (Ctrl+C o el hosting), termina las peticiones en curso y cierra las conexiones a la base
for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => {
    servidor.close(() => prisma.$disconnect().finally(() => process.exit(0)));
  });
}
