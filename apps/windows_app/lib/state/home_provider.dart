import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/home_dashboard.dart';
import 'auth_provider.dart';

final homeDashboardProvider = FutureProvider.autoDispose<HomeDashboard>((ref) {
  return ref.read(apiClientProvider).getHomeDashboard();
});

final homeLayoutProvider = FutureProvider.autoDispose<List<HomeWidgetConfig>>((ref) {
  return ref.read(apiClientProvider).getHomeLayout();
});
