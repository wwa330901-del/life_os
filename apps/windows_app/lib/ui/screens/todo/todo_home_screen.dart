import 'package:flutter/material.dart';

import 'tabs/personal_todo_tab.dart';
import 'tabs/work_todo_tab.dart';

/// 代辦事項 — account-level module, independent of any Space. 個人 (owned
/// directly by the caller, no project) and 工作 (belongs to a company-space
/// project the caller is a member of).
class TodoHomeScreen extends StatefulWidget {
  const TodoHomeScreen({super.key});

  @override
  State<TodoHomeScreen> createState() => _TodoHomeScreenState();
}

class _TodoHomeScreenState extends State<TodoHomeScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(length: 2, vsync: this);

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
            Tab(text: '個人'),
            Tab(text: '工作'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: const [
              PersonalTodoTab(),
              WorkTodoTab(),
            ],
          ),
        ),
      ],
    );
  }
}
