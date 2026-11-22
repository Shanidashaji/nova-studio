import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateExpense,
  CreateInvoice,
  CreateVendor,
  ExpenseListQuery,
  InvoiceListQuery,
  RecordPayment,
  UpdateExpense,
  UpdateInvoice,
  UpdateVendor,
  VoidInvoice,
  type SessionUser,
} from '@nova/shared';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ExpensesService } from './expenses.service';
import { InvoicesService } from './invoices.service';
import { VendorsService } from './vendors.service';

/** Vendors, expenses, invoices and payments (ADR-0010, ADR-0011). */
@Controller()
export class FinanceOpsController {
  constructor(
    private readonly vendors: VendorsService,
    private readonly expenses: ExpensesService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get('finance/overview')
  @RequirePermissions('finance:read')
  overview() {
    return this.invoices.overview();
  }

  // ── Vendors ───────────────────────────────────────────────────────────────

  @Get('vendors')
  @RequireAnyPermission('finance:read', 'vendor:write', 'procurement:request')
  listVendors() {
    return this.vendors.list();
  }

  @Get('vendors/:id')
  @RequireAnyPermission('finance:read', 'vendor:write')
  vendor(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.vendors.get(id, user.permissions.includes('finance:read'));
  }

  @Post('vendors')
  @RequirePermissions('vendor:write')
  createVendor(
    @Body(new ZodValidationPipe(CreateVendor)) body: CreateVendor,
    @CurrentUser() user: SessionUser,
  ) {
    return this.vendors.create(body, user);
  }

  @Patch('vendors/:id')
  @RequirePermissions('vendor:write')
  updateVendor(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateVendor)) body: UpdateVendor,
    @CurrentUser() user: SessionUser,
  ) {
    return this.vendors.update(id, body, user);
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  // Everyone who can submit sees their own; `finance:read` sees all (enforced in the service).

  @Get('expenses')
  @RequireAnyPermission('expense:submit', 'finance:read')
  listExpenses(
    @Query(new ZodValidationPipe(ExpenseListQuery)) q: ExpenseListQuery,
    @CurrentUser() user: SessionUser,
  ) {
    return this.expenses.list(q, user);
  }

  @Get('expenses/:id')
  @RequireAnyPermission('expense:submit', 'finance:read')
  expense(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.expenses.get(id, user);
  }

  @Post('expenses')
  @RequirePermissions('expense:submit')
  createExpense(
    @Body(new ZodValidationPipe(CreateExpense)) body: CreateExpense,
    @CurrentUser() user: SessionUser,
  ) {
    return this.expenses.create(body, user);
  }

  @Patch('expenses/:id')
  @RequirePermissions('expense:submit')
  updateExpense(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateExpense)) body: UpdateExpense,
    @CurrentUser() user: SessionUser,
  ) {
    return this.expenses.update(id, body, user);
  }

  @Post('expenses/:id/submit')
  @RequirePermissions('expense:submit')
  submitExpense(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.expenses.submit(id, user);
  }

  @Post('expenses/:id/withdraw')
  @RequirePermissions('expense:submit')
  withdrawExpense(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.expenses.withdraw(id, user);
  }

  @Delete('expenses/:id')
  @HttpCode(204)
  @RequirePermissions('expense:submit')
  deleteExpense(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.expenses.remove(id, user);
  }

  @Post('expenses/:id/pay')
  @RequirePermissions('finance:write')
  payExpense(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.expenses.pay(id, user);
  }

  // ── Invoices & payments ───────────────────────────────────────────────────

  @Get('invoices')
  @RequirePermissions('finance:read')
  listInvoices(@Query(new ZodValidationPipe(InvoiceListQuery)) q: InvoiceListQuery) {
    return this.invoices.list(q);
  }

  @Get('invoices/:id')
  @RequirePermissions('finance:read')
  invoice(@Param('id') id: string) {
    return this.invoices.get(id);
  }

  @Post('invoices')
  @RequirePermissions('invoice:write')
  createInvoice(
    @Body(new ZodValidationPipe(CreateInvoice)) body: CreateInvoice,
    @CurrentUser() user: SessionUser,
  ) {
    return this.invoices.create(body, user);
  }

  @Patch('invoices/:id')
  @RequirePermissions('invoice:write')
  updateInvoice(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateInvoice)) body: UpdateInvoice,
    @CurrentUser() user: SessionUser,
  ) {
    return this.invoices.update(id, body, user);
  }

  @Post('invoices/:id/send')
  @RequirePermissions('invoice:write')
  sendInvoice(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.invoices.send(id, user);
  }

  @Post('invoices/:id/void')
  @RequirePermissions('invoice:write')
  voidInvoice(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(VoidInvoice)) body: VoidInvoice,
    @CurrentUser() user: SessionUser,
  ) {
    return this.invoices.void(id, body, user);
  }

  @Post('invoices/:id/payments')
  @RequirePermissions('finance:write')
  recordPayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RecordPayment)) body: RecordPayment,
    @CurrentUser() user: SessionUser,
  ) {
    return this.invoices.recordPayment(id, body, user);
  }
}
