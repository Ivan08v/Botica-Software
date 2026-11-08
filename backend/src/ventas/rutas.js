import { Router } from "express";
import { z } from "zod";
import { idDeRuta, mensaje, monto, validar } from "../validacion.js";
import { listarVentas, obtenerVenta, proximoComprobante, registrarVenta } from "./servicio.js";

// En el mostrador de una botica se paga en efectivo, con tarjeta o con Yape/Plin.
// TRANSFERENCIA sigue en la base solo para las ventas antiguas que lo tienen.
export const MEDIOS_PAGO_ACEPTADOS = ["EFECTIVO", "TARJETA", "YAPE", "PLIN"];

const esquemaVenta = z.strictObject({
  items: z
    .array(
      z.strictObject({
        productoId: z.number().int(),
        cantidad: z.number().int().min(1, { error: mensaje("La cantidad debe ser al menos 1") }),
      }),
    )
    .min(1, { error: mensaje("La venta debe tener al menos un producto") })
    .max(100),
  // Cliente registrado del mismo negocio. Opcional en boleta (salvo montos altos), obligatorio en factura.
  clienteId: z.number().int().optional(),
  tipoComprobante: z
    .enum(["BOLETA", "FACTURA"], { error: mensaje("El comprobante debe ser BOLETA o FACTURA") })
    .optional(),
  medioPago: z
    .enum(MEDIOS_PAGO_ACEPTADOS, { error: mensaje("El medio de pago debe ser EFECTIVO, TARJETA, YAPE o PLIN") })
    .optional(),
  // Solo en efectivo: con cuánto paga el cliente, para calcular el vuelto
  montoRecibido: monto("El monto recibido debe ser un número con máximo 2 decimales")
    .min(0.01, { error: mensaje("El monto recibido debe ser mayor que cero") })
    .optional(),
});

// Sin restricción de rol: tanto DUENO como VENDEDOR registran ventas
export const rutasVentas = Router();

rutasVentas.get("/", async (req, res) => {
  res.json(await listarVentas(req.usuario.negocioId));
});

// Número que llevará la próxima boleta y la próxima factura (solo informativo: el número
// definitivo se asigna al registrar la venta, por si otra caja cobra antes).
// Antes de "/:id" para que no se lea como un id.
rutasVentas.get("/proximo-comprobante", async (req, res) => {
  res.json(await proximoComprobante(req.usuario.negocioId));
});

rutasVentas.get("/:id", async (req, res) => {
  res.json(await obtenerVenta(req.usuario.negocioId, idDeRuta(req.params.id)));
});

rutasVentas.post("/", async (req, res) => {
  const datos = validar(esquemaVenta, req.body);
  res.status(201).json(await registrarVenta(datos, req.usuario));
});
