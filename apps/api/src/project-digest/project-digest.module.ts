import { Module } from '@nestjs/common';
import { HomeModule } from '../home/home.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { ProjectDigestService } from './project-digest.service';
import { TodoDigestService } from './todo-digest.service';

@Module({
  imports: [HomeModule, LineNotifierModule],
  providers: [ProjectDigestService, TodoDigestService],
})
export class ProjectDigestModule {}
