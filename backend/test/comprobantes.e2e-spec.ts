// Comprobante de cada venta (boleta o factura con serie y número), medio de pago y vuelto.
// Crea su propio negocio: así la numeración empieza en 1 y no la mueven las otras pruebas.
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import bcrypt from "bcryptjs";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { hoyEnLima } from "../src/common/fechas";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Comprobantes y medios de pago (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let negocioId: number;
  let clienteDni: number;
  let clienteRuc: number;

  // Producto con un lote vigente, a un precio dado
  async function producto(precio: number, cantidad = 100) {
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

  const vender = (cuerpo: object) =>
    request(app.getHttpServer()).post("/ventas").set("Authorization", `Bearer ${token}`).send(cuerpo);

  const stock = async (productoId: number) =>
    (await prisma.lote.findFirstOrThrow({ where: { productoId } })).cantidadActual;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    // listen para que las ventas simultáneas compartan un servidor ya abierto
    await app.listen(0);
    prisma = app.get(PrismaService);

    const [{ base }] = await prisma.$queryRaw<{ base: string }[]>`SELECT current_database() AS base`;
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

    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ correo: `caja-${marca}@comprobantes.test`, password: "Caja1234" })
      .expect(200);
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("por defecto es una boleta B001 en efectivo, numerada en orden", async () => {
    const productoId = await producto(3);
    const primera = await vender({ items: [{ productoId, cantidad: 1 }] }).expect(201);
    const segunda = await vender({ items: [{ productoId, cantidad: 1 }] }).expect(201);

    expect(primera.body).toEqual(
      expect.objectContaining({ tipoComprobante: "BOLETA", serie: "B001", medioPago: "EFECTIVO", vuelto: null }),
    );
    expect(segunda.body.numero).toBe(primera.body.numero + 1);
    expect(segunda.body.comprobante).toBe(`B001-${String(segunda.body.numero).padStart(8, "0")}`);
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
      medioPago: "TRANSFERENCIA",
      items: [{ productoId, cantidad: 2 }],
    }).expect(201);
    expect(factura.body).toEqual(
      expect.objectContaining({ serie: "F001", numero: 1, comprobante: "F001-00000001", medioPago: "TRANSFERENCIA" }),
    );
    expect(factura.body.cliente).toEqual(expect.objectContaining({ tipoDocumento: "RUC", documento: "20512345678" }));
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

  it("el monto recibido solo va con efectivo, y el medio de pago debe ser uno conocido", async () => {
    const productoId = await producto(2);
    await vender({ medioPago: "YAPE", montoRecibido: 10, items: [{ productoId, cantidad: 1 }] }).expect(400);
    await vender({ medioPago: "BITCOIN", items: [{ productoId, cantidad: 1 }] }).expect(400);
    const yape = await vender({ medioPago: "YAPE", items: [{ productoId, cantidad: 1 }] }).expect(201);
    expect(yape.body.medioPago).toBe("YAPE");
  });

  it("diez ventas a la vez reciben diez números distintos y seguidos", async () => {
    const productoId = await producto(1);
    const antes = await prisma.venta.aggregate({ where: { negocioId, serie: "B001" }, _max: { numero: true } });
    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () => vender({ items: [{ productoId, cantidad: 1 }] })),
    );
    const numeros = respuestas.map((r) => r.body.numero as number).sort((a, b) => a - b);
    const desde = (antes._max.numero ?? 0) + 1;
    expect(numeros).toEqual(Array.from({ length: 10 }, (_, i) => desde + i));
  });
});
