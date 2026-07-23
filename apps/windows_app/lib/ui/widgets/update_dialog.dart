import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/update/update_service.dart';

/// Shows a dialog telling the user a newer version is available. Choosing
/// "現在更新" downloads the installer with a progress bar, then launches it
/// silently and exits this app — the installer relaunches it when done.
/// "稍後" just dismisses; the check runs again on next launch.
Future<void> showUpdateAvailableDialog(BuildContext context, UpdateInfo info) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (context) => _UpdateDialog(info: info),
  );
}

enum _Stage { prompt, downloading, error }

class _UpdateDialog extends StatefulWidget {
  const _UpdateDialog({required this.info});

  final UpdateInfo info;

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  _Stage _stage = _Stage.prompt;
  double _progress = 0;
  String? _errorMessage;

  Future<void> _updateNow() async {
    setState(() => _stage = _Stage.downloading);
    try {
      await UpdateService().downloadAndInstall(
        widget.info,
        onProgress: (p) {
          if (mounted) setState(() => _progress = p);
        },
      );
      // downloadAndInstall exits the process on success — nothing runs after this.
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _stage = _Stage.error;
        _errorMessage = e.toString();
      });
    }
  }

  Future<void> _openReleasePage() async {
    await launchUrl(
      Uri.parse(widget.info.releaseUrl),
      mode: LaunchMode.externalApplication,
    );
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('有新版本可用：v${widget.info.version}'),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: switch (_stage) {
          _Stage.prompt => SingleChildScrollView(
            child: Text(
              widget.info.releaseNotes.isEmpty
                  ? '此版本沒有提供更新說明。'
                  : widget.info.releaseNotes,
            ),
          ),
          _Stage.downloading => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('正在下載更新…'),
              const SizedBox(height: 12),
              LinearProgressIndicator(value: _progress > 0 ? _progress : null),
              const SizedBox(height: 8),
              Text('${(_progress * 100).toStringAsFixed(0)}%'),
            ],
          ),
          _Stage.error => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '自動更新失敗：$_errorMessage',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              const SizedBox(height: 8),
              const Text('可以改成手動前往下載頁安裝。'),
            ],
          ),
        },
      ),
      actions: switch (_stage) {
        _Stage.prompt => [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('稍後'),
          ),
          FilledButton(onPressed: _updateNow, child: const Text('現在更新')),
        ],
        _Stage.downloading => const [],
        _Stage.error => [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消'),
          ),
          FilledButton(onPressed: _openReleasePage, child: const Text('前往下載頁')),
        ],
      },
    );
  }
}
