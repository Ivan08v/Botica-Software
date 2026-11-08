// Aislamiento entre negocios: la botica y la veterinaria comparten la base,
// pero ninguna puede ver ni modificar los datos de la otra.
// Lo ajeno responde 404 (y no 403) para no revelar siquiera que existe.
import request from "supertest";
import { iniciarApp } from "./app-de-prueba.js";

describe("Aislamiento entre negocios (e2e)", () => {
  let servidor;
  let cerrar;
  let prisma;
  let botica;
  let veterinaria;
  // Un producto de la botica con stock vendible, y uno de sus lotes
  let productoBotica;
  let loteBoticaId;

  async function entrar(correo) {
    const res = await request(servidor)
      .post("/auth/login")
      .send({ correo, password: "Demo1234" })
      .expect(200);
    return { token: res.body.accessToken, negocioId: res.body.negocio.id };
  }

  function como(sesion) {
    const peticion = request(servidor);
    const auth = { Authorization: `Bearer ${sesion.token}` };
    return {
      get: (ruta) => peticion.get(ruta).set(auth),
      post: (ruta, cuerpo) => peticion.post(ruta).set(auth).send(cuerpo),
      patch: (ruta, cuerpo) => peticion.patch(ruta).set(auth).send(cuerpo),
      delete: (ruta) => peticion.delete(ruta).set(auth),
    };
  }

  beforeAll(async () => {
    ({ servidor, prisma, cerrar } = await iniciarApp());

    botica = await entrar("dueno@demo.pe");
    veterinaria = await entrar("veterinaria@demo.pe");

    const lista = (await como(botica).get("/productos?buscar=Omeprazol").expect(200)).body;
    productoBotica = lista[0];
    const lotes = (await como(botica).get(`/lotes?productoId=${productoBotica.id}`)).body;
    loteBoticaId = lotes[0].id;
  });

  afterAll(async () => {
    await cerrar();
  });

  it("el login indica a qué negocio pertenece cada usuario", async () => {
    const res = await request(servidor)
      .post("/auth/login")
      .send({ correo: "veterinaria@demo.pe", password: "Demo1234" });
    expect(res.body.negocio).toEqual(
      expect.objectContaining({ nombre: "Veterinaria Demo", tipo: "VETERINARIA" }),
    );
    expect(botica.negocioId).not.toBe(veterinaria.negocioId);
  });

  it("cada negocio lista solo sus propios productos", async () => {
    const deBotica = (await como(botica).get("/productos").expect(200)).body;
    const deVeterinaria = (await como(veterinaria).get("/productos").expect(200)).body;

    // No se compara la cantidad exacta de la botica: otras pruebas crean productos en ella
    expect(deBotica.length).toBeGreaterThanOrEqual(50);
    expect(deVeterinaria).toHaveLength(8);
    expect(deBotica.every((p) => p.negocioId === botica.negocioId)).toBe(true);
    expect(deVeterinaria.every((p) => p.negocioId === veterinaria.negocioId)).toBe(true);
    const idsBotica = new Set(deBotica.map((p) => p.id));
    expect(deVeterinaria.some((p) => idsBotica.has(p.id))).toBe(false);
  });

  it("buscar no encuentra productos de otro negocio", async () => {
    const res = await como(veterinaria).get("/productos?buscar=Omeprazol").expect(200);
    expect(res.body).toEqual([]);
  });

  it("un producto ajeno responde 404 al verlo, editarlo o desactivarlo", async () => {
    await como(veterinaria).get(`/productos/${productoBotica.id}`).expect(404);
    await como(veterinaria).patch(`/productos/${productoBotica.id}`, { precioVenta: 999 }).expect(404);
    await como(veterinaria).delete(`/productos/${productoBotica.id}`).expect(404);

    const intacto = await prisma.producto.findUniqueOrThrow({ where: { id: productoBotica.id } });
    expect(intacto.precioVenta.toString()).not.toBe("999");
    expect(intacto.activo).toBe(true);
  });

  it("el lector de códigos no encuentra productos de otro negocio", async () => {
    await como(veterinaria).get(`/productos/codigo/${productoBotica.codigoBarras}`).expect(404);
    await como(botica).get(`/productos/codigo/${productoBotica.codigoBarras}`).expect(200);
  });

  it("el mismo código de barras puede existir en los dos negocios", async () => {
    const enBotica = (await como(botica).get("/productos?buscar=Alcohol medicinal").expect(200)).body[0];
    const enVeterinaria = (await como(veterinaria).get("/productos?buscar=Alcohol medicinal").expect(200))
      .body[0];

    expect(enBotica.codigoBarras).toBe(enVeterinaria.codigoBarras);
    expect(enBotica.id).not.toBe(enVeterinaria.id);
    // Y cada uno escanea el suyo
    const escaneado = await como(veterinaria).get(`/productos/codigo/${enBotica.codigoBarras}`).expect(200);
    expect(escaneado.body.id).toBe(enVeterinaria.id);
  });

  it("dentro del mismo negocio el código de barras sigue siendo único (409)", async () => {
    await como(botica)
      .post("/productos", { nombre: "Duplicado", precioVenta: 1, codigoBarras: productoBotica.codigoBarras })
      .expect(409);
  });

  it("no se pueden ver los lotes de otro negocio", async () => {
    const res = await como(veterinaria).get(`/lotes?productoId=${productoBotica.id}`).expect(200);
    expect(res.body).toEqual([]);

    const todos = (await como(veterinaria).get("/lotes").expect(200)).body;
    expect(todos.some((l) => l.id === loteBoticaId)).toBe(false);
  });

  it("no se puede ingresar mercadería a un producto de otro negocio (404)", async () => {
    await como(veterinaria)
      .post("/lotes", {
        productoId: productoBotica.id,
        numeroLote: "INTRUSO-1",
        fechaVencimiento: "2099-01-01",
        cantidad: 10,
        costoUnitario: 1,
      })
      .expect(404);
    expect(await prisma.lote.count({ where: { numeroLote: "INTRUSO-1" } })).toBe(0);
  });

  it("no se puede vender un producto de otro negocio (404) y su stock no cambia", async () => {
    const antes = await prisma.lote.aggregate({
      where: { productoId: productoBotica.id },
      _sum: { cantidadActual: true },
    });

    await como(veterinaria)
      .post("/ventas", { items: [{ productoId: productoBotica.id, cantidad: 1 }] })
      .expect(404);

    const despues = await prisma.lote.aggregate({
      where: { productoId: productoBotica.id },
      _sum: { cantidadActual: true },
    });
    expect(despues._sum.cantidadActual).toBe(antes._sum.cantidadActual);
  });

  it("las ventas de un negocio no aparecen ni se pueden abrir desde otro", async () => {
    const venta = (
      await como(botica)
        .post("/ventas", { items: [{ productoId: productoBotica.id, cantidad: 1 }] })
        .expect(201)
    ).body;

    await como(veterinaria).get(`/ventas/${venta.id}`).expect(404);
    const lista = (await como(veterinaria).get("/ventas").expect(200)).body;
    expect(lista.some((v) => v.id === venta.id)).toBe(false);

    await como(botica).get(`/ventas/${venta.id}`).expect(200);
  });

  it("el cliente no puede elegir el negocio enviándolo en el cuerpo (400)", async () => {
    await como(veterinaria)
      .post("/productos", { nombre: "Colado", precioVenta: 1, negocioId: botica.negocioId })
      .expect(400);
  });
});
