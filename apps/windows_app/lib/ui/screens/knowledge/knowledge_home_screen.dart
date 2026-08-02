import 'package:flutter/material.dart';

import 'tabs/ai_usage_tab.dart';
import 'tabs/private_knowledge_tab.dart';
import 'tabs/public_knowledge_tab.dart';

/// 知識庫 — account-level module, independent of any Space (see 大系統 doc).
/// 私人區 (everything the caller owns)、公開區 (other users' public
/// categories the caller isn't blacklisted from)、用量記錄 (this user's own
/// Gemini usage/cost history only).
class KnowledgeHomeScreen extends StatefulWidget {
  const KnowledgeHomeScreen({super.key});

  @override
  State<KnowledgeHomeScreen> createState() => _KnowledgeHomeScreenState();
}

class _KnowledgeHomeScreenState extends State<KnowledgeHomeScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(length: 3, vsync: this);

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: '私人區'),
            Tab(text: '公開區'),
            Tab(text: '用量記錄'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: const [
              PrivateKnowledgeTab(),
              PublicKnowledgeTab(),
              AiUsageTab(),
            ],
          ),
        ),
      ],
    );
  }
}
