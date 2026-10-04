import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_themes.dart';
import 'themed_background.dart';

/// 以前登入頁／首頁用的漸層底。2026-10-05 起每套風格有自己的背景圖
/// （ThemedBackground 鋪在每一頁底下），這些漸層改成透明，讓背景圖透出來。
abstract final class AppGradients {
  static const _clear = LinearGradient(colors: [Colors.transparent, Colors.transparent]);

  static LinearGradient dawn(Brightness brightness) => _clear;

  static LinearGradient homecoming(Brightness brightness) => _clear;

  static const dusk = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFE8A374), Color(0xFF8C7192)],
  );
}

abstract final class AppTheme {
  static ThemeData fromSpec(AppThemeSpec spec) {
    final dark = spec.brightness == Brightness.dark;
    final scheme = ColorScheme(
      brightness: spec.brightness,
      primary: spec.primary,
      onPrimary: spec.onPrimary,
      secondary: spec.accent,
      onSecondary: dark ? spec.ground : const Color(0xFFFFFFFF),
      error: dark ? const Color(0xFFE08A72) : const Color(0xFFB3543F),
      onError: dark ? const Color(0xFF2B1208) : const Color(0xFFFFFFFF),
      surface: spec.ground,
      onSurface: spec.text,
      onSurfaceVariant: spec.sub,
      surfaceContainerHighest: spec.panel,
      outline: spec.border,
    );
    final buttonShape = RoundedRectangleBorder(borderRadius: spec.buttonBorderRadius);
    final fieldRadius = BorderRadius.circular(spec.buttonRadius >= 999 ? 16 : spec.buttonRadius);

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      // 透明：每一頁底下的 ThemedBackground（背景圖）才看得到
      scaffoldBackgroundColor: Colors.transparent,
      canvasColor: spec.ground,
      textTheme: _textTheme(spec, scheme),
      extensions: [AppThemeSpecExt(spec)],
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: ThemedPageTransitionsBuilder(),
          TargetPlatform.windows: ThemedPageTransitionsBuilder(),
          TargetPlatform.iOS: ThemedPageTransitionsBuilder(),
          TargetPlatform.macOS: ThemedPageTransitionsBuilder(),
          TargetPlatform.linux: ThemedPageTransitionsBuilder(),
        },
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: spec.card,
        surfaceTintColor: Colors.transparent,
        foregroundColor: spec.text,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.getFont(spec.headFont, fontSize: 20, fontWeight: FontWeight.w700, color: spec.text),
      ),
      cardTheme: CardThemeData(
        color: spec.card,
        elevation: dark ? 0 : 1.5,
        shadowColor: spec.primary.withValues(alpha: 0.14),
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(spec.cardRadius),
          side: BorderSide(color: spec.border),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: buttonShape,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(shape: buttonShape, side: BorderSide(color: spec.primary)),
      ),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(shape: buttonShape)),
      elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(shape: buttonShape)),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: spec.primary,
        foregroundColor: spec.onPrimary,
        shape: buttonShape,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: spec.chipBg,
        side: BorderSide(color: spec.chipLine ?? spec.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(spec.chipRadius >= 999 ? 999 : spec.chipRadius)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: spec.card,
        border: OutlineInputBorder(borderRadius: fieldRadius, borderSide: BorderSide(color: spec.border)),
        enabledBorder: OutlineInputBorder(borderRadius: fieldRadius, borderSide: BorderSide(color: spec.border)),
        focusedBorder: OutlineInputBorder(borderRadius: fieldRadius, borderSide: BorderSide(color: spec.primary, width: 2)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: spec.ground,
        elevation: 3,
        shadowColor: spec.primary.withValues(alpha: 0.18),
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(spec.cardRadius < 12 ? spec.cardRadius : 16)),
      ),
      bottomSheetTheme: BottomSheetThemeData(backgroundColor: spec.ground, surfaceTintColor: Colors.transparent),
      popupMenuTheme: PopupMenuThemeData(color: spec.ground, surfaceTintColor: Colors.transparent),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: spec.card,
        indicatorColor: spec.chipBg,
        selectedIconTheme: IconThemeData(color: spec.primary),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: spec.card,
        indicatorColor: spec.chipBg,
        surfaceTintColor: Colors.transparent,
      ),
      tabBarTheme: TabBarThemeData(labelColor: spec.primary, unselectedLabelColor: spec.sub, indicatorColor: spec.primary),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: spec.primary, linearTrackColor: spec.track),
      dividerTheme: DividerThemeData(color: spec.border),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(spec.cardRadius < 14 ? spec.cardRadius : 14)),
      ),
    );
  }

  /// 標題（headline/title/display）用該風格的標題字體，內文用內文字體。
  /// 行高比 Material 預設寬一點，讀起來比較從容。字體第一次用會從 Google Fonts
  /// 下載後快取；沒網路時先用系統字體。
  static TextTheme _textTheme(AppThemeSpec spec, ColorScheme scheme) {
    final base = ThemeData(colorScheme: scheme, useMaterial3: true).textTheme;
    final body = GoogleFonts.getTextTheme(spec.bodyFont, base);
    TextStyle? head(TextStyle? s, {FontWeight weight = FontWeight.w700}) =>
        s == null ? null : GoogleFonts.getFont(spec.headFont, textStyle: s, fontWeight: weight);
    return body
        .copyWith(
          displayLarge: head(body.displayLarge),
          displayMedium: head(body.displayMedium),
          displaySmall: head(body.displaySmall),
          headlineLarge: head(body.headlineLarge),
          headlineMedium: head(body.headlineMedium)?.copyWith(height: 1.3, letterSpacing: 0.5),
          headlineSmall: head(body.headlineSmall),
          titleLarge: head(body.titleLarge),
          titleMedium: body.titleMedium?.copyWith(height: 1.4, letterSpacing: 0.3, fontWeight: FontWeight.w600),
          bodyMedium: body.bodyMedium?.copyWith(height: 1.6, letterSpacing: 0.2),
          bodyLarge: body.bodyLarge?.copyWith(height: 1.6, letterSpacing: 0.2),
        )
        .apply(bodyColor: spec.text, displayColor: spec.text);
  }
}
