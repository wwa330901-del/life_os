import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/calendar_share.dart';
import '../../../state/auth_provider.dart';
import '../../../state/calendar_share_provider.dart';

/// 共用行事曆管理——「別人分享給我的」（含待處理邀請）跟「我分享出去的」
/// 兩個分頁。詳細程度是擁有者（分享出去那邊）的權限，顏色是檢視者（收到
/// 分享那邊）的權限，兩邊各自只能改自己那一半，跟 schema 設計對齊。
class CalendarShareDialog extends StatelessWidget {
  const CalendarShareDialog({super.key});

  static Future<void> show(BuildContext context) {
    return showDialog<void>(context: context, builder: (_) => const CalendarShareDialog());
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: SizedBox(
        width: 480,
        height: 560,
        child: DefaultTabController(
          length: 2,
          child: Column(
            children: [
              const TabBar(
                tabs: [Tab(text: '收到的分享'), Tab(text: '我的分享')],
              ),
              const Expanded(
                child: TabBarView(
                  children: [_ReceivedTab(), _GivenTab()],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReceivedTab extends ConsumerWidget {
  const _ReceivedTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sharesAsync = ref.watch(calendarSharesReceivedProvider);

    return sharesAsync.when(
      data: (shares) {
        if (shares.isEmpty) {
          return const Center(child: Text('還沒有人邀請你共用行事曆'));
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: shares.length,
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            final share = shares[index];
            return Card(
              child: ListTile(
                title: Text(share.owner?.name ?? '未知使用者'),
                subtitle: Text(
                  share.accepted ? '已接受・${share.detailLevel.label}' : '待處理邀請',
                ),
                trailing: share.accepted
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _ColorSwatchPicker(
                            color: share.viewerColor,
                            onChanged: (color) => _updateColor(ref, share, color),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close, size: 18),
                            tooltip: '移除',
                            onPressed: () => _remove(context, ref, share),
                          ),
                        ],
                      )
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextButton(onPressed: () => _accept(context, ref, share), child: const Text('接受')),
                          IconButton(
                            icon: const Icon(Icons.close, size: 18),
                            tooltip: '拒絕',
                            onPressed: () => _remove(context, ref, share),
                          ),
                        ],
                      ),
              ),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取失敗：$error')),
    );
  }

  Future<void> _accept(BuildContext context, WidgetRef ref, CalendarShare share) async {
    try {
      await ref.read(apiClientProvider).acceptCalendarShare(share.id);
      ref.invalidate(calendarSharesReceivedProvider);
      ref.invalidate(combinedCalendarEventsProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _remove(BuildContext context, WidgetRef ref, CalendarShare share) async {
    try {
      await ref.read(apiClientProvider).removeCalendarShare(share.id);
      ref.invalidate(calendarSharesReceivedProvider);
      ref.invalidate(combinedCalendarEventsProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _updateColor(WidgetRef ref, CalendarShare share, String color) async {
    await ref.read(apiClientProvider).updateCalendarShareColor(id: share.id, viewerColor: color);
    ref.invalidate(calendarSharesReceivedProvider);
    ref.invalidate(combinedCalendarEventsProvider);
  }
}

/// 顏色是檢視者自己的顯示偏好（跟擁有者的分享設定完全無關），固定 8 色
/// 調色盤，不用色輪選色器——這裡只是「幫這個人的行程標一個好分辨的顏
/// 色」，不需要無限選色。
class _ColorSwatchPicker extends StatelessWidget {
  const _ColorSwatchPicker({required this.color, required this.onChanged});

  final String color;
  final ValueChanged<String> onChanged;

  static const _palette = [
    '#5B8DEF',
    '#E8743B',
    '#2FB380',
    '#CD5B9F',
    '#ECC94B',
    '#9F7AEA',
    '#48BB9F',
    '#E53E3E',
  ];

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      tooltip: '選顏色',
      onSelected: onChanged,
      itemBuilder: (context) => [
        for (final c in _palette)
          PopupMenuItem(
            value: c,
            child: Row(
              children: [
                Container(
                  width: 16,
                  height: 16,
                  decoration: BoxDecoration(
                    color: Color(int.parse(c.replaceFirst('#', '0xFF'))),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                if (c == color) const Icon(Icons.check, size: 16),
              ],
            ),
          ),
      ],
      child: Container(
        width: 20,
        height: 20,
        decoration: BoxDecoration(
          color: Color(int.parse(color.replaceFirst('#', '0xFF'))),
          shape: BoxShape.circle,
          border: Border.all(color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.4)),
        ),
      ),
    );
  }
}

class _GivenTab extends ConsumerWidget {
  const _GivenTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sharesAsync = ref.watch(calendarSharesGivenProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton.icon(
            onPressed: () => _invite(context, ref),
            icon: const Icon(Icons.person_add_alt_outlined, size: 18),
            label: const Text('用 email 邀請'),
          ),
        ),
        Expanded(
          child: sharesAsync.when(
            data: (shares) {
              if (shares.isEmpty) {
                return const Center(child: Text('還沒有分享給任何人'));
              }
              return ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: shares.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final share = shares[index];
                  return Card(
                    child: ListTile(
                      title: Text(share.viewer?.name ?? '未知使用者'),
                      subtitle: Text(share.accepted ? '已接受' : '邀請中（尚未接受）'),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          DropdownButton<CalendarShareDetailLevel>(
                            value: share.detailLevel,
                            underline: const SizedBox.shrink(),
                            items: CalendarShareDetailLevel.values
                                .map((l) => DropdownMenuItem(value: l, child: Text(l.label)))
                                .toList(),
                            onChanged: (level) => level == null ? null : _updateDetailLevel(ref, share, level),
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline, size: 18),
                            tooltip: '撤銷',
                            onPressed: () => _revoke(context, ref, share),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(child: Text('讀取失敗：$error')),
          ),
        ),
      ],
    );
  }

  Future<void> _invite(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final email = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('用 email 邀請'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'email'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('送出邀請'),
          ),
        ],
      ),
    );
    if (email == null || email.isEmpty || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).inviteCalendarShare(email);
      ref.invalidate(calendarSharesGivenProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _updateDetailLevel(WidgetRef ref, CalendarShare share, CalendarShareDetailLevel level) async {
    await ref.read(apiClientProvider).updateCalendarShareDetailLevel(id: share.id, detailLevel: level);
    ref.invalidate(calendarSharesGivenProvider);
  }

  Future<void> _revoke(BuildContext context, WidgetRef ref, CalendarShare share) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('撤銷分享'),
        content: Text('確定不要再讓「${share.viewer?.name ?? '這個人'}」看到你的行事曆嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('撤銷')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).removeCalendarShare(share.id);
      ref.invalidate(calendarSharesGivenProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}
