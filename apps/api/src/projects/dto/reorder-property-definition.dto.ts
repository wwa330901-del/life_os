import { IsBoolean, IsString } from 'class-validator';

/** Reorders a property definition relative to a sibling — same shape as
 * ReorderWorkItemDto, just without the parentId grouping (property
 * definitions are a flat list per space, not hierarchical). */
export class ReorderPropertyDefinitionDto {
  @IsString()
  targetId: string;

  @IsBoolean()
  insertAfter: boolean;
}
