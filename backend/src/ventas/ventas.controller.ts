import { Body, Controller, Get, Param, ParseIntPipe, Post } from "@nestjs/common";
import { UsuarioActual } from "../auth/decoradores";
import type { UsuarioToken } from "../auth/decoradores";
import { RegistrarVentaDto } from "./dto/registrar-venta.dto";
import { VentasService } from "./ventas.service";

// Sin @Roles: tanto DUENO como VENDEDOR registran ventas
@Controller("ventas")
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  @Get()
  listar(@UsuarioActual() usuario: UsuarioToken) {
    return this.ventas.listar(usuario.negocioId);
  }

  // Número que llevará la próxima boleta y la próxima factura (solo informativo: el número
  // definitivo se asigna al registrar la venta, por si otra caja cobra antes)
  @Get("proximo-comprobante")
  proximoComprobante(@UsuarioActual() usuario: UsuarioToken) {
    return this.ventas.proximoComprobante(usuario.negocioId);
  }

  @Get(":id")
  obtener(@UsuarioActual() usuario: UsuarioToken, @Param("id", ParseIntPipe) id: number) {
    return this.ventas.obtener(usuario.negocioId, id);
  }

  @Post()
  registrar(@Body() dto: RegistrarVentaDto, @UsuarioActual() usuario: UsuarioToken) {
    return this.ventas.registrar(dto, usuario);
  }
}
