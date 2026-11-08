import cors from "cors";
import express from "express";
import { autenticar } from "./auth/middleware.js";
import { rutasAuth } from "./auth/rutas.js";
import { rutasClientes } from "./clientes/rutas.js";
import { manejarErrores, rutaNoEncontrada } from "./errores.js";
import { rutasImportacion } from "./importacion/rutas.js";
import { rutasLotes } from "./lotes/rutas.js";
import { rutasAlertas, rutasPanel } from "./panel/rutas.js";
import { rutasProductos } from "./productos/rutas.js";
import { rutasReportes } from "./reportes/rutas.js";
import { rutasVentas } from "./ventas/rutas.js";

// Arma la aplicación de Express con todas sus rutas. No la pone a escuchar:
// eso lo hace servidor.js (y las pruebas, cada una con su propio puerto).
export function crearApp({ prefijo = "/api" } = {}) {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true }));
  // El límite por defecto (100 kb) no alcanza para importar un inventario de 2000 filas
  app.use(express.json({ limit: "2mb" }));

  const api = express.Router();
  // /auth/login es la única ruta pública; todas las demás exigen un token válido
  api.use("/auth", rutasAuth);
  api.use("/productos", autenticar, rutasProductos);
  api.use("/lotes", autenticar, rutasLotes);
  api.use("/ventas", autenticar, rutasVentas);
  api.use("/clientes", autenticar, rutasClientes);
  api.use("/panel", autenticar, rutasPanel);
  api.use("/alertas", autenticar, rutasAlertas);
  api.use("/importacion", autenticar, rutasImportacion);
  api.use("/reportes", autenticar, rutasReportes);
  app.use(prefijo || "/", api);

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
