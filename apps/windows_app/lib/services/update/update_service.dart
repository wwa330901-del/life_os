import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:flutter/services.dart';

/// A newer release found on GitHub, with what's needed to show it to the
/// user and let them get it.
class UpdateInfo {
  const UpdateInfo({
    required this.version,
    required this.currentVersion,
    required this.releaseNotes,
    required this.releaseUrl,
    required this.installerDownloadUrl,
  });

  final String version;

  /// 這台現在裝的版本（對話框顯示，回報問題時看得出是哪一版）
  final String currentVersion;
  final String releaseNotes;
  final String releaseUrl;
  final String? installerDownloadUrl;
}

/// Android 下載完之後走到哪一步（Windows 會直接結束程式，不會回傳）。
enum AndroidInstallStep {
  /// 系統安裝畫面已跳出，等使用者按「更新」。
  installerShown,

  /// 第一次：先開了「允許安裝不明應用程式」設定頁，允許後回到 App 會自動接著跳安裝畫面。
  needsPermission,
}

/// Checks GitHub Releases for a newer build than the one currently running,
/// and can silently download + install it in place.
///
/// Relies on every shipped update being tagged as a GitHub Release named
/// `vX.Y.Z` matching `pubspec.yaml`'s `version:`, with the Inno Setup
/// installer `.exe` attached as a release asset — see
/// `installer/life_os.iss`.
class UpdateService {
  static const _androidUpdater = MethodChannel('yuanxu/updater');

  static const _repo = 'wwa330901-del/life_os';
  static const _latestReleaseUrl =
      'https://api.github.com/repos/$_repo/releases/latest';

  /// Returns update info if a newer version is available, or null if
  /// already up to date. Any network/parse failure also returns null —
  /// a failed check should never block or scare the user, since this
  /// only ever runs as a courtesy.
  Future<UpdateInfo?> checkForUpdate() async {
    final currentVersion = (await PackageInfo.fromPlatform()).version;

    final http.Response response;
    try {
      response = await http
          .get(
            Uri.parse(_latestReleaseUrl),
            headers: {'Accept': 'application/vnd.github+json'},
          )
          .timeout(const Duration(seconds: 8));
    } catch (_) {
      return null;
    }
    if (response.statusCode != 200) return null;

    try {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      final tag = json['tag_name'] as String? ?? '';
      final remoteVersion = tag.startsWith('v') ? tag.substring(1) : tag;
      if (remoteVersion.isEmpty || !_isNewer(remoteVersion, currentVersion)) {
        return null;
      }

      // 同一個 Release 裡同時有 Windows 安裝檔和 Android APK，挑這台用得到的。
      final wantedExtension = Platform.isAndroid ? '.apk' : '.exe';
      final assets = (json['assets'] as List?) ?? const [];
      String? downloadUrl;
      for (final asset in assets) {
        final name = asset['name'] as String? ?? '';
        if (name.endsWith(wantedExtension)) {
          downloadUrl = asset['browser_download_url'] as String?;
          break;
        }
      }

      return UpdateInfo(
        version: remoteVersion,
        currentVersion: currentVersion,
        releaseNotes: (json['body'] as String? ?? '').trim(),
        releaseUrl: json['html_url'] as String? ?? '',
        installerDownloadUrl: downloadUrl,
      );
    } catch (_) {
      return null;
    }
  }

  /// Downloads the installer to a temp file while reporting 0.0-1.0
  /// progress, then launches it silently and exits this process — the
  /// installer can't overwrite the running exe while it's still open.
  /// On Android, hands the APK to the system installer instead and returns
  /// which step the user is now looking at.
  ///
  /// Throws [StateError] if there's no installer asset or the download
  /// fails; callers should fall back to opening [UpdateInfo.releaseUrl].
  Future<AndroidInstallStep?> downloadAndInstall(
    UpdateInfo info, {
    required void Function(double progress) onProgress,
  }) async {
    final url = info.installerDownloadUrl;
    if (url == null) {
      throw StateError('This release has no installer attached.');
    }

    final client = http.Client();
    late final http.StreamedResponse response;
    try {
      response = await client.send(http.Request('GET', Uri.parse(url)));
    } catch (e) {
      client.close();
      throw StateError('Download failed: $e');
    }
    if (response.statusCode != 200) {
      client.close();
      throw StateError('Download failed (${response.statusCode}).');
    }

    final total = response.contentLength ?? 0;
    var received = 0;
    final File installerFile;
    if (Platform.isAndroid) {
      // 放在 cacheDir/updates（MainActivity 的 FileProvider 只開放這個資料夾）
      final cacheDir = await _androidUpdater.invokeMethod<String>('cacheDir');
      final dir = Directory('$cacheDir/updates')..createSync(recursive: true);
      installerFile = File('${dir.path}/life_os.apk');
    } else {
      final tempDir = Directory.systemTemp.createTempSync('life_os_update_');
      installerFile = File('${tempDir.path}${Platform.pathSeparator}life_os_setup.exe');
    }
    final sink = installerFile.openWrite();

    try {
      await for (final chunk in response.stream) {
        sink.add(chunk);
        received += chunk.length;
        if (total > 0) onProgress(received / total);
      }
    } finally {
      await sink.close();
      client.close();
    }

    // Android 不能默默安裝（沒上架商店的 App 一定要使用者按「更新」）：叫出系統
    // 安裝畫面，覆蓋舊版、資料保留。第一次會先跳「允許安裝不明應用程式」設定頁。
    if (Platform.isAndroid) {
      final status = await _androidUpdater.invokeMethod<String>('installApk', {
        'path': installerFile.path,
      });
      return status == 'needs_permission'
          ? AndroidInstallStep.needsPermission
          : AndroidInstallStep.installerShown;
    }

    // /FORCECLOSEAPPLICATIONS backstops us in case this process hasn't
    // fully released the exe file lock yet by the time Setup gets there.
    await Process.start(installerFile.path, [
      '/VERYSILENT',
      '/SUPPRESSMSGBOXES',
      '/NORESTART',
      '/FORCECLOSEAPPLICATIONS',
    ], mode: ProcessStartMode.detached);

    exit(0);
  }

  /// Compares dotted `major.minor.patch[...]` versions, ignoring any
  /// `+build` suffix (that's Flutter's build number, not a semantic
  /// version component). Missing trailing parts count as 0.
  bool _isNewer(String remote, String current) {
    final r = remote.split('+').first.split('.').map(_toInt).toList();
    final c = current.split('+').first.split('.').map(_toInt).toList();
    for (var i = 0; i < r.length || i < c.length; i++) {
      final rv = i < r.length ? r[i] : 0;
      final cv = i < c.length ? c[i] : 0;
      if (rv != cv) return rv > cv;
    }
    return false;
  }

  int _toInt(String s) => int.tryParse(s) ?? 0;
}
