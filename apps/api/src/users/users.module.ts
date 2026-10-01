import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserLocationService } from './user-location.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserLocationService],
  // 位置：App 開啟時回報、LINE 傳位置、萬用 AI 問天氣用。
  exports: [UsersService, UserLocationService],
})
export class UsersModule {}
