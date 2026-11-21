import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/life_goal.dart';
import 'auth_provider.dart';

final lifeGoalsProvider = FutureProvider.autoDispose<List<LifeGoal>>((ref) {
  return ref.read(apiClientProvider).listLifeGoals();
});


final lifeGoalTrackingOptionsProvider = FutureProvider.autoDispose<List<LifeGoalAccountOption>>((ref) {
  return ref.read(apiClientProvider).lifeGoalTrackingOptions();
});

final lifeGoalCheckInsProvider = FutureProvider.autoDispose.family<List<LifeGoalCheckIn>, String>((ref, goalId) {
  return ref.read(apiClientProvider).listLifeGoalCheckIns(goalId);
});
