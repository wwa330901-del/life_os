import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/execution_photo.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/execution_photos_provider.dart';

/// 執行照片（2026-09）— 顧問文件「工程執行紀錄系統」第四項，即日報表當
/// 初刻意排除的「執行紀錄留存」。Grid 縮圖呈現，點縮圖看大圖。
class ExecutionPhotosTab extends ConsumerWidget {
  const ExecutionPhotosTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final photosAsync = ref.watch(executionPhotosProvider(projectId));

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _upload(context, ref),
        icon: const Icon(Icons.add_a_photo_outlined),
        label: const Text('上傳照片'),
      ),
      body: photosAsync.when(
        data: (photos) {
          if (photos.isEmpty) return const Center(child: Text('這個專案還沒有任何執行照片，按右下角上傳'));
          return GridView.builder(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 220,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 0.85,
            ),
            itemCount: photos.length,
            itemBuilder: (context, index) {
              final photo = photos[index];
              return _PhotoCard(
                photo: photo,
                onTap: () => _showLarge(context, photo),
                onDelete: () => _delete(context, ref, photo),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取執行照片失敗：$error')),
      ),
    );
  }

  Future<void> _showLarge(BuildContext context, ExecutionPhoto photo) async {
    await showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: photo.photoUrl != null
                  ? Image.network(photo.photoUrl!, fit: BoxFit.contain)
                  : const Padding(padding: EdgeInsets.all(32), child: Icon(Icons.broken_image_outlined, size: 64)),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('${photo.photoDate.year}/${photo.photoDate.month}/${photo.photoDate.day}'),
                  if (photo.caption != null && photo.caption!.isNotEmpty) Text(photo.caption!),
                  Text('上傳人：${photo.uploadedByName}', style: const TextStyle(fontSize: 11)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _upload(BuildContext context, WidgetRef ref) async {
    final file = await openFile(
      acceptedTypeGroups: const [
        XTypeGroup(label: '圖片', extensions: ['jpg', 'jpeg', 'png', 'heic', 'webp']),
      ],
    );
    if (file == null || !context.mounted) return;

    final captionController = TextEditingController();
    DateTime photoDate = DateTime.now();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('上傳執行照片'),
          content: SizedBox(
            width: 360,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('檔案：${file.name}'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: Text('日期：${photoDate.year}/${photoDate.month}/${photoDate.day}')),
                    TextButton(
                      onPressed: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: photoDate,
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2100),
                        );
                        if (picked != null) setState(() => photoDate = picked);
                      },
                      child: const Text('選擇日期'),
                    ),
                  ],
                ),
                TextField(
                  controller: captionController,
                  decoration: const InputDecoration(labelText: '說明（選填）'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('上傳')),
          ],
        ),
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      final bytes = await file.readAsBytes();
      await ref
          .read(apiClientProvider)
          .uploadExecutionPhoto(
            projectId: projectId,
            photoDate: photoDate,
            caption: captionController.text.trim(),
            fileName: file.name,
            bytes: bytes,
          );
      ref.invalidate(executionPhotosProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, ExecutionPhoto photo) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除照片'),
        content: const Text('確定要刪除這張執行照片嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteExecutionPhoto(projectId: projectId, photoId: photo.id);
      ref.invalidate(executionPhotosProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _PhotoCard extends StatelessWidget {
  const _PhotoCard({required this.photo, required this.onTap, required this.onDelete});

  final ExecutionPhoto photo;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: photo.photoUrl != null
                  ? Image.network(
                      photo.photoUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) =>
                          const Center(child: Icon(Icons.broken_image_outlined)),
                    )
                  : const Center(child: Icon(Icons.image_not_supported_outlined)),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${photo.photoDate.year}/${photo.photoDate.month}/${photo.photoDate.day}',
                      style: const TextStyle(fontSize: 12),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.delete_outline, size: 18),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: onDelete,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
