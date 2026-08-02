import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/models/ai_usage.dart';
import '../../../../state/ai_usage_provider.dart';

/// 用量記錄 — this user's own Gemini usage/cost only, never anyone else's.
class AiUsageTab extends ConsumerWidget {
  const AiUsageTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(aiUsageHistoryProvider);

    return historyAsync.when(
      data: (history) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(child: _SummaryCard(label: '今日', summary: history.today)),
              const SizedBox(width: 12),
              Expanded(child: _SummaryCard(label: '本週', summary: history.thisWeek)),
              const SizedBox(width: 12),
              Expanded(child: _SummaryCard(label: '本月', summary: history.thisMonth)),
            ],
          ),
          const SizedBox(height: 16),
          Text('最近紀錄', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (history.recentEntries.isEmpty) const Text('目前還沒有任何分析紀錄'),
          for (final entry in history.recentEntries) _UsageLogRow(entry: entry),
        ],
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取失敗：$error')),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.label, required this.summary});

  final String label;
  final AiUsagePeriodSummary summary;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            Text('${summary.count} 次分析'),
            Text('\$${summary.costUsd.toStringAsFixed(4)}'),
            Text(
              '輸入 ${summary.inputTokens} · 輸出 ${summary.outputTokens} tokens',
              style: const TextStyle(fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _UsageLogRow extends StatelessWidget {
  const _UsageLogRow({required this.entry});

  final AiUsageLogEntry entry;

  @override
  Widget build(BuildContext context) {
    final isFailed = entry.status == AiUsageStatus.failed;
    return ListTile(
      dense: true,
      leading: Icon(
        isFailed ? Icons.error_outline : Icons.check_circle_outline,
        size: 18,
        color: isFailed ? Theme.of(context).colorScheme.error : Colors.green,
      ),
      title: Text('${entry.model} · \$${entry.costUsd.toStringAsFixed(5)}'),
      subtitle: Text(
        isFailed
            ? (entry.errorMessage ?? '分析失敗')
            : '輸入 ${entry.inputTokens} · 輸出 ${entry.outputTokens} tokens · ${(entry.durationMs / 1000).toStringAsFixed(1)}s',
      ),
      trailing: Text(
        '${entry.createdAt.month}/${entry.createdAt.day} ${entry.createdAt.hour.toString().padLeft(2, '0')}:${entry.createdAt.minute.toString().padLeft(2, '0')}',
        style: const TextStyle(fontSize: 11),
      ),
    );
  }
}
