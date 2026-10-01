import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/ai_usage.dart';
import '../../../state/admin_provider.dart';

String _usd(double v) => '\$${v.toStringAsFixed(v < 1 ? 3 : 2)}';

/// 管理員：所有使用者的 AI 用量（2026-10-02）。數字是依 token 估的，實際以
/// Google 帳單為準。
class AdminAiUsageScreen extends ConsumerWidget {
  const AdminAiUsageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminAiUsageProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI 用量'),
        actions: [
          IconButton(
            tooltip: '重新整理',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(adminAiUsageProvider),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('讀取失敗：$e')),
        data: (u) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Expanded(child: _StatTile(label: '今天', stat: u.today)),
                const SizedBox(width: 12),
                Expanded(child: _StatTile(label: '近 7 天', stat: u.thisWeek)),
                const SizedBox(width: 12),
                Expanded(child: _StatTile(label: '本月', stat: u.thisMonth)),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '金額是依 token 數估的，實際以 Google 帳單為準。每晚 9 點如果失敗太多或花費暴增，LINE 會通知你（只有你收到）。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            _Section(title: '近 14 天每日花費', child: _DailyBars(days: u.daily)),
            _Section(
              title: '本月各功能',
              child: u.features.isEmpty ? const Text('本月還沒有用量') : _RowsTable(rows: u.features),
            ),
            _Section(
              title: '本月各使用者',
              child: u.users.isEmpty ? const Text('本月還沒有用量') : _RowsTable(rows: u.users),
            ),
            _Section(
              title: '最近的失敗',
              child: u.recentFailures.isEmpty
                  ? const Text('沒有失敗紀錄 🎉')
                  : Column(
                      children: [
                        for (final f in u.recentFailures)
                          ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(Icons.error_outline, color: Theme.of(context).colorScheme.error, size: 18),
                            title: Text('${f.user}・${f.feature}'),
                            subtitle: Text(f.error ?? '（沒有訊息）', maxLines: 2, overflow: TextOverflow.ellipsis),
                            trailing: Text(
                              '${f.at.month}/${f.at.day} ${f.at.hour.toString().padLeft(2, '0')}:${f.at.minute.toString().padLeft(2, '0')}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.stat});

  final String label;
  final AdminAiUsageStat stat;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: theme.textTheme.labelLarge),
            const SizedBox(height: 6),
            Text(_usd(stat.costUsd), style: theme.textTheme.headlineSmall),
            const SizedBox(height: 2),
            Text('${stat.count} 次', style: theme.textTheme.bodySmall),
            if (stat.failures > 0)
              Row(
                children: [
                  Icon(Icons.error_outline, size: 14, color: theme.colorScheme.error),
                  const SizedBox(width: 4),
                  Text('失敗 ${stat.failures} 次', style: theme.textTheme.bodySmall),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

/// 單一數列（每日花費）：不需要圖例，標題就是名稱；細長條、上緣 4px 圓角、
/// 條與條之間留空隙；滑過每一條顯示日期、次數、金額、失敗數。
class _DailyBars extends StatelessWidget {
  const _DailyBars({required this.days});

  final List<AdminAiUsageRow> days;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final max = days.fold<double>(0, (m, d) => d.stat.costUsd > m ? d.stat.costUsd : m);
    const chartHeight = 120.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('最高一天 ${_usd(max)}', style: theme.textTheme.bodySmall),
        const SizedBox(height: 8),
        SizedBox(
          height: chartHeight,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final d in days)
                Expanded(
                  child: Tooltip(
                    message:
                        '${d.label.substring(5).replaceAll('-', '/')}\n${d.stat.count} 次・${_usd(d.stat.costUsd)}${d.stat.failures > 0 ? '\n失敗 ${d.stat.failures} 次' : ''}',
                    child: Container(
                      // 整欄都是滑鼠感應範圍，比條本身大。
                      color: Colors.transparent,
                      height: chartHeight,
                      alignment: Alignment.bottomCenter,
                      padding: const EdgeInsets.symmetric(horizontal: 3),
                      child: Container(
                        height: max == 0 ? 0 : (d.stat.costUsd / max * (chartHeight - 4)).clamp(d.stat.count > 0 ? 2.0 : 0.0, chartHeight),
                        decoration: BoxDecoration(
                          color: scheme.primary,
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Divider(height: 1, color: scheme.outlineVariant),
        const SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(days.isEmpty ? '' : days.first.label.substring(5).replaceAll('-', '/'), style: theme.textTheme.bodySmall),
            Text('今天', style: theme.textTheme.bodySmall),
          ],
        ),
      ],
    );
  }
}

class _RowsTable extends StatelessWidget {
  const _RowsTable({required this.rows});

  final List<AdminAiUsageRow> rows;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).textTheme.bodySmall;
    return Table(
      columnWidths: const {0: FlexColumnWidth(3), 1: FlexColumnWidth(1), 2: FlexColumnWidth(1.4), 3: FlexColumnWidth(1)},
      children: [
        TableRow(
          children: [
            Text('名稱', style: muted),
            Text('次數', style: muted, textAlign: TextAlign.right),
            Text('花費', style: muted, textAlign: TextAlign.right),
            Text('失敗', style: muted, textAlign: TextAlign.right),
          ],
        ),
        for (final r in rows)
          TableRow(
            children: [
              Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(r.label)),
              Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text('${r.stat.count}', textAlign: TextAlign.right)),
              Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(_usd(r.stat.costUsd), textAlign: TextAlign.right)),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(r.stat.failures > 0 ? '${r.stat.failures}' : '—', textAlign: TextAlign.right),
              ),
            ],
          ),
      ],
    );
  }
}
