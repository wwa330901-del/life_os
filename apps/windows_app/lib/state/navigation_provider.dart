import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_provider.dart';

/// App 裡可以去的每一個地方（2026-11-22 拿掉「空間」：記帳、股票、行事曆直接是功能）。
enum AppDestination {
  home('首頁', Icons.home_outlined, ''),
  finance('記帳', Icons.account_balance_wallet_outlined, '收支、帳戶、預算、規劃'),
  stocks('股票', Icons.show_chart, '持股、損益、定期定額'),
  calendar('行事曆', Icons.calendar_today_outlined, '行程、同步 Google 和 iPhone'),
  todo('代辦事項', Icons.task_alt, '今天要做、持續性任務'),
  lifeGoals('人生目標', Icons.track_changes, '目標進度、打卡'),
  journal('日記', Icons.menu_book_outlined, '每天記一點'),
  trips('旅行', Icons.flight_takeoff_outlined, '規劃行程、出發提醒'),
  knowledge('知識庫', Icons.auto_stories_outlined, '存起來的文章、地點'),
  divination('算命', Icons.auto_awesome_outlined, '梅花易數起卦'),
  aiAssistant('AI 問答', Icons.smart_toy_outlined, '記帳、排行程、打卡……直接說');

  const AppDestination(this.label, this.icon, this.description);

  final String label;
  final IconData icon;
  final String description;
}

/// 現在在哪一頁。登出／換帳號時回到首頁。
class NavNotifier extends Notifier<AppDestination> {
  @override
  AppDestination build() {
    ref.watch(authControllerProvider.select((s) => s.value?.user.id));
    return AppDestination.home;
  }

  void go(AppDestination destination) => state = destination;

  void home() => state = AppDestination.home;
}

final navProvider = NotifierProvider<NavNotifier, AppDestination>(NavNotifier.new);

/// 打開 AI 問答時要先自動送出的那句話（C 版首頁的輸入框、常用一句話）。
class PendingAiQuestionNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String? question) => state = question;

  /// 拿走（拿了就清掉，避免重複送）。
  String? take() {
    final q = state;
    state = null;
    return q;
  }
}

final pendingAiQuestionProvider = NotifierProvider<PendingAiQuestionNotifier, String?>(PendingAiQuestionNotifier.new);
