import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  AddQuote,
  CreatePurchaseOrder,
  CreatePurchaseRequest,
  PurchaseRequestListQuery,
  ReceiveOrder,
  type SessionUser,
} from '@nova/shared';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ProcurementService } from './procurement.service';

const PROCUREMENT_READERS = [
  'procurement:request',
  'procurement:approve',
  'procurement:order',
  'finance:read',
] as const;

@Controller()
export class ProcurementController {
  constructor(private readonly procurement: ProcurementService) {}

  @Get('purchase-requests')
  @RequireAnyPermission(...PROCUREMENT_READERS)
  requests(
    @Query(new ZodValidationPipe(PurchaseRequestListQuery)) q: PurchaseRequestListQuery,
    @CurrentUser() user: SessionUser,
  ) {
    return this.procurement.requests(q, user);
  }

  @Get('purchase-requests/:id')
  @RequireAnyPermission(...PROCUREMENT_READERS)
  request(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.procurement.request(id, user);
  }

  @Post('purchase-requests')
  @RequirePermissions('procurement:request')
  createRequest(
    @Body(new ZodValidationPipe(CreatePurchaseRequest)) body: CreatePurchaseRequest,
    @CurrentUser() user: SessionUser,
  ) {
    return this.procurement.createRequest(body, user);
  }

  @Post('purchase-requests/:id/submit')
  @RequirePermissions('procurement:request')
  submit(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.procurement.submitRequest(id, user);
  }

  @Post('purchase-requests/:id/cancel')
  @RequireAnyPermission('procurement:request', 'procurement:order')
  cancel(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.procurement.cancelRequest(id, user);
  }

  @Post('purchase-requests/:id/quotes')
  @RequireAnyPermission('procurement:order', 'procurement:approve', 'vendor:write')
  addQuote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddQuote)) body: AddQuote,
    @CurrentUser() user: SessionUser,
  ) {
    return this.procurement.addQuote(id, body, user);
  }

  @Post('purchase-requests/:id/quotes/:quoteId/select')
  @RequireAnyPermission('procurement:order', 'procurement:approve')
  selectQuote(
    @Param('id') id: string,
    @Param('quoteId') quoteId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.procurement.selectQuote(id, quoteId, user);
  }

  @Get('purchase-orders')
  @RequireAnyPermission(...PROCUREMENT_READERS)
  orders() {
    return this.procurement.orders();
  }

  @Get('purchase-orders/:id')
  @RequireAnyPermission(...PROCUREMENT_READERS)
  order(@Param('id') id: string) {
    return this.procurement.order(id);
  }

  @Post('purchase-orders')
  @RequirePermissions('procurement:order')
  createOrder(
    @Body(new ZodValidationPipe(CreatePurchaseOrder)) body: CreatePurchaseOrder,
    @CurrentUser() user: SessionUser,
  ) {
    return this.procurement.createOrder(body, user);
  }

  @Post('purchase-orders/:id/receive')
  @RequirePermissions('procurement:order')
  receive(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReceiveOrder)) body: ReceiveOrder,
    @CurrentUser() user: SessionUser,
  ) {
    return this.procurement.receive(id, body, user);
  }

  @Post('purchase-orders/:id/cancel')
  @RequirePermissions('procurement:order')
  cancelOrder(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.procurement.cancelOrder(id, user);
  }
}
