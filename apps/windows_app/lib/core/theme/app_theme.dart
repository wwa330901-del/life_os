import 'package:flutter/material.dart';

/// Visual language for 元序 (formerly life_os) — one warm, natural-light
/// palette rather than four switchable themes. Named after the day's arc
/// each gradient originally drew from (dawn / homecoming / dusk); the
/// wording is no longer surfaced as text in the UI, just the color mood.
abstract final class AppGradients {
  /// Soft dawn light breaking. Used behind the login screen, the entry
  /// point of the whole app.
  static const dawn = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFFFCE6C6), Color(0xFFFBF5EC)],
  );

  /// Warm homecoming glow. Used behind the home screen header, the
  /// "arrival" moment after choosing a space.
  static const homecoming = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF0C29C), Color(0xFFFBF5EC)],
  );

  /// Dusk glow, reserved for moments of moving deeper into the app (module
  /// navigation, primary calls to action further down the line).
  static const dusk = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFE8A374), Color(0xFF8C7192)],
  );
}

abstract final class AppTheme {
  static ThemeData light() => _theme(_lightScheme);
  static ThemeData dark() => _theme(_darkScheme);

  static const _lightScheme = ColorScheme(
    brightness: Brightness.light,
    primary: Color(0xFFC97B3D),
    onPrimary: Color(0xFFFFFFFF),
    secondary: Color(0xFF8C6E54),
    onSecondary: Color(0xFFFFFFFF),
    error: Color(0xFFB3543F),
    onError: Color(0xFFFFFFFF),
    surface: Color(0xFFFBF5EC),
    onSurface: Color(0xFF3D362C),
    surfaceContainerHighest: Color(0xFFF0E6D5),
    outline: Color(0xFFD8C8B0),
  );

  static const _darkScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFFE0A868),
    onPrimary: Color(0xFF2B1B08),
    secondary: Color(0xFFC9A688),
    onSecondary: Color(0xFF2B1B08),
    error: Color(0xFFE08A72),
    onError: Color(0xFF2B1208),
    surface: Color(0xFF201C17),
    onSurface: Color(0xFFEDE3D3),
    surfaceContainerHighest: Color(0xFF2C2620),
    outline: Color(0xFF4A4038),
  );

  static ThemeData _theme(ColorScheme scheme) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      textTheme: _textTheme(scheme),
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: scheme.surfaceContainerHighest,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: scheme.outline.withValues(alpha: 0.4)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: scheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: scheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: scheme.primary, width: 2),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }

  /// Slightly more generous line-height and softer weights than Material's
  /// defaults — a calmer, unhurried reading rhythm (等待而休), rather than
  /// pulling in a new bundled font.
  static TextTheme _textTheme(ColorScheme scheme) {
    final base = ThemeData(colorScheme: scheme, useMaterial3: true).textTheme;
    return base
        .copyWith(
          headlineMedium: base.headlineMedium?.copyWith(
            fontWeight: FontWeight.w600,
            height: 1.3,
            letterSpacing: 0.5,
          ),
          titleMedium: base.titleMedium?.copyWith(height: 1.4, letterSpacing: 0.3),
          bodyMedium: base.bodyMedium?.copyWith(height: 1.6, letterSpacing: 0.2),
          bodyLarge: base.bodyLarge?.copyWith(height: 1.6, letterSpacing: 0.2),
        )
        .apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface);
  }
}
