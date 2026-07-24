import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../state/auth_provider.dart';
import '../../../state/projects_provider.dart';
import 'project_detail_screen.dart';

/// Project list for one company space — the entry point of the projects
/// management module, reached from the "專案管理" card on the home screen.
class ProjectListScreen extends ConsumerWidget {
  const ProjectListScreen({super.key, required this.spaceId, required this.spaceName});

  final String spaceId;
  final String spaceName;

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

    return Scaffold(
      appBar: AppBar(title: Text('$spaceName · 專案管理')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createProject(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增專案'),
      ),
      body: projectsAsync.when(
        data: (projects) {
          if (projects.isEmpty) {
            return const Center(child: Text('目前沒有任何專案'));
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: projects.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final project = projects[index];
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.folder_outlined),
                  title: Text(project.name),
                  subtitle: Text(
                    project.clientName != null ? '業主：${project.clientName}' : '尚未填寫業主',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ProjectDetailScreen(projectId: project.id),
                    ),
                  ),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取專案失敗：$error')),
      ),
    );
  }
}
