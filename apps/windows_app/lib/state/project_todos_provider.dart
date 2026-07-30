import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/project_todo.dart';
import 'auth_provider.dart';

final projectTodosProvider = FutureProvider.autoDispose.family<List<ProjectTodo>, String>((
  ref,
  projectId,
) {
  return ref.read(apiClientProvider).listProjectTodos(projectId);
});
