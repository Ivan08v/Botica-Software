import { urlBaseDePruebas } from "./base-de-pruebas.js";

// Se ejecuta antes de cada archivo de pruebas e2e, antes de que arranque la app.
// Una variable ya definida gana sobre el .env, así que la app se conecta a botica_test.
process.env.DATABASE_URL = urlBaseDePruebas();
