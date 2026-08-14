import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { SpacesModule } from '../spaces/spaces.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { DocumentApprovalsModule } from '../document-approvals/document-approvals.module';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { EngineeringQuotationController } from './engineering-quotation.controller';
import { EngineeringQuotationService } from './engineering-quotation.service';
import { CostControlController } from './cost-control.controller';
import { CostControlService } from './cost-control.service';
import { ProcurementComparisonsController } from './procurement-comparisons.controller';
import { ProcurementComparisonsService } from './procurement-comparisons.service';
import { PaymentRequestPeriodsController } from './payment-request-periods.controller';
import { PaymentRequestPeriodsService } from './payment-request-periods.service';

@Module({
  imports: [
    ProjectsModule,
    SpacesModule,
    KnowledgeModule,
    LineNotifierModule,
    DocumentApprovalsModule,
  ],
  controllers: [
    VendorsController,
    EngineeringQuotationController,
    CostControlController,
    ProcurementComparisonsController,
    PaymentRequestPeriodsController,
  ],
  providers: [
    VendorsService,
    EngineeringQuotationService,
    CostControlService,
    ProcurementComparisonsService,
    PaymentRequestPeriodsService,
  ],
  exports: [CostControlService, EngineeringQuotationService],
})
export class EngineeringFinanceModule {}
