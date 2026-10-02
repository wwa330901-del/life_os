import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/retirement.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../widgets/finance_format.dart';

/// 「1,234 萬」／「8,500」：退休的金額動輒上千萬，用萬比較好讀。
String _wan(num v) => v.abs() >= 10000 ? '${formatAmount(v / 10000)} 萬' : formatAmount(v);

/// 退休試算（2026-10-02）：淨資產、每月結餘、花費自動從記帳抓，
/// 可以調退休年齡、退休金、報酬率；LINE 傳「退休試算」或直接問 AI 也行。
class FinanceRetirementTab extends ConsumerWidget {
  const FinanceRetirementTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(retirementProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('讀取失敗：$e')),
      data: (r) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (r.needsAge)
            _AskCard(
              title: '你現在幾歲？',
              hint: '例如 32（在「算命」頁存生日的話會自動算）',
              onSubmit: (v) => _save(context, ref, {'age': v}),
            )
          else if (r.needsExpense)
            _AskCard(
              title: '退休後每月大概要花多少？',
              hint: '還沒有記帳資料，先估一個數字，例如 30000',
              onSubmit: (v) => _save(context, ref, {'monthlyExpense': v}),
            )
          else if (r.projection != null) ...[
            _SummaryCard(report: r, projection: r.projection!),
            const SizedBox(height: 12),
            _ChartCard(projection: r.projection!, lifeExpectancy: r.settings.lifeExpectancy),
          ],
          const SizedBox(height: 12),
          _SettingsCard(report: r, onSave: (patch) => _save(context, ref, patch)),
          const SizedBox(height: 8),
          Text(
            '金額都用今天的幣值算（報酬率已經扣掉通膨）。報酬率是假設，不保證；淨資產包含股票。'
            '在 LINE 也可以問 AI「我幾歲可以退休」「如果每月多存 5000 呢」。',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  static Future<void> _save(BuildContext context, WidgetRef ref, Map<String, num?> patch) async {
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(apiClientProvider).updateRetirementSettings(patch);
      container.invalidate(retirementProvider);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _AskCard extends StatefulWidget {
  const _AskCard({required this.title, required this.hint, required this.onSubmit});

  final String title;
  final String hint;
  final void Function(double value) onSubmit;

  @override
  State<_AskCard> createState() => _AskCardState();
}

class _AskCardState extends State<_AskCard> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final v = double.tryParse(_controller.text.trim());
    if (v != null && v > 0) widget.onSubmit(v);
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(hintText: widget.hint),
                    onSubmitted: (_) => _submit(),
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton(onPressed: _submit, child: const Text('開始試算')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.report, required this.projection});

  final RetirementReport report;
  final RetirementProjection projection;

  @override
  Widget build(BuildContext context) {
    final p = projection;
    final theme = Theme.of(context);
    final retire = p.retireAge.round();
    final good = p.onTrack;
    final color = good ? Colors.green.shade700 : theme.colorScheme.error;
    final better = p.scenarios.where((s) => s.earliestAge != null && (p.earliestAge == null || s.earliestAge! < p.earliestAge!));
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(good ? Icons.check_circle : Icons.warning_amber_rounded, color: color),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    good
                        ? (p.gap < 0 ? '$retire 歲退休：夠了，還多 ${_wan(-p.gap)}' : '$retire 歲退休：剛好夠')
                        : '$retire 歲退休：還差 ${_wan(p.gap)}',
                    style: theme.textTheme.titleLarge?.copyWith(color: color),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 24,
              runSpacing: 12,
              children: [
                _Stat(label: '$retire 歲時會有', value: _wan(p.assetsAtRetire)),
                _Stat(label: '需要', value: _wan(p.needAtRetire)),
                _Stat(label: '最早可以退休', value: p.earliestAge == null ? '存不夠' : '${p.earliestAge} 歲'),
                if (!good) _Stat(label: '想準時退休，每月要存', value: formatAmount(p.requiredMonthlySaving)),
                if (!good && p.depletionAge != null) _Stat(label: '錢大概用完', value: '${p.depletionAge} 歲'),
              ],
            ),
            if (better.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text('每月多存一點', style: theme.textTheme.labelLarge),
              const SizedBox(height: 4),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final s in better) Chip(label: Text('多存 ${formatAmount(s.extraMonthly)} → ${s.earliestAge} 歲')),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: theme.textTheme.bodySmall),
        Text(value, style: theme.textTheme.titleMedium),
      ],
    );
  }
}

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.projection, required this.lifeExpectancy});

  final RetirementProjection projection;
  final double lifeExpectancy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final series = projection.series;
    final maxY = series.map((s) => s.assets).fold<double>(0, math.max);
    final minY = math.min(0.0, series.map((s) => s.assets).fold<double>(0, math.min));
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 16, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 8, bottom: 12),
              child: Text('資產變化（每年）', style: Theme.of(context).textTheme.titleMedium),
            ),
            SizedBox(
              height: 220,
              child: LineChart(
                LineChartData(
                  minY: minY,
                  maxY: maxY <= 0 ? 1 : maxY * 1.05,
                  gridData: const FlGridData(show: false),
                  borderData: FlBorderData(show: false),
                  extraLinesData: ExtraLinesData(
                    horizontalLines: [HorizontalLine(y: 0, color: scheme.outlineVariant, strokeWidth: 1)],
                    verticalLines: [
                      VerticalLine(
                        x: projection.retireAge,
                        color: scheme.tertiary,
                        strokeWidth: 1,
                        dashArray: [4, 4],
                        label: VerticalLineLabel(
                          show: true,
                          alignment: Alignment.topRight,
                          labelResolver: (_) => '退休',
                          style: TextStyle(color: scheme.tertiary, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 64,
                        getTitlesWidget: (v, meta) => v == meta.max || v == meta.min && v != 0
                            ? const SizedBox.shrink()
                            : Text(_wan(v), style: const TextStyle(fontSize: 11)),
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        interval: 10,
                        getTitlesWidget: (v, meta) => Text('${v.round()} 歲', style: const TextStyle(fontSize: 11)),
                      ),
                    ),
                  ),
                  lineTouchData: LineTouchData(
                    touchTooltipData: LineTouchTooltipData(
                      getTooltipItems: (spots) => [
                        for (final s in spots) LineTooltipItem('${s.x.round()} 歲\n${_wan(s.y)}', const TextStyle(color: Colors.white)),
                      ],
                    ),
                  ),
                  lineBarsData: [
                    LineChartBarData(
                      spots: [for (final s in series) FlSpot(s.age.toDouble(), s.assets)],
                      color: scheme.primary,
                      barWidth: 2,
                      dotData: const FlDotData(show: false),
                      belowBarData: BarAreaData(show: true, color: scheme.primary.withValues(alpha: 0.12)),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.report, required this.onSave});

  final RetirementReport report;
  final void Function(Map<String, num?> patch) onSave;

  @override
  Widget build(BuildContext context) {
    final s = report.settings;
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text('試算條件', style: theme.textTheme.titleMedium),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Row(
                children: [
                  SizedBox(width: 120, child: Text('想幾歲退休：${s.retireAge.round()}')),
                  Expanded(
                    child: _RetireAgeSlider(initial: s.retireAge, onChanged: (v) => onSave({'retireAge': v})),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  const SizedBox(width: 120, child: Text('年報酬率')),
                  Expanded(
                    child: SegmentedButton<double>(
                      showSelectedIcon: false,
                      segments: const [
                        ButtonSegment(value: 2, label: Text('2% 定存')),
                        ButtonSegment(value: 4, label: Text('4% 保守')),
                        ButtonSegment(value: 5, label: Text('5%')),
                        ButtonSegment(value: 6, label: Text('6% 股債')),
                        ButtonSegment(value: 8, label: Text('8% 積極')),
                      ],
                      selected: {s.returnRate},
                      emptySelectionAllowed: true,
                      onSelectionChanged: (v) {
                        if (v.isNotEmpty) onSave({'returnRate': v.first});
                      },
                    ),
                  ),
                ],
              ),
            ),
            _NumberRow(
              label: '預計活到幾歲',
              value: s.lifeExpectancy,
              suffix: '歲',
              hint: '錢要夠用到這個年紀；退休年齡調超過會自動往後推',
              onSave: (v) => onSave({'lifeExpectancy': v ?? 90}),
            ),
            const Divider(height: 1),
            _NumberRow(
              label: '退休後每月花',
              value: s.monthlyExpense,
              autoValue: report.autoMonthlyExpense,
              autoLabel: '近 6 個月平均支出',
              onSave: (v) => onSave({'monthlyExpense': v}),
            ),
            _NumberRow(
              label: '每月存',
              value: s.monthlySaving,
              autoValue: report.autoMonthlySaving,
              autoLabel: '近 6 個月平均結餘',
              onSave: (v) => onSave({'monthlySaving': v}),
            ),
            _NumberRow(
              label: '退休金每月',
              value: s.pensionMonthly,
              hint: '勞保年金＋勞退月領，可到勞保局網站試算',
              onSave: (v) => onSave({'pensionMonthly': v ?? 0}),
            ),
            _NumberRow(
              label: '退休金幾歲開始領',
              value: s.pensionStartAge,
              suffix: '歲',
              onSave: (v) => onSave({'pensionStartAge': v ?? 65}),
            ),
            _NumberRow(
              label: '通膨',
              value: s.inflation,
              suffix: '%',
              onSave: (v) => onSave({'inflation': v ?? 2}),
            ),
            if (report.autoAge == null || s.age != null)
              _NumberRow(label: '現在幾歲', value: s.age, suffix: '歲', onSave: (v) => onSave({'age': v})),
            ListTile(
              dense: true,
              title: const Text('淨資產（自動）'),
              trailing: Text(_wan(report.autoAssets)),
            ),
          ],
        ),
      ),
    );
  }
}

/// 拖動時只更新畫面上的數字，放開才存（不然每動一格就打一次 API）。
class _RetireAgeSlider extends StatefulWidget {
  const _RetireAgeSlider({required this.initial, required this.onChanged});

  final double initial;
  final void Function(double value) onChanged;

  @override
  State<_RetireAgeSlider> createState() => _RetireAgeSliderState();
}

class _RetireAgeSliderState extends State<_RetireAgeSlider> {
  late double _value = widget.initial.clamp(40, 75);

  @override
  void didUpdateWidget(covariant _RetireAgeSlider oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initial != widget.initial) _value = widget.initial.clamp(40, 75);
  }

  @override
  Widget build(BuildContext context) {
    return Slider(
      min: 40,
      max: 75,
      divisions: 35,
      value: _value,
      label: '${_value.round()} 歲',
      onChanged: (v) => setState(() => _value = v),
      onChangeEnd: (v) => widget.onChanged(v.roundToDouble()),
    );
  }
}

class _NumberRow extends StatelessWidget {
  const _NumberRow({
    required this.label,
    required this.value,
    required this.onSave,
    this.autoValue,
    this.autoLabel,
    this.suffix,
    this.hint,
  });

  final String label;
  final double? value;

  /// 有給＝可以空白改回自動。
  final double? autoValue;
  final String? autoLabel;
  final String? suffix;
  final String? hint;
  final void Function(double? value) onSave;

  String _fmt(double v) => suffix == null ? formatAmount(v) : '${v % 1 == 0 ? v.round() : v} $suffix';

  @override
  Widget build(BuildContext context) {
    final shown = value ?? autoValue;
    return ListTile(
      dense: true,
      title: Text(label),
      subtitle: value == null && autoLabel != null ? Text('自動：$autoLabel') : (hint == null ? null : Text(hint!)),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(shown == null ? '未設定' : _fmt(shown)),
          const SizedBox(width: 4),
          const Icon(Icons.edit_outlined, size: 16),
        ],
      ),
      onTap: () => _edit(context),
    );
  }

  Future<void> _edit(BuildContext context) async {
    final controller = TextEditingController(text: value == null ? '' : (value! % 1 == 0 ? value!.round().toString() : value.toString()));
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(label),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
          decoration: InputDecoration(
            hintText: autoValue != null ? '空白＝自動（${formatAmount(autoValue!)}）' : hint,
            suffixText: suffix,
          ),
          onSubmitted: (v) => Navigator.of(context).pop(v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(controller.text), child: const Text('儲存')),
        ],
      ),
    );
    if (result == null) return;
    final text = result.trim().replaceAll(',', '');
    if (text.isEmpty) {
      onSave(null);
      return;
    }
    final v = double.tryParse(text);
    if (v != null) onSave(v);
  }
}
