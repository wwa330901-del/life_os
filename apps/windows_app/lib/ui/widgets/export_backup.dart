import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../state/auth_provider.dart';

/// 匯出全部資料成 Excel，存到「下載」資料夾並在檔案總管裡選取它。
Future<void> exportBackup(BuildContext context, WidgetRef ref) async {
  final messenger = ScaffoldMessenger.of(context);
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const AlertDialog(
      content: Row(
        children: [
          SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 16),
          Text('正在匯出全部資料…'),
        ],
      ),
    ),
  );
  final navigator = Navigator.of(context, rootNavigator: true);
  try {
    final bytes = await ref.read(apiClientProvider).downloadExport();
    final home = Platform.environment['USERPROFILE'] ?? Directory.systemTemp.path;
    final downloads = Directory('$home${Platform.pathSeparator}Downloads');
    final dir = downloads.existsSync() ? downloads : Directory(home);
    final now = DateTime.now();
    final stamp = '${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}'
        '-${now.hour.toString().padLeft(2, '0')}${now.minute.toString().padLeft(2, '0')}';
    final file = File('${dir.path}${Platform.pathSeparator}元序備份-$stamp.xlsx');
    await file.writeAsBytes(bytes);
    navigator.pop();
    messenger.showSnackBar(SnackBar(content: Text('已存到 ${file.path}')));
    if (Platform.isWindows) await Process.run('explorer.exe', ['/select,', file.path]);
  } on ApiException catch (e) {
    navigator.pop();
    messenger.showSnackBar(SnackBar(content: Text('匯出失敗：${e.message}')));
  } on FileSystemException catch (e) {
    navigator.pop();
    messenger.showSnackBar(SnackBar(content: Text('存檔失敗：${e.message}')));
  }
}
