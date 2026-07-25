import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/project_member.dart';
import 'auth_provider.dart';

/// Members of one project. `.family` keyed by projectId, matching the
/// pattern `spaceProjectsProvider` uses (see `projects_provider.dart`).
final projectMembersProvider = FutureProvider.autoDispose
    .family<List<ProjectMember>, String>((ref, projectId) {
      return ref.read(apiClientProvider).listProjectMembers(projectId);
    });

/// Members of the space a project lives in — the candidate pool a
/// project's "+ 新增成員" picker offers to add from.
final spaceMembersProvider = FutureProvider.autoDispose
    .family<List<SpaceMember>, String>((ref, spaceId) {
      return ref.read(apiClientProvider).listSpaceMembers(spaceId);
    });
