import { Module } from '@nestjs/common';
import { FieldChangeLogService } from './field-change-log.service';
import { FieldChangeLogController } from './field-change-log.controller';
import { ProjectsModule } from '../projects/projects.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';

@Module({
  imports: [ProjectsModule, LineNotifierModule],
  controllers: [FieldChangeLogController],
  providers: [FieldChangeLogService],
  exports: [FieldChangeLogService],
})
export class FieldChangeLogModule {}
