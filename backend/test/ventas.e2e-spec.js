// Pruebas de ventas con FEFO contra PostgreSQL real (base botica_test).
// Cada prueba crea su propio producto y sus lotes, así no depende de las demás.
import request from "supertest";
import { iniciarApp } from "./app-de-prueba.js";
import { hoyEnLima } from "../src/common/fechas.js";

describe("Ventas con FEFO (e2e)", () => {
  let servidor;
  let cerrar;
  let prisma;
  let token;
  let negocioId;

  function enDias(dias) {
    const d = hoyEnLima();
    d.setUTCDate(d.getUTCDate() + dias);
    return d;
  }

  // Crea un producto con lotes. Se insertan directo en la base porque la API
  // (con razón) no deja ingresar lotes ya vencidos.
  async function crearProducto(precio, lotes) {
    const producto = await prisma.producto.create({
      data: { negocioId, nombre: `Prueba FEFO ${Date.now()}-${Math.random()}`, precioVenta: precio },
    });
    const ids = [];
    for (const [i, l] of lotes.entries()) {
      const lote = await prisma.lote.create({
        data: {
          negocioId,
          productoId: producto.id,
          numeroLote: `T-${i + 1}`,
          fechaVencimiento: enDias(l.venceEnDias),
          cantidadInicial: l.cantidad,
          cantidadActual: l.cantidad,
          costoUnitario: 1,
        },
      });
      ids.push(lote.id);
    }
    return { productoId: producto.id, loteIds: ids };
  }

  async function cantidades(loteIds) {
    const lotes = await prisma.lote.findMany({ where: { id: { in: loteIds } } });
    return loteIds.map((id) => lotes.find((l) => l.id === id).cantidadActual);
  }

  function vender(items) {
    return request(servidor).post("/ventas").set("Authorization", `Bearer ${token}`).send({ items });
  }

  beforeAll(async () => {
    ({ servidor, prisma, cerrar } = await iniciarApp());

    const [{ base }] = await prisma.$queryRaw`SELECT current_database() AS base`;
    expect(base).toMatch(/_test$/);

    const res = await request(servidor)
      .post("/auth/login")
      .send({ correo: "vendedor@demo.pe", password: "Demo1234" });
    token = res.body.accessToken;
    negocioId = res.body.negocio.id;
  });

  afterAll(async () => {
    await cerrar();
  });

  describe("venta que usa varios lotes", () => {
    it("agota primero el lote que vence antes y sigue con el siguiente", async () => {
      // Se crean en desorden a propósito: manda la fecha de vencimiento, no el orden de ingreso
      const { productoId, loteIds } = await crearProducto(2.5, [
        { venceEnDias: 200, cantidad: 20 },
        { venceEnDias: 10, cantidad: 5 },
        { venceEnDias: 40, cantidad: 10 },
      ]);
      const [lejano, proximo, medio] = loteIds;

      const res = await vender([{ productoId, cantidad: 8 }]).expect(201);

      expect(res.body.detalles.map((d) => [d.loteId, d.cantidad])).toEqual([
        [proximo, 5],
        [medio, 3],
      ]);
      expect(res.body.total).toBe("20"); // 8 x S/ 2.50
      expect(await cantidades([proximo, medio, lejano])).toEqual([0, 7, 20]);
    });

    it("registra un movimiento VENTA negativo por cada lote usado", async () => {
      const { productoId } = await crearProducto(1, [
        { venceEnDias: 10, cantidad: 2 },
        { venceEnDias: 20, cantidad: 2 },
      ]);
      const res = await vender([{ productoId, cantidad: 3 }]).expect(201);

      const movimientos = await prisma.movimiento.findMany({
        where: { productoId, tipo: "VENTA" },
        orderBy: { id: "asc" },
      });
      expect(movimientos.map((m) => m.cantidad)).toEqual([-2, -1]);
      expect(movimientos[0].motivo).toBe(`Venta #${res.body.id}`);
    });

    it("un lote que vence hoy todavía se puede vender", async () => {
      const { productoId } = await crearProducto(1, [{ venceEnDias: 0, cantidad: 4 }]);
      await vender([{ productoId, cantidad: 4 }]).expect(201);
    });
  });

  describe("stock insuficiente", () => {
    it("rechaza la venta con 409 y no descuenta nada", async () => {
      const { productoId, loteIds } = await crearProducto(1, [
        { venceEnDias: 10, cantidad: 5 },
        { venceEnDias: 40, cantidad: 10 },
      ]);

      const res = await vender([{ productoId, cantidad: 16 }]).expect(409);

      expect(res.body.message).toContain("se pidieron 16 y hay 15 disponibles");
      expect(await cantidades(loteIds)).toEqual([5, 10]);
      expect(await prisma.detalleVenta.count({ where: { productoId } })).toBe(0);
    });

    it("si falla un producto, se revierte la venta completa", async () => {
      const conStock = await crearProducto(1, [{ venceEnDias: 30, cantidad: 10 }]);
      const sinStock = await crearProducto(1, [{ venceEnDias: 30, cantidad: 1 }]);

      await vender([
        { productoId: conStock.productoId, cantidad: 4 },
        { productoId: sinStock.productoId, cantidad: 2 },
      ]).expect(409);

      expect(await cantidades(conStock.loteIds)).toEqual([10]);
      expect(await prisma.movimiento.count({ where: { productoId: conStock.productoId } })).toBe(0);
    });
  });

  describe("lotes vencidos", () => {
    it("no se venden: la venta sale del lote vigente aunque el vencido tenga stock", async () => {
      const { productoId, loteIds } = await crearProducto(1, [
        { venceEnDias: -1, cantidad: 50 },
        { venceEnDias: 30, cantidad: 5 },
      ]);
      const [vencido, vigente] = loteIds;

      const res = await vender([{ productoId, cantidad: 3 }]).expect(201);

      expect(res.body.detalles.map((d) => d.loteId)).toEqual([vigente]);
      expect(await cantidades([vencido, vigente])).toEqual([50, 2]);
    });

    it("no cuentan como stock: si solo queda lo vencido, la venta se rechaza", async () => {
      const { productoId, loteIds } = await crearProducto(1, [
        { venceEnDias: -1, cantidad: 50 },
        { venceEnDias: 30, cantidad: 5 },
      ]);

      const res = await vender([{ productoId, cantidad: 6 }]).expect(409);

      expect(res.body.message).toContain("hay 5 disponibles");
      expect(await cantidades(loteIds)).toEqual([50, 5]);
    });
  });

  describe("ventas simultáneas del mismo producto", () => {
    it("dos ventas que juntas superan el stock: una entra y la otra se rechaza", async () => {
      const { productoId, loteIds } = await crearProducto(1, [{ venceEnDias: 30, cantidad: 10 }]);

      const respuestas = await Promise.all([
        vender([{ productoId, cantidad: 7 }]),
        vender([{ productoId, cantidad: 7 }]),
      ]);

      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await cantidades(loteIds)).toEqual([3]);
    });

    it("diez ventas a la vez sobre 6 unidades en dos lotes: se venden exactamente 6", async () => {
      const { productoId, loteIds } = await crearProducto(1, [
        { venceEnDias: 10, cantidad: 2 },
        { venceEnDias: 30, cantidad: 4 },
      ]);

      const respuestas = await Promise.all(
        Array.from({ length: 10 }, () => vender([{ productoId, cantidad: 1 }])),
      );

      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(6);
      expect(respuestas.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await cantidades(loteIds)).toEqual([0, 0]);
      const vendido = await prisma.detalleVenta.aggregate({
        where: { productoId },
        _sum: { cantidad: true },
      });
      expect(vendido._sum.cantidad).toBe(6);
    });
  });

  describe("validaciones", () => {
    it("rechaza una venta sin productos o con cantidad cero (400)", async () => {
      await vender([]).expect(400);
      await vender([{ productoId: 1, cantidad: 0 }]).expect(400);
    });

    it("rechaza un producto que no existe (404)", async () => {
      await vender([{ productoId: 99999999, cantidad: 1 }]).expect(404);
    });

    it("sin token no se puede vender (401)", async () => {
      await request(servidor).post("/ventas").send({ items: [] }).expect(401);
    });
  });
});
