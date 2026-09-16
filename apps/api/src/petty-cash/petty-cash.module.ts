import { Module } from '@nestjs/common';
import { PettyCashService } from './petty-cash.service';
import { PettyCashController } from './petty-cash.controller';
import { SpacesModule } from '../spaces/spaces.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SpacesModule, PermissionsModule],
  controllers: [PettyCashController],
  providers: [PettyCashService],
  exports: [PettyCashService],
})
export class PettyCashModule {}
