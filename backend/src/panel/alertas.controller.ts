import { Controller, Get } from "@nestjs/common";
import { UsuarioActual } from "../auth/decoradores";
import type { UsuarioToken } from "../auth/decoradores";
import { PanelService } from "./panel.service";

// Sin @Roles: el vendedor también ve el aviso de reposición y vencimientos.
// Solo devuelve conteos (sin costos); el detalle con dinero sigue en /panel, solo para DUENO.
@Controller("alertas")
export class AlertasController {
  constructor(private readonly panel: PanelService) {}

  @Get()
  resumen(@UsuarioActual() usuario: UsuarioToken) {
    return this.panel.resumenAlertas(usuario.negocioId);
  }
}
