// Panel de vencimientos, stock bajo y dinero en riesgo.
// La prueba crea su propio negocio con lotes conocidos, así los números esperados son exactos.
import bcrypt from "bcryptjs";
import request from "supertest";
import { iniciarApp } from "./app-de-prueba.js";
import { hoyEnLima } from "../src/common/fechas.js";

describe("Panel (e2e)", () => {
  let servidor;
  let cerrar;
  let prisma;
  let tokenDueno;
  let tokenVendedor;

  function enDias(dias) {
    const d = hoyEnLima();
    d.setUTCDate(d.getUTCDate() + dias);
    return d;
  }

  async function entrar(correo) {
    const res = await request(servidor)
      .post("/auth/login")
      .send({ correo, password: "Panel1234" })
      .expect(200);
    return res.body.accessToken;
  }

  beforeAll(async () => {
    ({ servidor, prisma, cerrar } = await iniciarApp());

    const marca = Date.now();
    const passwordHash = await bcrypt.hash("Panel1234", 4);
    const negocio = await prisma.negocio.create({ data: { nombre: `Panel ${marca}` } });
    const negocioId = negocio.id;
    await prisma.usuario.createMany({
      data: [
        { negocioId, nombre: "Dueña", correo: `dueno-${marca}@panel.test`, passwordHash, rol: "DUENO" },
        { negocioId, nombre: "Vendedor", correo: `vendedor-${marca}@panel.test`, passwordHash },
      ],
    });

    // Producto A: lotes repartidos en todos los tramos, costo S/ 2.00 por unidad
    const a = await prisma.producto.create({
      data: { negocioId, nombre: "Producto A", precioVenta: 5, stockMinimo: 0 },
    });
    const lotesA = [
      [-5, 10], // vencido: S/ 20
      [0, 1], // vence hoy -> tramo de 30 días: S/ 2
      [10, 5], // 30 días: S/ 10
      [45, 4], // 60 días: S/ 8
      [75, 3], // 90 días: S/ 6
      [200, 100], // lejano: no aparece
      [5, 0], // sin stock: no aparece
    ];
    await prisma.lote.createMany({
      data: lotesA.map(([dias, cantidad], i) => ({
        negocioId,
        productoId: a.id,
        numeroLote: `A-${i + 1}`,
        fechaVencimiento: enDias(dias),
        cantidadInicial: cantidad || 10,
        cantidadActual: cantidad,
        costoUnitario: 2,
      })),
    });

    // Producto B: 10 unidades vigentes + 500 vencidas, con mínimo de 50 -> stock bajo
    const b = await prisma.producto.create({
      data: { negocioId, nombre: "Producto B", precioVenta: 5, stockMinimo: 50 },
    });
    await prisma.lote.createMany({
      data: [
        {
          negocioId,
          productoId: b.id,
          numeroLote: "B-1",
          fechaVencimiento: enDias(300),
          cantidadInicial: 10,
          cantidadActual: 10,
          costoUnitario: 1,
        },
        {
          negocioId,
          productoId: b.id,
          numeroLote: "B-2",
          fechaVencimiento: enDias(-30),
          cantidadInicial: 500,
          cantidadActual: 500,
          costoUnitario: 0.5,
        },
      ],
    });

    tokenDueno = await entrar(`dueno-${marca}@panel.test`);
    tokenVendedor = await entrar(`vendedor-${marca}@panel.test`);
  });

  afterAll(async () => {
    await cerrar();
  });

  it("agrupa los vencimientos en vencidos, 30, 60 y 90 días", async () => {
    const res = await request(servidor)
      .get("/panel")
      .set("Authorization", `Bearer ${tokenDueno}`)
      .expect(200);

    expect(res.body.vencimientos).toEqual({
      vencidos: { lotes: 2, unidades: 510, valor: "270.00" }, // 10 x 2 + 500 x 0.50
      en30Dias: { lotes: 2, unidades: 6, valor: "12.00" },
      en60Dias: { lotes: 1, unidades: 4, valor: "8.00" },
      en90Dias: { lotes: 1, unidades: 3, valor: "6.00" },
    });
  });

  it("el dinero en riesgo suma solo lo que vence en los próximos 90 días", async () => {
    const res = await request(servidor)
      .get("/panel")
      .set("Authorization", `Bearer ${tokenDueno}`)
      .expect(200);

    expect(res.body.dineroEnRiesgo).toBe("26.00"); // 12 + 8 + 6
    expect(res.body.dineroVencido).toBe("270.00");
  });

  it("lista los lotes por vencer ordenados, sin los lejanos ni los vacíos", async () => {
    const res = await request(servidor)
      .get("/panel")
      .set("Authorization", `Bearer ${tokenDueno}`)
      .expect(200);

    expect(res.body.lotesPorVencer.map((l) => [l.numeroLote, l.diasRestantes, l.tramo])).toEqual([
      ["B-2", -30, "VENCIDO"],
      ["A-1", -5, "VENCIDO"],
      ["A-2", 0, "DIAS_30"],
      ["A-3", 10, "DIAS_30"],
      ["A-4", 45, "DIAS_60"],
      ["A-5", 75, "DIAS_90"],
    ]);
  });

  it("stock bajo: el stock vencido no cuenta", async () => {
    const res = await request(servidor)
      .get("/panel")
      .set("Authorization", `Bearer ${tokenDueno}`)
      .expect(200);

    expect(res.body.productosStockBajo).toEqual([
      expect.objectContaining({ producto: "Producto B", stock: 10, stockMinimo: 50, faltante: 40 }),
    ]);
  });

  it("el vendedor no puede ver el panel (403)", async () => {
    await request(servidor).get("/panel").set("Authorization", `Bearer ${tokenVendedor}`).expect(403);
  });
});
