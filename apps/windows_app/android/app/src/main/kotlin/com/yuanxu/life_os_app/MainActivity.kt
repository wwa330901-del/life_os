package com.yuanxu.life_os_app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

/// App 內更新（lib/services/update/update_service.dart）：Dart 把 APK 下載到 cacheDir，
/// 這裡叫出系統的安裝畫面。沒上架商店的 App 一定要使用者按「更新」，這是 Android 規定。
/// 第一次會先開「允許安裝不明應用程式」設定頁，允許後回到 App 自動接著叫出安裝畫面。
class MainActivity : FlutterActivity() {
    private var pendingApk: File? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "yuanxu/updater")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "cacheDir" -> result.success(cacheDir.absolutePath)
                    "installApk" -> {
                        val path = call.argument<String>("path")
                        if (path == null) {
                            result.error("bad_args", "缺少 APK 路徑", null)
                            return@setMethodCallHandler
                        }
                        val apk = File(path)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                            !packageManager.canRequestPackageInstalls()
                        ) {
                            pendingApk = apk
                            @Suppress("DEPRECATION")
                            startActivityForResult(
                                Intent(
                                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:$packageName"),
                                ),
                                REQUEST_INSTALL_PERMISSION,
                            )
                            result.success("needs_permission")
                        } else {
                            launchInstaller(apk)
                            result.success("launched")
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    @Deprecated("FlutterActivity 不是 ComponentActivity，沒有 Activity Result API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_INSTALL_PERMISSION) return
        val apk = pendingApk ?: return
        pendingApk = null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()) {
            launchInstaller(apk)
        }
    }

    private fun launchInstaller(apk: File) {
        val uri = FileProvider.getUriForFile(this, "$packageName.updates", apk)
        startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    companion object {
        private const val REQUEST_INSTALL_PERMISSION = 4201
    }
}
