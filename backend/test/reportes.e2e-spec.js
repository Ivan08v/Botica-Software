// Reportes de inventario valorizado, vencimientos y ventas por período.
// La prueba crea su propio negocio con datos conocidos para que los totales sean exactos.
import bcrypt from "bcryptjs";
import request from "supertest";
import { iniciarApp } from "./app-de-prueba.js";
import { hoyEnLima } from "../src/common/fechas.js";

describe("Reportes (e2e)", () => {
  let servidor;
  let cerrar;
  let prisma;
  let tokenDueno;
  let tokenVendedor;
  let negocioId;

  function enDias(dias) {
    const d = hoyEnLima();
    d.setUTCDate(d.getUTCDate() + dias);
    return d;
  }

  const pedir = (ruta, token = tokenDueno) =>
    request(servidor).get(`/reportes/${ruta}`).set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    ({ servidor, prisma, cerrar } = await iniciarApp());

    const marca = Date.now();
    const passwordHash = await bcrypt.hash("Reporte1234", 4);
    negocioId = (await prisma.negocio.create({ data: { nombre: `Reportes ${marca}` } })).id;
    const dueno = await prisma.usuario.create({
      data: {
        negocioId,
        nombre: "Dueña",
        correo: `dueno-${marca}@reportes.test`,
        passwordHash,
        rol: "DUENO",
      },
    });
    await prisma.usuario.create({
      data: { negocioId, nombre: "Vendedor", correo: `vendedor-${marca}@reportes.test`, passwordHash },
    });

    // Producto A (precio 5): un lote vigente lejano, uno por vencer y uno vencido
    const a = await prisma.producto.create({ data: { negocioId, nombre: "A Producto", precioVenta: 5 } });
    const [lejano, porVencer] = await Promise.all([
      prisma.lote.create({
        data: {
          negocioId,
          productoId: a.id,
          numeroLote: "A-LEJOS",
          fechaVencimiento: enDias(300),
          cantidadInicial: 10,
          cantidadActual: 10,
          costoUnitario: 2,
        },
      }),
      prisma.lote.create({
        data: {
          negocioId,
          productoId: a.id,
          numeroLote: "A-PRONTO",
          fechaVencimiento: enDias(20),
          cantidadInicial: 4,
          cantidadActual: 4,
          costoUnitario: 3,
        },
      }),
      prisma.lote.create({
        data: {
          negocioId,
          productoId: a.id,
          numeroLote: "A-VENCIDO",
          fechaVencimiento: enDias(-10),
          cantidadInicial: 6,
          cantidadActual: 6,
          costoUnitario: 1,
        },
      }),
      // Agotado: no debe aparecer
      prisma.lote.create({
        data: {
          negocioId,
          productoId: a.id,
          numeroLote: "A-VACIO",
          fechaVencimiento: enDias(50),
          cantidadInicial: 5,
          cantidadActual: 0,
          costoUnitario: 2,
        },
      }),
    ]);

    // Ventas con fecha fija, una a cada lado de la medianoche de Lima del 2026-09-30
    const vender = (fecha, lote, cantidad, precio) =>
      prisma.venta.create({
        data: {
          negocioId,
          usuarioId: dueno.id,
          fecha: new Date(fecha),
          total: cantidad * precio,
          detalles: { create: [{ productoId: a.id, loteId: lote.id, cantidad, precioUnitario: precio }] },
        },
      });
    await vender("2026-09-30T04:30:00Z", lejano, 1, 5); // 29/09 23:30 en Lima
    await vender("2026-09-30T15:00:00Z", lejano, 2, 5); // 30/09 10:00 en Lima
    await vender("2026-10-01T04:59:00Z", porVencer, 3, 6); // 30/09 23:59 en Lima
    await vender("2026-10-01T05:00:00Z", lejano, 4, 5); // 01/10 00:00 en Lima

    const entrar = async (correo) =>
      (await request(servidor).post("/auth/login").send({ correo, password: "Reporte1234" })).body
        .accessToken;
    tokenDueno = await entrar(`dueno-${marca}@reportes.test`);
    tokenVendedor = await entrar(`vendedor-${marca}@reportes.test`);
  });

  afterAll(async () => {
    await cerrar();
  });

  it("inventario valorizado: separa vigente y vencido, sin lotes agotados", async () => {
    const res = await pedir("inventario").expect(200);

    expect(res.body.resumen).toEqual({
      productos: 1,
      vigente: { lotes: 2, unidades: 14, valorCosto: "32.00", valorVenta: "70.00" }, // 10x2 + 4x3 ; 14x5
      vencido: { lotes: 1, unidades: 6, valorCosto: "6.00", valorVenta: "30.00" },
    });
    expect(res.body.filas.map((f) => [f.numeroLote, f.estado, f.valorCosto])).toEqual([
      ["A-VENCIDO", "VENCIDO", "6.00"],
      ["A-PRONTO", "DIAS_30", "12.00"],
      ["A-LEJOS", "VIGENTE", "20.00"],
    ]);
  });

  it("vencimientos: con venceEnDias solo trae lo vencido o por vencer", async () => {
    const res = await pedir("inventario?venceEnDias=30").expect(200);
    expect(res.body.venceEnDias).toBe(30);
    expect(res.body.filas.map((f) => f.numeroLote)).toEqual(["A-VENCIDO", "A-PRONTO"]);
  });

  it("ventas: respeta los días del calendario de Perú y calcula la ganancia por lote", async () => {
    const res = await pedir("ventas?desde=2026-09-30&hasta=2026-09-30").expect(200);

    expect(res.body.filas.map((f) => [f.dia, f.numeroLote, f.cantidad])).toEqual([
      ["2026-09-30", "A-LEJOS", 2],
      ["2026-09-30", "A-PRONTO", 3],
    ]);
    // Total 2x5 + 3x6 = 28 ; costo 2x2 + 3x3 = 13
    // Sin IGV, línea por línea: 10 / 1.18 = 8.47 y 18 / 1.18 = 15.25 -> 23.72 (IGV 4.28)
    // La ganancia se calcula sin el IGV, que no es de la botica: 23.72 - 13 = 10.72
    expect(res.body.resumen).toEqual({
      ventas: 2,
      unidades: 5,
      total: "28.00",
      opGravada: "23.72",
      igv: "4.28",
      costo: "13.00",
      ganancia: "10.72",
    });
    expect(res.body.filas[0]).toEqual(
      expect.objectContaining({
        subtotal: "10.00",
        valorVenta: "8.47",
        igv: "1.53",
        costo: "4.00",
        ganancia: "4.47",
        // Estas ventas se cargaron directo a la base: sin serie ni cliente, en efectivo por defecto
        comprobante: null,
        medioPago: "EFECTIVO",
        cliente: null,
        documentoCliente: null,
      }),
    );
  });

  it("ventas: cada fila trae el comprobante, el cliente y el medio de pago de su venta", async () => {
    const cliente = await prisma.cliente.create({
      data: { negocioId, tipoDocumento: "RUC", documento: "20123456789", nombre: "Clínica Reporte S.A.C." },
    });
    const producto = await prisma.producto.findFirstOrThrow({ where: { negocioId } });
    const lote = await prisma.lote.findFirstOrThrow({ where: { productoId: producto.id, cantidadActual: { gt: 0 } } });
    await prisma.venta.create({
      data: {
        negocioId,
        usuarioId: (await prisma.usuario.findFirstOrThrow({ where: { negocioId } })).id,
        fecha: new Date("2026-09-15T15:00:00Z"),
        total: 5,
        tipoComprobante: "FACTURA",
        serie: "F001",
        numero: 7,
        medioPago: "YAPE",
        clienteId: cliente.id,
        detalles: { create: [{ productoId: producto.id, loteId: lote.id, cantidad: 1, precioUnitario: 5 }] },
      },
    });

    const res = await pedir("ventas?desde=2026-09-15&hasta=2026-09-15").expect(200);
    expect(res.body.filas[0]).toEqual(
      expect.objectContaining({
        comprobante: "F001-00000007",
        medioPago: "YAPE",
        cliente: "Clínica Reporte S.A.C.",
        documentoCliente: "RUC 20123456789",
      }),
    );
  });

  it("ventas: un período de varios días incluye ambos extremos", async () => {
    const res = await pedir("ventas?desde=2026-09-29&hasta=2026-10-01").expect(200);
    expect(res.body.resumen.ventas).toBe(4);
  });

  it("ventas: valida el período", async () => {
    await pedir("ventas?desde=2026-10-05&hasta=2026-10-01").expect(400);
    await pedir("ventas?desde=2026-02-31&hasta=2026-03-01").expect(400);
    await pedir("ventas?desde=2024-01-01&hasta=2026-01-01").expect(400);
    await pedir("ventas?desde=ayer&hasta=hoy").expect(400);
  });

  it("el vendedor no puede ver reportes (403)", async () => {
    await pedir("inventario", tokenVendedor).expect(403);
    await pedir("ventas?desde=2026-09-30&hasta=2026-09-30", tokenVendedor).expect(403);
  });
});
