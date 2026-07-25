import { IsDefined, IsString } from 'class-validator';

/**
 * One value for one of the space's own property definitions. `value` is
 * loosely typed on purpose — TEXT/DATE send a string, NUMBER sends a
 * number, SELECT sends a string (the chosen option's id) — the service
 * dispatches based on the definition's own stored `type`, not this DTO's
 * shape. `@IsDefined()` (rather than a type-specific decorator) is still
 * required: the global ValidationPipe's `whitelist: true` strips any
 * property with zero validator decorators, even inside a `@ValidateNested`
 * child, so an undecorated `value` field would silently vanish before it
 * ever reached the service.
 */
export class PropertyValueInputDto {
  @IsString()
  definitionId: string;

  @IsDefined()
  value: string | number;
}
