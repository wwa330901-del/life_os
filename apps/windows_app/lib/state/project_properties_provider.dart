import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/project_property.dart';
import 'auth_provider.dart';

/// This space's own project-property definitions (Notion-database-style —
/// each space sets these up itself), sorted by `sortOrder`.
final spacePropertiesProvider = FutureProvider.family<List<PropertyDefinition>, String>((
  ref,
  spaceId,
) async {
  return ref.read(apiClientProvider).listPropertyDefinitions(spaceId);
});
