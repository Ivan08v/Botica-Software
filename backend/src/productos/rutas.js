import { Router } from "express";
import { z } from "zod";
import { requiereRol } from "../auth/middleware.js";
import { solicitudIncorrecta } from "../errores.js";
import { idDeRuta, mensaje, monto, validar } from "../validacion.js";
import {
  actualizarProducto,
  crearProducto,
  desactivarProducto,
  listarProductos,
  obtenerPorCodigo,
  obtenerProducto,
  productosFrecuentes,
} from "./servicio.js";

// Los opcionales aceptan null: así, al editar, se puede borrar el laboratorio o el código
const campos = {
  nombre: z.string().min(1, { error: mensaje("El nombre es obligatorio") }).max(150),
  laboratorio: z.string().max(100).nullish(),
  presentacion: z.string().max(100).nullish(),
  codigoBarras: z
    .string()
    .regex(/^\d{8,14}$/, { error: mensaje("El código de barras debe tener entre 8 y 14 dígitos") })
    .nullish(),
  precioVenta: monto("El precio debe ser un número con máximo 2 decimales").min(0.01, {
    error: mensaje("El precio debe ser mayor que cero"),
  }),
  stockMinimo: z.number().int().min(0).optional(),
};

const esquemaCrear = z.strictObject(campos);
// Al editar, todo es opcional; además se puede reactivar un producto desactivado
const esquemaActualizar = z.strictObject(campos).partial().extend({ activo: z.boolean().optional() });

// "true" / "false" en la URL
function booleanoDeConsulta(valor) {
  if (valor === undefined) return false;
  if (valor === "true" || valor === "false") return valor === "true";
  throw solicitudIncorrecta("incluirInactivos debe ser true o false");
}

// Leer: cualquier usuario con sesión. Crear, editar y desactivar: solo DUENO.
// Siempre dentro del negocio del usuario.
export const rutasProductos = Router();

rutasProductos.get("/", async (req, res) => {
  const incluirInactivos = booleanoDeConsulta(req.query.incluirInactivos);
  res.json(await listarProductos(req.usuario.negocioId, req.query.buscar, incluirInactivos));
});

// Antes de "/:id" para que "frecuentes" no se lea como un id
rutasProductos.get("/frecuentes", async (req, res) => {
  res.json(await productosFrecuentes(req.usuario.negocioId));
});

rutasProductos.get("/codigo/:codigoBarras", async (req, res) => {
  res.json(await obtenerPorCodigo(req.usuario.negocioId, req.params.codigoBarras));
});

rutasProductos.get("/:id", async (req, res) => {
  res.json(await obtenerProducto(req.usuario.negocioId, idDeRuta(req.params.id)));
});

rutasProductos.post("/", requiereRol("DUENO"), async (req, res) => {
  const datos = validar(esquemaCrear, req.body);
  res.status(201).json(await crearProducto(req.usuario.negocioId, datos));
});

rutasProductos.patch("/:id", requiereRol("DUENO"), async (req, res) => {
  const id = idDeRuta(req.params.id);
  const datos = validar(esquemaActualizar, req.body);
  res.json(await actualizarProducto(req.usuario.negocioId, id, datos));
});

rutasProductos.delete("/:id", requiereRol("DUENO"), async (req, res) => {
  res.json(await desactivarProducto(req.usuario.negocioId, idDeRuta(req.params.id)));
});
