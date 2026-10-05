import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserLocationService } from './user-location.service';
import { LineRichMenuService } from './line-rich-menu.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserLocationService, LineRichMenuService],
  // 位置：App 開啟時回報、LINE 傳位置、萬用 AI 問天氣用。
  // LINE 圖文選單跟著外觀風格換。
  exports: [UsersService, UserLocationService, LineRichMenuService],
})
export class UsersModule {}
