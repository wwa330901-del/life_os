import 'package:flutter/material.dart';

import 'app_themes.dart';

/// 功能圖示（各空間、模組卡片上的小圖示）的底色。2026-10-05 起跟著外觀風格走：
/// 確認過的 10 套設計裡，同一套的功能圖示都用同一個底色（靠圖示本身區分），
/// 不再每個功能各一個顏色。app.dart 換風格時會更新 [spec]。
abstract final class AppAccents {
  static AppThemeSpec spec = appThemes.first;

  static Color _chip(Brightness _) => spec.chipBg;

  static Color trips(Brightness brightness) => _chip(brightness);
  static Color divination(Brightness brightness) => _chip(brightness);
  static Color journal(Brightness brightness) => _chip(brightness);
  static Color personal(Brightness brightness) => _chip(brightness);
  static Color calendar(Brightness brightness) => _chip(brightness);
  static Color knowledge(Brightness brightness) => _chip(brightness);
  static Color todo(Brightness brightness) => _chip(brightness);
  static Color aiAssistant(Brightness brightness) => _chip(brightness);
  static Color lifeGoals(Brightness brightness) => _chip(brightness);
}
