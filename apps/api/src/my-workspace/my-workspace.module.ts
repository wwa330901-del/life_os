import { Module } from '@nestjs/common';
import { MyWorkspaceService } from './my-workspace.service';
import { MyWorkspaceController } from './my-workspace.controller';
import { SpacesModule } from '../spaces/spaces.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SpacesModule, PermissionsModule],
  controllers: [MyWorkspaceController],
  providers: [MyWorkspaceService],
})
export class MyWorkspaceModule {}
