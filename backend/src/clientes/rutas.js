import { Router } from "express";
import { z } from "zod";
import { idDeRuta, mensaje, validar } from "../validacion.js";
import {
  actualizarCliente,
  crearCliente,
  eliminarCliente,
  listarClientes,
  obtenerCliente,
  obtenerPorDocumento,
} from "./servicio.js";

// Un opcional enviado vacío ("") se guarda como null: así, al editar, también se puede borrar
const opcional = (esquema) =>
  z.preprocess((valor) => (typeof valor === "string" ? valor.trim() || null : valor), esquema.nullish());

const campos = {
  // Si no se indica, se deduce del documento (ver tipoDeDocumento en el servicio)
  tipoDocumento: z.enum(["DNI", "CE", "RUC"], { error: mensaje("El tipo de documento debe ser DNI, CE o RUC") }).optional(),
  // DNI: 8 dígitos. RUC: 11 dígitos. Carné de extranjería: 9 a 12 caracteres alfanuméricos.
  // Que el formato coincida con el tipo elegido se revisa en el servicio.
  documento: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{8,12}$/, {
      error: mensaje(
        "El documento debe ser un DNI (8 dígitos), RUC (11 dígitos) o carné de extranjería (9 a 12 caracteres)",
      ),
    }),
  nombre: z
    .string()
    .trim()
    .min(2, { error: mensaje("El nombre debe tener entre 2 y 120 caracteres") })
    .max(120, { error: mensaje("El nombre debe tener entre 2 y 120 caracteres") }),
  telefono: opcional(
    z.string().regex(/^\+?\d{6,15}$/, { error: mensaje("El teléfono solo puede tener números (6 a 15 dígitos)") }),
  ),
  email: opcional(z.email({ error: mensaje("El correo no es válido") }).max(120)),
  direccion: opcional(z.string().max(200, { error: mensaje("La dirección puede tener hasta 200 caracteres") })),
};

const esquemaCrear = z.strictObject(campos);
const esquemaActualizar = z.strictObject(campos).partial();

// Sin restricción de rol: el vendedor registra y consulta clientes desde la caja
export const rutasClientes = Router();

rutasClientes.get("/", async (req, res) => {
  res.json(await listarClientes(req.usuario.negocioId, req.query.buscar));
});

rutasClientes.get("/documento/:documento", async (req, res) => {
  res.json(await obtenerPorDocumento(req.usuario.negocioId, req.params.documento));
});

rutasClientes.get("/:id", async (req, res) => {
  res.json(await obtenerCliente(req.usuario.negocioId, idDeRuta(req.params.id)));
});

rutasClientes.post("/", async (req, res) => {
  const datos = validar(esquemaCrear, req.body);
  res.status(201).json(await crearCliente(req.usuario.negocioId, datos));
});

rutasClientes.patch("/:id", async (req, res) => {
  const id = idDeRuta(req.params.id);
  const datos = validar(esquemaActualizar, req.body);
  res.json(await actualizarCliente(req.usuario.negocioId, id, datos));
});

// Responde 204 sin cuerpo. Un cliente con compras no se elimina (409).
rutasClientes.delete("/:id", async (req, res) => {
  await eliminarCliente(req.usuario.negocioId, idDeRuta(req.params.id));
  res.status(204).end();
});
