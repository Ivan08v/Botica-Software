// Importación de inventario desde Excel (el navegador lee el archivo y envía las filas).
// La prueba crea su propio negocio para que los conteos sean exactos.
import bcrypt from "bcryptjs";
import request from "supertest";
import { iniciarApp } from "./app-de-prueba.js";

describe("Importación desde Excel (e2e)", () => {
  let servidor;
  let cerrar;
  let prisma;
  let negocioId;
  let tokenDueno;
  let tokenVendedor;

  const filas = [
    {
      nombre: "Amoxicilina 500 mg",
      presentacion: "Caja x 100",
      codigoBarras: "7790000000011",
      precioVenta: 0.5,
      stockMinimo: 100,
      numeroLote: "AMX-1",
      fechaVencimiento: "2099-03-31",
      cantidad: 200,
      costoUnitario: 0.3,
    },
    {
      nombre: "Amoxicilina 500 mg",
      presentacion: "Caja x 100",
      codigoBarras: "7790000000011",
      precioVenta: 0.5,
      stockMinimo: 100,
      numeroLote: "AMX-2",
      fechaVencimiento: "2099-09-30",
      cantidad: 150,
      costoUnitario: 0.31,
    },
    {
      nombre: "Gasa estéril",
      precioVenta: "0,80",
      numeroLote: "G-1",
      fechaVencimiento: "2099-01-31",
      cantidad: "50",
      costoUnitario: "0.45",
    },
    {
      nombre: "",
      precioVenta: 3,
      numeroLote: "X-1",
      fechaVencimiento: "2099-01-31",
      cantidad: 5,
      costoUnitario: 1,
    },
    {
      nombre: "Jarabe sin precio",
      numeroLote: "J-1",
      fechaVencimiento: "31/31/2099",
      cantidad: 5,
      costoUnitario: 1,
    },
  ];

  const contar = async () => ({
    productos: await prisma.producto.count({ where: { negocioId } }),
    lotes: await prisma.lote.count({ where: { negocioId } }),
    movimientos: await prisma.movimiento.count({ where: { negocioId } }),
  });

  const enviar = (ruta, token, cuerpo) =>
    request(servidor).post(`/importacion/${ruta}`).set("Authorization", `Bearer ${token}`).send(cuerpo);

  beforeAll(async () => {
    ({ servidor, prisma, cerrar } = await iniciarApp());

    const marca = Date.now();
    const passwordHash = await bcrypt.hash("Importa1234", 4);
    negocioId = (await prisma.negocio.create({ data: { nombre: `Importación ${marca}` } })).id;
    await prisma.usuario.createMany({
      data: [
        { negocioId, nombre: "Dueña", correo: `dueno-${marca}@importa.test`, passwordHash, rol: "DUENO" },
        { negocioId, nombre: "Vendedor", correo: `vendedor-${marca}@importa.test`, passwordHash },
      ],
    });
    const entrar = async (correo) =>
      (await request(servidor).post("/auth/login").send({ correo, password: "Importa1234" })).body
        .accessToken;
    tokenDueno = await entrar(`dueno-${marca}@importa.test`);
    tokenVendedor = await entrar(`vendedor-${marca}@importa.test`);
  });

  afterAll(async () => {
    await cerrar();
  });

  it("la vista previa informa fila por fila y no guarda nada", async () => {
    const res = await enviar("vista-previa", tokenDueno, { filas }).expect(200);

    expect(res.body.resumen).toEqual({
      total: 5,
      correctas: 3,
      omitidas: 0,
      conError: 2,
      productosNuevos: 2,
      lotesNuevos: 3,
      unidades: 400,
    });
    expect(res.body.filas.map((f) => [f.fila, f.estado])).toEqual([
      [2, "OK"],
      [3, "OK"],
      [4, "OK"],
      [5, "ERROR"],
      [6, "ERROR"],
    ]);
    expect(res.body.filas[3].errores).toEqual(["Falta el nombre del producto"]);
    expect(res.body.filas[4].errores).toEqual([
      "Falta el precio de venta",
      'La fecha de vencimiento "31/31/2099" no es válida (usa día/mes/año)',
    ]);
    expect(await contar()).toEqual({ productos: 0, lotes: 0, movimientos: 0 });
  });

  it("confirmar guarda las filas válidas con sus movimientos y omite las que tienen error", async () => {
    const res = await enviar("confirmar", tokenDueno, { filas }).expect(201);

    expect(res.body).toEqual({
      importado: { productos: 2, lotes: 3, unidades: 400 },
      omitidas: 0,
      conError: 2,
    });
    expect(await contar()).toEqual({ productos: 2, lotes: 3, movimientos: 3 });

    const amoxicilina = await prisma.producto.findFirstOrThrow({
      where: { negocioId, codigoBarras: "7790000000011" },
      include: { lotes: { orderBy: { numeroLote: "asc" } } },
    });
    expect(amoxicilina.lotes.map((l) => [l.numeroLote, l.cantidadActual])).toEqual([
      ["AMX-1", 200],
      ["AMX-2", 150],
    ]);
    const gasa = await prisma.producto.findFirstOrThrow({ where: { negocioId, nombre: "Gasa estéril" } });
    expect(gasa.precioVenta.toString()).toBe("0.8");
    const movimiento = await prisma.movimiento.findFirstOrThrow({ where: { negocioId } });
    expect(movimiento).toMatchObject({ tipo: "INGRESO", motivo: "Importación desde Excel" });
  });

  it("volver a importar el mismo archivo no duplica nada", async () => {
    const previa = await enviar("vista-previa", tokenDueno, { filas }).expect(200);
    expect(previa.body.resumen).toMatchObject({ correctas: 0, omitidas: 3, conError: 2 });

    await enviar("confirmar", tokenDueno, { filas }).expect(400);
    expect(await contar()).toEqual({ productos: 2, lotes: 3, movimientos: 3 });
  });

  it("un lote nuevo de un producto que ya existe se agrega a ese producto", async () => {
    const nueva = [
      {
        nombre: "amoxicilina 500 MG",
        presentacion: "caja x 100",
        numeroLote: "AMX-3",
        fechaVencimiento: "2099-12-31",
        cantidad: 10,
        costoUnitario: 0.3,
      },
    ];
    const res = await enviar("confirmar", tokenDueno, { filas: nueva }).expect(201);

    expect(res.body.importado).toEqual({ productos: 0, lotes: 1, unidades: 10 });
    expect(await contar()).toEqual({ productos: 2, lotes: 4, movimientos: 4 });
  });

  it("lo importado queda disponible para vender", async () => {
    const producto = await prisma.producto.findFirstOrThrow({ where: { negocioId, nombre: "Gasa estéril" } });
    await request(servidor)
      .post("/ventas")
      .set("Authorization", `Bearer ${tokenVendedor}`)
      .send({ items: [{ productoId: producto.id, cantidad: 5 }] })
      .expect(201);
  });

  it("el vendedor no puede importar (403)", async () => {
    await enviar("vista-previa", tokenVendedor, { filas }).expect(403);
    await enviar("confirmar", tokenVendedor, { filas }).expect(403);
  });

  it("rechaza un archivo vacío o demasiado grande (400)", async () => {
    await enviar("vista-previa", tokenDueno, { filas: [] }).expect(400);
    const muchas = Array.from({ length: 2001 }, (_, i) => ({ nombre: `P${i}` }));
    await enviar("vista-previa", tokenDueno, { filas: muchas }).expect(400);
  });
});
