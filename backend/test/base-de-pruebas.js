import "dotenv/config";

// Las pruebas e2e escriben y borran datos, así que usan su propia base (botica_test)
// en el mismo servidor PostgreSQL. Se puede cambiar con DATABASE_URL_TEST (ej. en CI).
export function urlBaseDePruebas() {
  let url = process.env.DATABASE_URL_TEST;
  if (!url) {
    if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL en el archivo .env");
    const derivada = new URL(process.env.DATABASE_URL);
    derivada.pathname = "/botica_test";
    url = derivada.toString();
  }

  // Seguro contra accidentes: jamás correr pruebas sobre una base que no sea de pruebas
  const nombre = new URL(url).pathname.slice(1);
  if (!nombre.endsWith("_test")) {
    throw new Error(`La base de pruebas debe terminar en "_test" y se recibió "${nombre}"`);
  }
  return url;
}
