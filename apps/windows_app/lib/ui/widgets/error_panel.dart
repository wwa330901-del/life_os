import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';

/// 錯誤怎麼給使用者看（2026-11-21 使用者定的）：上面中文說「發生什麼事、要做什麼」，
/// 下面灰框是英文詳細內容，可以按「複製給 Claude」貼過去判讀。
class FriendlyError {
  const FriendlyError({
    required this.title,
    required this.message,
    required this.detail,
  });

  final String title;
  final String message;
  final String detail;

  factory FriendlyError.from(Object error) {
    if (error is ApiException) {
      if (error.statusCode == 0) {
        return FriendlyError(
          title: '連不上伺服器',
          message: error.message,
          detail: error.detail,
        );
      }
      if (error.statusCode >= 500) {
        return FriendlyError(
          title: '這裡暫時打不開',
          message: '已經自動通知管理員在修了，你不用做什麼',
          detail: error.detail,
        );
      }
      return FriendlyError(
        title: '沒辦法完成',
        message: error.message,
        detail: error.detail,
      );
    }
    return FriendlyError(
      title: '程式出了點問題',
      message: '已經自動通知管理員，可以先再試一次',
      detail: '[v$appVersionLabel] ${error.runtimeType}: $error',
    );
  }
}

Future<void> copyErrorDetail(BuildContext context, String detail) async {
  await Clipboard.setData(ClipboardData(text: detail));
  if (context.mounted) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('已複製，貼給 Claude 就好')));
  }
}

/// 整塊區域讀取失敗時用（取代原本的「讀取失敗：…」一行字）。
class ErrorPanel extends StatelessWidget {
  const ErrorPanel({super.key, required this.error, this.onRetry});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final info = FriendlyError.from(error);
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: Card(
          margin: const EdgeInsets.all(16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(Icons.error_outline, color: scheme.error),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            info.title,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            info.message,
                            style: TextStyle(color: scheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                    if (onRetry != null) ...[
                      const SizedBox(width: 12),
                      FilledButton(
                        onPressed: onRetry,
                        child: const Text('再試一次'),
                      ),
                    ],
                  ],
                ),
                if (info.detail.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  ErrorDetailBox(detail: info.detail),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 灰框英文詳細內容＋「複製給 Claude」。
class ErrorDetailBox extends StatelessWidget {
  const ErrorDetailBox({super.key, required this.detail});

  final String detail;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: SelectableText(
              detail,
              style: TextStyle(
                fontFamily: 'Consolas',
                fontSize: 12,
                color: scheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: () => copyErrorDetail(context, detail),
            child: const Text('複製給 Claude'),
          ),
        ],
      ),
    );
  }
}

/// 存檔、刪除等動作失敗時跳出來的訊息：中文，旁邊有「複製詳細」。
SnackBar errorSnackBar(Object error, {String? prefix}) {
  final info = FriendlyError.from(error);
  final text =
      error is ApiException && error.statusCode > 0 && error.statusCode < 500
      ? error.message
      : '${info.title}：${info.message}';
  return SnackBar(
    content: Text(prefix == null ? text : '$prefix：$text'),
    duration: const Duration(seconds: 6),
    action: info.detail.isEmpty
        ? null
        : SnackBarAction(
            label: '複製詳細',
            onPressed: () =>
                Clipboard.setData(ClipboardData(text: info.detail)),
          ),
  );
}
