import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/project.dart';
import 'auth_provider.dart';

/// Projects in a given company space. `.family` keyed by spaceId, matching
/// the FutureProvider pattern used for other read-only server data (see
/// admin_provider.dart).
final spaceProjectsProvider = FutureProvider.autoDispose
    .family<List<Project>, String>((ref, spaceId) {
      return ref.read(apiClientProvider).listProjects(spaceId);
    });
