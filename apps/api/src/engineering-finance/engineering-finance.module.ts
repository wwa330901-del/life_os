import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { SpacesModule } from '../spaces/spaces.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { QuotationItemsController } from './quotation-items.controller';
import { QuotationItemsService } from './quotation-items.service';
import { ProcurementComparisonsController } from './procurement-comparisons.controller';
import { ProcurementComparisonsService } from './procurement-comparisons.service';
import { CostControlController } from './cost-control.controller';
import { CostControlService } from './cost-control.service';
import { PaymentRequestsController } from './payment-requests.controller';
import { PaymentRequestStagesController } from './payment-request-stages.controller';
import { PaymentRequestsService } from './payment-requests.service';

@Module({
  imports: [ProjectsModule, SpacesModule, KnowledgeModule, LineNotifierModule],
  controllers: [
    QuotationItemsController,
    ProcurementComparisonsController,
    CostControlController,
    PaymentRequestsController,
    PaymentRequestStagesController,
  ],
  providers: [
    QuotationItemsService,
    ProcurementComparisonsService,
    CostControlService,
    PaymentRequestsService,
  ],
  exports: [CostControlService],
})
export class EngineeringFinanceModule {}
