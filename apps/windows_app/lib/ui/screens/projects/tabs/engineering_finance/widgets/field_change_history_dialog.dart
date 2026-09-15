import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../../core/models/field_change_log.dart';
import '../../../../../../state/auth_provider.dart';

/// 異動留痕歷史紀錄（2026-09，顧問文件「數值變更留痕與回報」）——目前只有
/// 報價單項目（單價/成本單價/數量）跟採發比價表（決標金額）兩種來源會有
/// 資料，其他工程財務表格結構上沒有可編輯的既有金額欄位（見後端
/// schema.prisma 的 FieldChangeLog 說明）。
class FieldChangeHistoryDialog extends ConsumerWidget {
  const FieldChangeHistoryDialog({
    super.key,
    required this.projectId,
    required this.entityType,
    required this.entityId,
    required this.title,
  });

  final String projectId;
  final FieldChangeEntityType entityType;
  final String entityId;
  final String title;

  static Future<void> show(
    BuildContext context, {
    required String projectId,
    required FieldChangeEntityType entityType,
    required String entityId,
    required String title,
  }) {
    return showDialog(
      context: context,
      builder: (_) => FieldChangeHistoryDialog(
        projectId: projectId,
        entityType: entityType,
        entityId: entityId,
        title: title,
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(
      _fieldChangeLogProvider((projectId: projectId, entityType: entityType, entityId: entityId)),
    );

    return AlertDialog(
      title: Text('「$title」異動歷史紀錄'),
      content: SizedBox(
        width: 420,
        height: 400,
        child: historyAsync.when(
          data: (entries) => entries.isEmpty
              ? const Center(child: Text('還沒有任何修改紀錄'))
              : ListView.separated(
                  itemCount: entries.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final entry = entries[index];
                    return ListTile(
                      dense: true,
                      title: Text('${entry.fieldLabel}：${entry.oldValue ?? '（空）'} → ${entry.newValue ?? '（空）'}'),
                      subtitle: Text('${entry.changedByName} · ${_formatDateTime(entry.changedAt)}'),
                    );
                  },
                ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('讀取歷史紀錄失敗：$error')),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
      ],
    );
  }
}

typedef _FieldChangeLogQuery = ({String projectId, FieldChangeEntityType entityType, String entityId});

final _fieldChangeLogProvider =
    FutureProvider.autoDispose.family<List<FieldChangeLogEntry>, _FieldChangeLogQuery>((ref, query) {
      return ref
          .read(apiClientProvider)
          .listFieldChangeLog(
            projectId: query.projectId,
            entityType: query.entityType,
            entityId: query.entityId,
          );
    });

String _formatDateTime(DateTime dt) {
  final local = dt.toLocal();
  return '${local.year}/${local.month}/${local.day} '
      '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}
