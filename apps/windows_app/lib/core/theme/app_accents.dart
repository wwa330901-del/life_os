import 'package:flutter/material.dart';

/// Low-saturation category tints, used only as icon-chip backgrounds (e.g.
/// distinguishing a personal space from a company one at a glance) — never
/// for text or primary actions, which stay on [ColorScheme.primary]. Same
/// spirit as [AppGradients]: one deliberate warm-toned set rather than
/// arbitrary Material colors, with separate light/dark values so the tint
/// stays legible on both surfaces.
abstract final class AppAccents {
  static const _personalLight = Color(0xFFE8DCEA);
  static const _personalDark = Color(0xFF3A2F3D);
  static const _companyLight = Color(0xFFF6DFC0);
  static const _companyDark = Color(0xFF3F3120);
  static const _calendarLight = Color(0xFFD6E8DE);
  static const _calendarDark = Color(0xFF25382E);

  static Color personal(Brightness brightness) =>
      brightness == Brightness.dark ? _personalDark : _personalLight;

  static Color company(Brightness brightness) =>
      brightness == Brightness.dark ? _companyDark : _companyLight;

  static Color calendar(Brightness brightness) =>
      brightness == Brightness.dark ? _calendarDark : _calendarLight;
}
