import { execSync } from "node:child_process";
import { urlBaseDePruebas } from "./base-de-pruebas.js";

// Corre una vez antes de todas las pruebas e2e: deja botica_test con las tablas
// al día (la crea si no existe) y con los datos del seed como punto de partida.
export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL: urlBaseDePruebas() };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx prisma db seed", { env, stdio: "pipe" });
}
