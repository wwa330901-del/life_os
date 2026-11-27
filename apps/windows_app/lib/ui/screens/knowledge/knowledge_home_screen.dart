import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../state/knowledge_provider.dart';
import 'brain/brain_home.dart';
import 'tabs/ai_usage_tab.dart';
import 'tabs/public_knowledge_tab.dart';

/// 知識庫＝我的大腦（2026-11-27 改版）。原本三個分頁「私人區／公開區／用量記錄」：
/// 私人區變成大腦（首頁＋大腦地圖＋列表）；「別人分享的」只有真的有人分享時才出現；
/// AI 用量跟知識庫無關，收到右上角按鈕。
class KnowledgeHomeScreen extends ConsumerWidget {
  const KnowledgeHomeScreen({super.key});

  void _openPage(BuildContext context, String title, Widget child) {
    showDialog<void>(
      context: context,
      builder: (c) => Dialog(
        insetPadding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1000, maxHeight: 800),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 12, 8, 0),
                child: Row(
                  children: [
                    Expanded(child: Text(title, style: Theme.of(c).textTheme.titleLarge)),
                    IconButton(tooltip: '關閉', icon: const Icon(Icons.close), onPressed: () => Navigator.of(c).pop()),
                  ],
                ),
              ),
              Expanded(child: child),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hasPublic = ref.watch(publicKnowledgeCategoriesProvider).value?.isNotEmpty ?? false;
    return BrainHome(
      actions: [
        if (hasPublic)
          TextButton.icon(
            onPressed: () => _openPage(context, '別人分享的', const PublicKnowledgeTab()),
            icon: const Icon(Icons.people_outline),
            label: const Text('別人分享的'),
          ),
        IconButton(
          tooltip: 'AI 用量記錄',
          icon: const Icon(Icons.receipt_long_outlined),
          onPressed: () => _openPage(context, 'AI 用量記錄', const AiUsageTab()),
        ),
      ],
    );
  }
}
