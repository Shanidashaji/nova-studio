import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  CreateStockItem,
  LogMaintenance,
  StockMovementRequest,
  UpdateAssetDetails,
  UpdateStockItem,
  type SessionUser,
} from '@nova/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { InventoryService } from './inventory.service';

@Controller()
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('stock')
  @RequirePermissions('workspace:read')
  items() {
    return this.inventory.items();
  }

  @Get('stock/:id')
  @RequirePermissions('workspace:read')
  item(@Param('id') id: string) {
    return this.inventory.item(id);
  }

  @Post('stock')
  @RequirePermissions('inventory:write')
  create(
    @Body(new ZodValidationPipe(CreateStockItem)) body: CreateStockItem,
    @CurrentUser() user: SessionUser,
  ) {
    return this.inventory.create(body, user);
  }

  @Patch('stock/:id')
  @RequirePermissions('inventory:write')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStockItem)) body: UpdateStockItem,
    @CurrentUser() user: SessionUser,
  ) {
    return this.inventory.update(id, body, user);
  }

  @Post('stock/:id/movements')
  @RequirePermissions('inventory:write')
  move(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(StockMovementRequest)) body: StockMovementRequest,
    @CurrentUser() user: SessionUser,
  ) {
    return this.inventory.move(id, body, user);
  }

  @Get('assets/:id')
  @RequirePermissions('workspace:read')
  asset(@Param('id') id: string) {
    return this.inventory.asset(id);
  }

  @Patch('assets/:id/details')
  @RequirePermissions('asset:write')
  updateAsset(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAssetDetails)) body: UpdateAssetDetails,
    @CurrentUser() user: SessionUser,
  ) {
    return this.inventory.updateAsset(id, body, user);
  }

  @Post('assets/:id/maintenance')
  @RequirePermissions('asset:write')
  maintenance(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(LogMaintenance)) body: LogMaintenance,
    @CurrentUser() user: SessionUser,
  ) {
    return this.inventory.logMaintenance(id, body, user);
  }

  @Post('assets/:id/maintenance/:maintenanceId/complete')
  @RequirePermissions('asset:write')
  complete(
    @Param('id') id: string,
    @Param('maintenanceId') maintenanceId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.inventory.completeMaintenance(id, maintenanceId, user);
  }
}
