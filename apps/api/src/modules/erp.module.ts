import { Module } from '@nestjs/common';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { ApprovalsController } from './approvals/approvals.controller';
import { ApprovalsService } from './approvals/approvals.service';
import { CrmService } from './clients/crm.service';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { DomainModule } from './domain.module';
import { ExpensesService } from './finance/expenses.service';
import { FinanceOpsController } from './finance/finance-ops.controller';
import { InvoicesService } from './finance/invoices.service';
import { VendorsService } from './finance/vendors.service';
import { HrController } from './hr/hr.controller';
import { HrService } from './hr/hr.service';
import { InventoryController } from './inventory/inventory.controller';
import { InventoryService } from './inventory/inventory.service';
import { ProcurementController } from './procurement/procurement.controller';
import { ProcurementService } from './procurement/procurement.service';
import { ProjectPlanController } from './projects/project-plan.controller';
import { ProjectPlanService } from './projects/project-plan.service';
import { StudiosController } from './studios/studios.controller';
import { StudiosService } from './studios/studios.service';

/**
 * Business operations around the production core (docs/development/erp-expansion-plan.md):
 * administration, approvals, finance, procurement, inventory, people, studios and documents.
 * Subject modules register their approval handlers with ApprovalsService on start-up.
 */
@Module({
  imports: [DomainModule],
  controllers: [
    AdminController,
    ApprovalsController,
    FinanceOpsController,
    ProcurementController,
    InventoryController,
    HrController,
    StudiosController,
    DocumentsController,
    ProjectPlanController,
  ],
  providers: [
    AdminService,
    ApprovalsService,
    VendorsService,
    ExpensesService,
    InvoicesService,
    ProcurementService,
    InventoryService,
    HrService,
    StudiosService,
    DocumentsService,
    ProjectPlanService,
    CrmService,
  ],
  exports: [
    ApprovalsService,
    ExpensesService,
    InvoicesService,
    ProcurementService,
    InventoryService,
    HrService,
    StudiosService,
    DocumentsService,
  ],
})
export class ErpModule {}
