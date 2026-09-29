import 'package:flutter/material.dart';

import 'tabs/completed_todo_tab.dart';
import 'tabs/personal_todo_tab.dart';

/// 代辦事項 — account-level module, independent of any Space.
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
            Tab(text: '進行中'),
            Tab(text: '已完成'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: const [PersonalTodoTab(), CompletedTodoTab()],
          ),
        ),
      ],
    );
  }
}
