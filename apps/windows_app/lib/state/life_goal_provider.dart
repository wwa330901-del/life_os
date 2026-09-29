import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/life_goal.dart';
import 'auth_provider.dart';

final lifeGoalsProvider = FutureProvider.autoDispose<List<LifeGoal>>((ref) {
  return ref.read(apiClientProvider).listLifeGoals();
});

/// 人生目標 is account-level like 代辦事項/知識庫 — a separate top-level
/// destination from `selectedSpaceProvider`, checked by `_RootRouter`
/// (`app.dart`), same shape as `showTodoSpaceProvider`.
class ShowLifeGoalsNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void open() => state = true;

  void close() => state = false;
}

final showLifeGoalsProvider = NotifierProvider<ShowLifeGoalsNotifier, bool>(
  ShowLifeGoalsNotifier.new,
);

final lifeGoalTrackingOptionsProvider = FutureProvider.autoDispose<List<LifeGoalAccountOption>>((ref) {
  return ref.read(apiClientProvider).lifeGoalTrackingOptions();
});

final lifeGoalCheckInsProvider = FutureProvider.autoDispose.family<List<LifeGoalCheckIn>, String>((ref, goalId) {
  return ref.read(apiClientProvider).listLifeGoalCheckIns(goalId);
});
