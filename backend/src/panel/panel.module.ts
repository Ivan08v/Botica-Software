import { Module } from "@nestjs/common";
import { ProductosModule } from "../productos/productos.module";
import { AlertasController } from "./alertas.controller";
import { PanelController } from "./panel.controller";
import { PanelService } from "./panel.service";

@Module({
  imports: [ProductosModule],
  controllers: [PanelController, AlertasController],
  providers: [PanelService],
})
export class PanelModule {}
