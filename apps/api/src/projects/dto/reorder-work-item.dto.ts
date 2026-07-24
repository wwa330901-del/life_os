import { IsBoolean, IsString } from 'class-validator';

/** Reorders a work item relative to a sibling — same parentId only. */
export class ReorderWorkItemDto {
  @IsString()
  targetId: string;

  @IsBoolean()
  insertAfter: boolean;
}
