import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../state/auth_provider.dart';
import '../../../state/projects_provider.dart';
import '../../shell/breadcrumb_bar.dart';

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

  Future<void> _createProject(BuildContext context, WidgetRef ref) async {
    final nameController = TextEditingController();
    final clientController = TextEditingController();
    var startDate = DateTime.now();

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('新增專案'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                autofocus: true,
                decoration: const InputDecoration(labelText: '專案名稱'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: clientController,
                decoration: const InputDecoration(labelText: '業主（選填）'),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '開工日：${startDate.year}/${startDate.month}/${startDate.day}',
                    ),
                  ),
                  TextButton(
                    onPressed: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: startDate,
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) setState(() => startDate = picked);
                    },
                    child: const Text('選擇日期'),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('建立'),
            ),
          ],
        ),
      ),
    );

    if (created != true || !context.mounted) return;
    final name = nameController.text.trim();
    if (name.isEmpty) return;

    try {
      await ref.read(apiClientProvider).createProject(
        spaceId: spaceId,
        name: name,
        clientName: clientController.text.trim().isEmpty ? null : clientController.text.trim(),
        projectStartDate: startDate,
      );
      ref.invalidate(spaceProjectsProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

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
              onPressed: () => _createProject(context, ref),
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
                  mainAxisExtent: 108,
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
                                project.clientName != null ? '業主：${project.clientName}' : '尚未填寫業主',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
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
