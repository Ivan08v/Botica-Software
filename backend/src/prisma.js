import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/index.js";

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL en el archivo .env");
}

// Una sola instancia para toda la app: un solo grupo de conexiones a PostgreSQL
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Decimal, errores conocidos de Prisma y tipos de transacción
export { Prisma };
