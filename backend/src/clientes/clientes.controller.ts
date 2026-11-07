import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { UsuarioActual } from "../auth/decoradores";
import type { UsuarioToken } from "../auth/decoradores";
import { ClientesService } from "./clientes.service";
import { ActualizarClienteDto, CrearClienteDto } from "./dto/cliente.dto";

// Sin @Roles: el vendedor registra y consulta clientes desde la caja
@Controller("clientes")
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  listar(@UsuarioActual() usuario: UsuarioToken, @Query("buscar") buscar?: string) {
    return this.clientes.listar(usuario.negocioId, buscar);
  }

  @Get("documento/:documento")
  obtenerPorDocumento(@UsuarioActual() usuario: UsuarioToken, @Param("documento") documento: string) {
    return this.clientes.obtenerPorDocumento(usuario.negocioId, documento);
  }

  @Get(":id")
  obtener(@UsuarioActual() usuario: UsuarioToken, @Param("id", ParseIntPipe) id: number) {
    return this.clientes.obtener(usuario.negocioId, id);
  }

  @Post()
  crear(@UsuarioActual() usuario: UsuarioToken, @Body() dto: CrearClienteDto) {
    return this.clientes.crear(usuario.negocioId, dto);
  }

  @Patch(":id")
  actualizar(
    @UsuarioActual() usuario: UsuarioToken,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ActualizarClienteDto,
  ) {
    return this.clientes.actualizar(usuario.negocioId, id, dto);
  }

  // Responde 204 sin cuerpo. Un cliente con compras no se elimina (409).
  @Delete(":id")
  @HttpCode(204)
  eliminar(@UsuarioActual() usuario: UsuarioToken, @Param("id", ParseIntPipe) id: number) {
    return this.clientes.eliminar(usuario.negocioId, id);
  }
}
