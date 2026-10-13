import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/models/ai_usage.dart';
import '../../../../state/ai_usage_provider.dart';

/// 用量記錄 — this user's own AI usage/cost only (Claude／Gemini 分開), never anyone else's.
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
          if (history.featureUsage != null) ...[
            const SizedBox(height: 16),
            _FeatureUsageSection(usage: history.featureUsage!),
          ],
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
            Text('${summary.count} 次'),
            Text('\$${summary.costUsd.toStringAsFixed(4)}'),
            for (final p in summary.byProvider.where((p) => p.count > 0))
              Text('${p.provider}：${p.count} 次 \$${p.costUsd.toStringAsFixed(4)}', style: const TextStyle(fontSize: 12)),
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

/// 各 AI 功能用了幾次：用最多的排前面，點開看細項；最下面列出沒用過的功能。
class _FeatureUsageSection extends StatelessWidget {
  const _FeatureUsageSection({required this.usage});

  final AiFeatureUsage usage;

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6));
    final used = usage.features.where((f) => f.count > 0).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('功能使用次數（近 ${usage.days} 天）', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Text('看哪些功能根本沒在用，之後可以拿掉、省 AI 費用。', style: muted),
        if (usage.collecting) Text('對話裡的功能從 2026/10/13 才開始記，滿 ${usage.days} 天後比較準。', style: muted),
        const SizedBox(height: 8),
        if (used.isEmpty) const Text('還沒有紀錄'),
        for (final f in used)
          ExpansionTile(
            dense: true,
            tilePadding: EdgeInsets.zero,
            title: Text(f.feature),
            subtitle: f.lastUsedAt == null
                ? null
                : Text('最後一次 ${f.lastUsedAt!.month}/${f.lastUsedAt!.day}', style: muted),
            trailing: Text('${f.count} 次'),
            children: [
              for (final t in f.tools)
                Padding(
                  padding: const EdgeInsets.only(left: 16, bottom: 4),
                  child: Row(
                    children: [
                      Expanded(child: Text(t.label, style: t.count == 0 ? muted : null)),
                      Text('${t.count} 次', style: t.count == 0 ? muted : null),
                    ],
                  ),
                ),
            ],
          ),
        if (usage.unused.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text('近 ${usage.days} 天沒用過', style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 4),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [for (final name in usage.unused) Chip(label: Text(name), visualDensity: VisualDensity.compact)],
          ),
        ],
      ],
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
            // 技術細節只給管理員看（App「管理」→「AI 用量」）。
            ? '失敗（已通知管理員）'
            : '輸入 ${entry.inputTokens} · 輸出 ${entry.outputTokens} tokens · ${(entry.durationMs / 1000).toStringAsFixed(1)}s',
      ),
      trailing: Text(
        '${entry.createdAt.month}/${entry.createdAt.day} ${entry.createdAt.hour.toString().padLeft(2, '0')}:${entry.createdAt.minute.toString().padLeft(2, '0')}',
        style: const TextStyle(fontSize: 11),
      ),
    );
  }
}
