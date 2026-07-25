import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../state/projects_provider.dart';
import '../../shell/breadcrumb_bar.dart';
import '../../widgets/projects/create_project_dialog.dart';

/// Project list content for one company space — the default view of
/// `SpaceShell`'s content pane for a company space (sidebar stays put).
class ProjectListScreen extends ConsumerWidget {
  const ProjectListScreen({
    super.key,
    required this.spaceId,
    required this.spaceName,
    required this.onOpenProject,
  });

  final String spaceId;
  final String spaceName;
  final ValueChanged<String> onOpenProject;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectsAsync = ref.watch(spaceProjectsProvider(spaceId));
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        BreadcrumbBar(
          segments: [BreadcrumbSegment(spaceName)],
          actions: [
            FilledButton.icon(
              onPressed: () => CreateProjectDialog.show(context, spaceId),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('新增專案'),
            ),
          ],
        ),
        Expanded(
          child: projectsAsync.when(
            data: (projects) {
              if (projects.isEmpty) {
                return const Center(child: Text('目前沒有任何專案'));
              }
              return GridView(
                padding: const EdgeInsets.all(24),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 280,
                  mainAxisExtent: 128,
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                ),
                children: [
                  for (final project in projects)
                    Card(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: () => onOpenProject(project.id),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(Icons.folder_outlined, size: 18, color: scheme.primary),
                                  const Spacer(),
                                  Icon(Icons.chevron_right, size: 18, color: scheme.onSurface.withValues(alpha: 0.4)),
                                ],
                              ),
                              const Spacer(),
                              Text(
                                project.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '業主：${project.clientName}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 6,
                                children: [
                                  _Badge(label: project.type.label, color: scheme.primary),
                                  _Badge(label: project.status.label, color: scheme.secondary),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(child: Text('讀取專案失敗：$error')),
          ),
        ),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: color)),
    );
  }
}
