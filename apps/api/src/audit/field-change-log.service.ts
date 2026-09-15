import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { FieldChangeEntityType } from '../../generated/prisma/client.js';

export interface FieldChange {
  field: string;
  label: string;
  oldValue: number | string | null;
  newValue: number | string | null;
}

/**
 * 異動留痕機制（2026-09，見 schema.prisma 的 FieldChangeLog 說明）。只有
 * `EngineeringQuotationService.updateItem`／`ProcurementComparisonsService.
 * selectVendor` 這兩個真的存在「改掉既有數值」動作的呼叫點會用到——其他
 * 工程財務表格結構上沒有可編輯的既有金額欄位，見 schema 註解。
 */
@Injectable()
export class FieldChangeLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  /** No-op if every given change has old === new (nothing actually
   * changed) — callers pass every candidate field unconditionally rather
   * than pre-filtering themselves. Fires one LINE push per call (not per
   * field) if this space has a designated 總經理 and at least one field
   * actually changed. */
  async record(params: {
    spaceId: string;
    entityType: FieldChangeEntityType;
    entityId: string;
    entityLabel: string; // 給通知訊息用，例如報價單項目的名稱
    changes: FieldChange[];
    changedByUserId: string;
  }): Promise<void> {
    const realChanges = params.changes.filter(
      (c) => `${c.oldValue}` !== `${c.newValue}`,
    );
    if (realChanges.length === 0) return;

    await this.prisma.fieldChangeLog.createMany({
      data: realChanges.map((c) => ({
        spaceId: params.spaceId,
        entityType: params.entityType,
        entityId: params.entityId,
        fieldName: c.field,
        fieldLabel: c.label,
        oldValue: c.oldValue === null ? null : `${c.oldValue}`,
        newValue: c.newValue === null ? null : `${c.newValue}`,
        changedByUserId: params.changedByUserId,
      })),
    });

    await this.notifyGeneralManager(
      params.spaceId,
      params.entityLabel,
      realChanges,
    );
  }

  async list(
    spaceId: string,
    entityType: FieldChangeEntityType,
    entityId: string,
  ) {
    return this.prisma.fieldChangeLog.findMany({
      where: { spaceId, entityType, entityId },
      include: { changedByUser: { select: { name: true } } },
      orderBy: { changedAt: 'desc' },
    });
  }

  private async notifyGeneralManager(
    spaceId: string,
    entityLabel: string,
    changes: FieldChange[],
  ): Promise<void> {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });
    if (!space?.generalManagerUserId) return;

    const lines = changes.map(
      (c) =>
        `${c.label}：${c.oldValue ?? '（空）'} → ${c.newValue ?? '（空）'}`,
    );
    await this.lineNotifier.notifyByUser(
      space.generalManagerUserId,
      `「${entityLabel}」的數值被修改：\n${lines.join('\n')}`,
    );
  }
}
