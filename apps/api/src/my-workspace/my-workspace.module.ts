import { Module } from '@nestjs/common';
import { MyWorkspaceService } from './my-workspace.service';
import { MyWorkspaceController } from './my-workspace.controller';
import { SpacesModule } from '../spaces/spaces.module';

@Module({
  imports: [SpacesModule],
  controllers: [MyWorkspaceController],
  providers: [MyWorkspaceService],
})
export class MyWorkspaceModule {}
