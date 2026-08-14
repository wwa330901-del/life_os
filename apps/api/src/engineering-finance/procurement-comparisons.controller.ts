import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProcurementComparisonsService } from './procurement-comparisons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateProcurementComparisonDto } from './dto/create-procurement-comparison.dto';
import { UpdateProcurementComparisonDto } from './dto/update-procurement-comparison.dto';
import { CreateVendorQuoteDto } from './dto/create-vendor-quote.dto';
import { UpdateVendorQuoteDto } from './dto/update-vendor-quote.dto';
import { SelectVendorQuoteDto } from './dto/select-vendor-quote.dto';
import { SubmitFixedRoleApprovalDto } from './dto/submit-fixed-role-approval.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/procurement-comparisons')
export class ProcurementComparisonsController {
  constructor(
    private readonly comparisonsService: ProcurementComparisonsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.comparisonsService.list(user.id, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProcurementComparisonDto,
  ) {
    return this.comparisonsService.create(user.id, projectId, dto);
  }

  @Patch(':comparisonId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('comparisonId') comparisonId: string,
    @Body() dto: UpdateProcurementComparisonDto,
  ) {
    return this.comparisonsService.update(
      user.id,
      projectId,
      comparisonId,
      dto,
    );
  }

  @Delete(':comparisonId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('comparisonId') comparisonId: string,
  ) {
    return this.comparisonsService.remove(user.id, projectId, comparisonId);
  }

  @Post(':comparisonId/vendor-quotes')
  addVendorQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('comparisonId') comparisonId: string,
    @Body() dto: CreateVendorQuoteDto,
  ) {
    return this.comparisonsService.addVendorQuote(
      user.id,
      projectId,
      comparisonId,
      dto,
    );
  }

  @Patch(':comparisonId/vendor-quotes/:vendorQuoteId')
  updateVendorQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('comparisonId') comparisonId: string,
    @Param('vendorQuoteId') vendorQuoteId: string,
    @Body() dto: UpdateVendorQuoteDto,
  ) {
    return this.comparisonsService.updateVendorQuote(
      user.id,
      projectId,
      comparisonId,
      vendorQuoteId,
      dto,
    );
  }

  @Delete(':comparisonId/vendor-quotes/:vendorQuoteId')
  removeVendorQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('comparisonId') comparisonId: string,
    @Param('vendorQuoteId') vendorQuoteId: string,
  ) {
    return this.comparisonsService.removeVendorQuote(
      user.id,
      projectId,
      comparisonId,
      vendorQuoteId,
    );
  }

  @Post(':comparisonId/vendor-quotes/:vendorQuoteId/attachment')
  @UseInterceptors(FileInterceptor('file'))
  uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('comparisonId') comparisonId: string,
    @Param('vendorQuoteId') vendorQuoteId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.comparisonsService.uploadAttachment(
      user.id,
      projectId,
      comparisonId,
      vendorQuoteId,
      file,
    );
  }

  @Post(':comparisonId/select')
  selectVendor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('comparisonId') comparisonId: string,
    @Body() dto: SelectVendorQuoteDto,
  ) {
    return this.comparisonsService.selectVendor(
      user.id,
      projectId,
      comparisonId,
      dto,
    );
  }

  @Post(':comparisonId/submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('comparisonId') comparisonId: string,
    @Body() dto: SubmitFixedRoleApprovalDto,
  ) {
    return this.comparisonsService.submit(
      user.id,
      projectId,
      comparisonId,
      dto,
    );
  }

  @Get(':comparisonId/approvals')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('comparisonId') comparisonId: string,
  ) {
    return this.comparisonsService.history(user.id, projectId, comparisonId);
  }
}
