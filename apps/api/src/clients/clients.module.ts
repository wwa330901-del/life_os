import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { SpacesModule } from '../spaces/spaces.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SpacesModule, PermissionsModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
