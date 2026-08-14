import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
  ) {
    return this.vendorsService.list(user.id, spaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateVendorDto,
  ) {
    return this.vendorsService.create(user.id, spaceId, dto);
  }

  @Patch(':vendorId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('vendorId') vendorId: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorsService.update(user.id, spaceId, vendorId, dto);
  }

  @Delete(':vendorId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('vendorId') vendorId: string,
  ) {
    return this.vendorsService.remove(user.id, spaceId, vendorId);
  }

  @Get(':vendorId/history')
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('vendorId') vendorId: string,
  ) {
    return this.vendorsService.getHistory(user.id, spaceId, vendorId);
  }
}
