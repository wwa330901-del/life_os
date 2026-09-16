import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PettyCashService } from './petty-cash.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreatePettyCashTransactionDto } from './dto/create-petty-cash-transaction.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/petty-cash')
export class PettyCashController {
  constructor(private readonly pettyCashService: PettyCashService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
  ) {
    return this.pettyCashService.list(user.id, spaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreatePettyCashTransactionDto,
  ) {
    return this.pettyCashService.create(user.id, spaceId, dto);
  }

  @Delete(':transactionId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('transactionId') transactionId: string,
  ) {
    return this.pettyCashService.remove(user.id, spaceId, transactionId);
  }
}
