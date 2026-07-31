import { Module } from '@nestjs/common';
import { HomeModule } from '../home/home.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { ProjectDigestService } from './project-digest.service';

@Module({
  imports: [HomeModule, LineNotifierModule],
  providers: [ProjectDigestService],
})
export class ProjectDigestModule {}
