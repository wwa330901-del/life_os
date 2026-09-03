import { Module } from '@nestjs/common';
import { SpacesModule } from '../spaces/spaces.module';
import { PermissionsService } from './permissions.service';
import { DepartmentsController } from './departments.controller';
import { PermissionRulesController } from './permission-rules.controller';

@Module({
  imports: [SpacesModule],
  controllers: [DepartmentsController, PermissionRulesController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
