import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

/// A newer release found on GitHub, with what's needed to show it to the
/// user and let them get it.
class UpdateInfo {
  const UpdateInfo({
    required this.version,
    required this.releaseNotes,
    required this.releaseUrl,
    required this.installerDownloadUrl,
  });

  final String version;
  final String releaseNotes;
  final String releaseUrl;
  final String? installerDownloadUrl;
}

/// Checks GitHub Releases for a newer build than the one currently running,
/// and can silently download + install it in place.
///
/// Relies on every shipped update being tagged as a GitHub Release named
/// `vX.Y.Z` matching `pubspec.yaml`'s `version:`, with the Inno Setup
/// installer `.exe` attached as a release asset — see
/// `installer/life_os.iss`.
class UpdateService {
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

      final assets = (json['assets'] as List?) ?? const [];
      String? downloadUrl;
      for (final asset in assets) {
        final name = asset['name'] as String? ?? '';
        if (name.endsWith('.exe')) {
          downloadUrl = asset['browser_download_url'] as String?;
          break;
        }
      }

      return UpdateInfo(
        version: remoteVersion,
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
  ///
  /// Throws [StateError] if there's no installer asset or the download
  /// fails; callers should fall back to opening [UpdateInfo.releaseUrl].
  Future<void> downloadAndInstall(
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
    final tempDir = Directory.systemTemp.createTempSync('life_os_update_');
    final installerFile = File('${tempDir.path}${Platform.pathSeparator}life_os_setup.exe');
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
