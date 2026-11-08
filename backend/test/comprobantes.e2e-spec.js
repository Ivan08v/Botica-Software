// Comprobante de cada venta (boleta o factura con serie y número), medio de pago y vuelto.
// Crea su propio negocio: así la numeración empieza en 1 y no la mueven las otras pruebas.
import bcrypt from "bcryptjs";
import request from "supertest";
import { iniciarApp } from "./app-de-prueba.js";
import { hoyEnLima } from "../src/common/fechas.js";

describe("Comprobantes y medios de pago (e2e)", () => {
  let servidor;
  let cerrar;
  let prisma;
  let token;
  let negocioId;
  let clienteDni;
  let clienteRuc;

  // Producto con un lote vigente, a un precio dado
  async function producto(precio, cantidad = 100) {
    const vence = hoyEnLima();
    vence.setUTCDate(vence.getUTCDate() + 200);
    const p = await prisma.producto.create({
      data: { negocioId, nombre: `Comprobante ${Date.now()}-${Math.random()}`, precioVenta: precio },
    });
    await prisma.lote.create({
      data: {
        negocioId,
        productoId: p.id,
        numeroLote: "CP-1",
        fechaVencimiento: vence,
        cantidadInicial: cantidad,
        cantidadActual: cantidad,
        costoUnitario: 1,
      },
    });
    return p.id;
  }

  const vender = (cuerpo) =>
    request(servidor).post("/ventas").set("Authorization", `Bearer ${token}`).send(cuerpo);

  const stock = async (productoId) =>
    (await prisma.lote.findFirstOrThrow({ where: { productoId } })).cantidadActual;

  beforeAll(async () => {
    ({ servidor, prisma, cerrar } = await iniciarApp());
    // listen para que las ventas simultáneas compartan un servidor ya abierto

    const [{ base }] = await prisma.$queryRaw`SELECT current_database() AS base`;
    expect(base).toMatch(/_test$/);

    const marca = Date.now();
    negocioId = (await prisma.negocio.create({ data: { nombre: `Comprobantes ${marca}` } })).id;
    await prisma.usuario.create({
      data: {
        negocioId,
        nombre: "Cajera",
        correo: `caja-${marca}@comprobantes.test`,
        passwordHash: await bcrypt.hash("Caja1234", 4),
      },
    });
    clienteDni = (
      await prisma.cliente.create({ data: { negocioId, documento: "41234567", nombre: "Cliente con DNI" } })
    ).id;
    clienteRuc = (
      await prisma.cliente.create({
        data: { negocioId, tipoDocumento: "RUC", documento: "20512345678", nombre: "Empresa S.A.C." },
      })
    ).id;

    const res = await request(servidor)
      .post("/auth/login")
      .send({ correo: `caja-${marca}@comprobantes.test`, password: "Caja1234" })
      .expect(200);
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await cerrar();
  });

  it("por defecto es una boleta B001 en efectivo, numerada en orden", async () => {
    const productoId = await producto(3);
    const primera = await vender({ items: [{ productoId, cantidad: 1 }] }).expect(201);
    const segunda = await vender({ items: [{ productoId, cantidad: 1 }] }).expect(201);

    expect(primera.body).toEqual(
      expect.objectContaining({
        tipoComprobante: "BOLETA",
        serie: "B001",
        medioPago: "EFECTIVO",
        vuelto: null,
      }),
    );
    expect(segunda.body.numero).toBe(primera.body.numero + 1);
    expect(segunda.body.comprobante).toBe(`B001-${String(segunda.body.numero).padStart(8, "0")}`);
  });

  it("separa el IGV incluido en el precio, línea por línea, y las partes suman el total", async () => {
    const jarabe = await producto(4.5);
    const tableta = await producto(0.3);
    const venta = await vender({
      items: [
        { productoId: jarabe, cantidad: 2 },
        { productoId: tableta, cantidad: 1 },
      ],
    }).expect(201);
    // 9.00 -> 7.63 y 0.30 -> 0.25 sin IGV: op. gravada 7.88, IGV 1.42, total 9.30
    expect(venta.body).toEqual(expect.objectContaining({ total: "9.3", opGravada: "7.88", igv: "1.42" }));

    const guardada = await prisma.venta.findUniqueOrThrow({ where: { id: venta.body.id } });
    expect(guardada.opGravada.plus(guardada.igv).equals(guardada.total)).toBe(true);
  });

  it("la factura exige un cliente con RUC y tiene su propia serie F001", async () => {
    const productoId = await producto(10, 10);
    await vender({ tipoComprobante: "FACTURA", items: [{ productoId, cantidad: 1 }] }).expect(400);
    const conDni = await vender({
      tipoComprobante: "FACTURA",
      clienteId: clienteDni,
      items: [{ productoId, cantidad: 1 }],
    }).expect(400);
    expect(conDni.body.message).toMatch(/RUC/);
    expect(await stock(productoId)).toBe(10);

    const factura = await vender({
      tipoComprobante: "FACTURA",
      clienteId: clienteRuc,
      medioPago: "TARJETA",
      items: [{ productoId, cantidad: 2 }],
    }).expect(201);
    expect(factura.body).toEqual(
      expect.objectContaining({
        serie: "F001",
        numero: 1,
        comprobante: "F001-00000001",
        medioPago: "TARJETA",
      }),
    );
    expect(factura.body.cliente).toEqual(
      expect.objectContaining({ tipoDocumento: "RUC", documento: "20512345678" }),
    );
  });

  it("una boleta de más de S/ 700 necesita identificar al cliente", async () => {
    const productoId = await producto(100, 20);
    const anonima = await vender({ items: [{ productoId, cantidad: 8 }] }).expect(400);
    expect(anonima.body.message).toMatch(/700/);
    expect(await stock(productoId)).toBe(20);

    await vender({ clienteId: clienteDni, items: [{ productoId, cantidad: 8 }] }).expect(201);
    // Justo S/ 700 todavía puede ser anónima
    await vender({ items: [{ productoId, cantidad: 7 }] }).expect(201);
  });

  it("en efectivo calcula el vuelto y rechaza un monto que no cubre el total", async () => {
    const productoId = await producto(4.5, 10);
    const venta = await vender({ montoRecibido: 20, items: [{ productoId, cantidad: 3 }] }).expect(201);
    expect(venta.body.montoRecibido).toBe("20");
    expect(venta.body.vuelto).toBe("6.50");

    const corto = await vender({ montoRecibido: 5, items: [{ productoId, cantidad: 3 }] }).expect(400);
    expect(corto.body.message).toMatch(/no cubre/);
    expect(await stock(productoId)).toBe(7);
  });

  it("el monto recibido solo va con efectivo, y el medio de pago debe ser uno de la botica", async () => {
    const productoId = await producto(2);
    await vender({ medioPago: "YAPE", montoRecibido: 10, items: [{ productoId, cantidad: 1 }] }).expect(400);
    await vender({ medioPago: "BITCOIN", items: [{ productoId, cantidad: 1 }] }).expect(400);
    // Una botica no cobra por transferencia: el valor existe solo por ventas antiguas
    await vender({ medioPago: "TRANSFERENCIA", items: [{ productoId, cantidad: 1 }] }).expect(400);
    const yape = await vender({ medioPago: "YAPE", items: [{ productoId, cantidad: 1 }] }).expect(201);
    expect(yape.body.medioPago).toBe("YAPE");
  });

  it("diez ventas a la vez reciben diez números distintos y seguidos", async () => {
    const productoId = await producto(1);
    const antes = await prisma.venta.aggregate({
      where: { negocioId, serie: "B001" },
      _max: { numero: true },
    });
    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () => vender({ items: [{ productoId, cantidad: 1 }] })),
    );
    const numeros = respuestas.map((r) => r.body.numero).sort((a, b) => a - b);
    const desde = (antes._max.numero ?? 0) + 1;
    expect(numeros).toEqual(Array.from({ length: 10 }, (_, i) => desde + i));
  });

  const pedir = (ruta) => request(servidor).get(ruta).set("Authorization", `Bearer ${token}`);

  it("informa el número que llevará la próxima boleta y la próxima factura", async () => {
    const res = await pedir("/ventas/proximo-comprobante").expect(200);
    const ultimas = await prisma.venta.groupBy({
      by: ["serie"],
      where: { negocioId },
      _max: { numero: true },
    });
    const siguiente = (serie) => {
      const ultimo = ultimas.find((u) => u.serie === serie)?._max.numero ?? 0;
      return `${serie}-${String(ultimo + 1).padStart(8, "0")}`;
    };
    expect(res.body).toEqual({ BOLETA: siguiente("B001"), FACTURA: siguiente("F001") });
  });

  it("los productos frecuentes son los más vendidos, con stock y con el lote que sale primero", async () => {
    const res = await pedir("/productos/frecuentes").expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.length).toBeLessThanOrEqual(6);
    // Ordenados de más a menos vendido en los últimos 30 días
    const vendidos = await prisma.detalleVenta.groupBy({
      by: ["productoId"],
      where: { productoId: { in: res.body.map((p) => p.id) } },
      _sum: { cantidad: true },
    });
    const cantidad = (id) => vendidos.find((v) => v.productoId === id)?._sum.cantidad ?? 0;
    const cantidades = res.body.map((p) => cantidad(p.id));
    expect(cantidades).toEqual([...cantidades].sort((a, b) => b - a));
    for (const p of res.body) {
      expect(p.stock).toBeGreaterThan(0);
      expect(p.proximoLote).toEqual(expect.objectContaining({ numeroLote: "CP-1" }));
    }
  });
});
