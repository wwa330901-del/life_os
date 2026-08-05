import { IsEnum } from 'class-validator';
import { CalendarShareDetailLevel } from '../../../generated/prisma/client.js';

export class UpdateCalendarShareDetailLevelDto {
  @IsEnum(CalendarShareDetailLevel)
  detailLevel: CalendarShareDetailLevel;
}
