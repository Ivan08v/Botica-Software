// Baja de lotes vencidos (destrucción o devolución al proveedor) y su reporte.
// Crea su propio negocio: así sabe exactamente qué lotes vencidos hay.
import bcrypt from "bcryptjs";
import request from "supertest";
import { iniciarApp } from "./app-de-prueba.js";
import { fechaEnLima, hoyEnLima } from "../src/common/fechas.js";

describe("Bajas por vencimiento (e2e)", () => {
  let servidor;
  let cerrar;
  let prisma;
  let negocioId;
  let tokenDueno;
  let tokenVendedor;
  let tokenAjeno;

  function enDias(dias) {
    const d = hoyEnLima();
    d.setUTCDate(d.getUTCDate() + dias);
    return d;
  }

  // Producto con un lote que vence en `dias` (negativo: ya vencido)
  async function lote(dias, cantidad = 10, costo = 2) {
    const producto = await prisma.producto.create({
      data: { negocioId, nombre: `Baja ${Date.now()}-${Math.random()}`, precioVenta: 5 },
    });
    return prisma.lote.create({
      data: {
        negocioId,
        productoId: producto.id,
        numeroLote: `B-${Math.round(Math.random() * 1e6)}`,
        fechaVencimiento: enDias(dias),
        cantidadInicial: cantidad,
        cantidadActual: cantidad,
        costoUnitario: costo,
      },
    });
  }

  const darDeBaja = (cuerpo, token = tokenDueno) =>
    request(servidor).post("/lotes/bajas").set("Authorization", `Bearer ${token}`).send(cuerpo);
  const stock = async (id) => (await prisma.lote.findUniqueOrThrow({ where: { id } })).cantidadActual;

  beforeAll(async () => {
    ({ servidor, prisma, cerrar } = await iniciarApp());

    const marca = Date.now();
    const passwordHash = await bcrypt.hash("Bajas1234", 4);
    negocioId = (await prisma.negocio.create({ data: { nombre: `Bajas ${marca}` } })).id;
    await prisma.usuario.createMany({
      data: [
        { negocioId, nombre: "Dueña", correo: `dueno-${marca}@bajas.test`, passwordHash, rol: "DUENO" },
        { negocioId, nombre: "Vendedor", correo: `vendedor-${marca}@bajas.test`, passwordHash },
      ],
    });
    const otro = (await prisma.negocio.create({ data: { nombre: `Otro ${marca}` } })).id;
    await prisma.usuario.create({
      data: { negocioId: otro, nombre: "Ajeno", correo: `ajeno-${marca}@bajas.test`, passwordHash, rol: "DUENO" },
    });

    const entrar = async (correo) =>
      (await request(servidor).post("/auth/login").send({ correo, password: "Bajas1234" }).expect(200)).body.accessToken;
    tokenDueno = await entrar(`dueno-${marca}@bajas.test`);
    tokenVendedor = await entrar(`vendedor-${marca}@bajas.test`);
    tokenAjeno = await entrar(`ajeno-${marca}@bajas.test`);
  });

  afterAll(async () => {
    await cerrar();
  });

  it("da de baja un lote vencido: queda en 0 y se registra el movimiento con su destino", async () => {
    const vencido = await lote(-5, 12, 2.5);
    const res = await darDeBaja({
      loteIds: [vencido.id],
      destino: "DESTRUCCION",
      observacion: "  Acta N° 012  ",
    }).expect(201);

    expect(res.body).toEqual({ lotes: 1, unidades: 12, valor: "30.00", destino: "DESTRUCCION" });
    expect(await stock(vencido.id)).toBe(0);
    const movimiento = await prisma.movimiento.findFirstOrThrow({ where: { loteId: vencido.id, tipo: "BAJA_VENCIMIENTO" } });
    expect(movimiento).toEqual(expect.objectContaining({ cantidad: -12, destinoBaja: "DESTRUCCION", motivo: "Acta N° 012" }));
  });

  it("no da de baja un lote que todavía no vence, ni deja nada a medias", async () => {
    const vencido = await lote(-3);
    const vigente = await lote(30);
    const res = await darDeBaja({ loteIds: [vencido.id, vigente.id], destino: "DESTRUCCION" }).expect(400);
    expect(res.body.message).toMatch(/todavía no vence/);
    // Todo o nada: el vencido tampoco se dio de baja
    expect(await stock(vencido.id)).toBe(10);
    expect(await stock(vigente.id)).toBe(10);
  });

  it("un lote que vence hoy todavía se puede vender, así que no se da de baja", async () => {
    const hoy = await lote(0);
    await darDeBaja({ loteIds: [hoy.id], destino: "DESTRUCCION" }).expect(400);
  });

  it("un lote ya dado de baja no se vuelve a dar de baja (409)", async () => {
    const vencido = await lote(-1);
    await darDeBaja({ loteIds: [vencido.id], destino: "DEVOLUCION_PROVEEDOR" }).expect(201);
    const res = await darDeBaja({ loteIds: [vencido.id], destino: "DEVOLUCION_PROVEEDOR" }).expect(409);
    expect(res.body.message).toMatch(/ya no tiene stock/);
  });

  it("dos bajas simultáneas del mismo lote: solo una pasa", async () => {
    const vencido = await lote(-2, 8);
    const respuestas = await Promise.all([
      darDeBaja({ loteIds: [vencido.id], destino: "DESTRUCCION" }),
      darDeBaja({ loteIds: [vencido.id], destino: "DESTRUCCION" }),
    ]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    const bajas = await prisma.movimiento.count({ where: { loteId: vencido.id, tipo: "BAJA_VENCIMIENTO" } });
    expect(bajas).toBe(1);
  });

  it("sin loteIds da de baja todos los vencidos con stock y deja los vigentes", async () => {
    const a = await lote(-10);
    const b = await lote(-20);
    const vigente = await lote(15);
    const res = await darDeBaja({ destino: "DESTRUCCION" }).expect(201);
    expect(res.body.lotes).toBeGreaterThanOrEqual(2);
    expect(await stock(a.id)).toBe(0);
    expect(await stock(b.id)).toBe(0);
    expect(await stock(vigente.id)).toBe(10);

    // Ya no queda ninguno vencido: el panel lo refleja y una segunda baja general no tiene qué retirar
    const panel = await request(servidor).get("/panel").set("Authorization", `Bearer ${tokenDueno}`).expect(200);
    expect(panel.body.vencimientos.vencidos.lotes).toBe(0);
    expect(panel.body.dineroVencido).toBe("0.00");
    await darDeBaja({ destino: "DESTRUCCION" }).expect(400);
  });

  it("solo el dueño da de baja, solo de su negocio, y con un destino válido", async () => {
    const vencido = await lote(-4);
    await darDeBaja({ loteIds: [vencido.id], destino: "DESTRUCCION" }, tokenVendedor).expect(403);
    await darDeBaja({ loteIds: [vencido.id], destino: "DESTRUCCION" }, tokenAjeno).expect(404);
    await darDeBaja({ loteIds: [vencido.id], destino: "TIRAR" }).expect(400);
    await darDeBaja({ loteIds: [vencido.id], destino: "DESTRUCCION", negocioId: 1 }).expect(400);
    expect(await stock(vencido.id)).toBe(10);
  });

  it("el reporte de bajas detalla cada lote retirado y la pérdida por destino", async () => {
    const hoy = fechaEnLima(new Date());
    const res = await request(servidor)
      .get(`/reportes/bajas?desde=${hoy}&hasta=${hoy}`)
      .set("Authorization", `Bearer ${tokenDueno}`)
      .expect(200);

    const { resumen, filas } = res.body;
    expect(resumen.lotes).toBe(filas.length);
    expect(filas.length).toBeGreaterThanOrEqual(4);
    // La primera baja de este archivo: 12 unidades a S/ 2.50
    expect(filas[0]).toEqual(
      expect.objectContaining({ cantidad: 12, valor: "30.00", destino: "DESTRUCCION", observacion: "Acta N° 012" }),
    );
    const suma = filas.reduce((s, f) => s + Number(f.valor), 0);
    expect(Number(resumen.valor)).toBeCloseTo(suma, 2);
    expect(Number(resumen.destruccion) + Number(resumen.devolucionProveedor)).toBeCloseTo(suma, 2);

    await request(servidor)
      .get(`/reportes/bajas?desde=${hoy}&hasta=${hoy}`)
      .set("Authorization", `Bearer ${tokenVendedor}`)
      .expect(403);
  });
});
