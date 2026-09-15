import { IsOptional, IsString } from 'class-validator';

/// `userId: null` clears the assignment (no GM designated, FieldChangeLog
/// notifications silently skip).
export class SetGeneralManagerDto {
  @IsOptional()
  @IsString()
  userId?: string | null;
}
