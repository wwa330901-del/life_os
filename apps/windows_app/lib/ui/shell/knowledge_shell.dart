import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/knowledge_provider.dart';
import '../screens/knowledge/knowledge_home_screen.dart';

/// Top-level shell for 知識庫 — a sibling destination to `SpaceShell`, not
/// something nested inside it, since the knowledge library is account-level
/// and isn't scoped to any particular Space (see 大系統 doc).
class KnowledgeShell extends ConsumerWidget {
  const KnowledgeShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: '回首頁',
          onPressed: () => ref.read(showKnowledgeLibraryProvider.notifier).close(),
        ),
        title: const Text('知識庫'),
      ),
      body: const KnowledgeHomeScreen(),
    );
  }
}
