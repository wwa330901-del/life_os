import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsString, MinLength, ValidateNested } from 'class-validator';

export class HomeWidgetConfigDto {
  @IsString()
  @MinLength(1)
  type: string;

  @IsBoolean()
  visible: boolean;
}

/// The whole widget list, in display order — space cards aren't part of
/// this (they're always shown, always first, not user-configurable).
export class UpdateHomeLayoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HomeWidgetConfigDto)
  widgets: HomeWidgetConfigDto[];
}
