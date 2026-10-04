import 'package:flutter/material.dart';

/// 10 套外觀風格（2026-10-05 使用者逐套確認過，提案板：元序 品牌視覺提案）。
/// 每套不只換顏色：字體、卡片／按鈕圓角、背景圖都不同。背景圖在
/// `assets/themes/{id}.jpg`，由 tools/theme-backgrounds 程式產生（寫實但淡化）。
/// id 要跟後端 auth/dto/update-me.dto.ts 的 APP_THEME_IDS 一致。
class AppThemeSpec {
  const AppThemeSpec({
    required this.id,
    required this.name,
    required this.description,
    required this.brightness,
    required this.ground,
    required this.panel,
    required this.text,
    required this.sub,
    required this.primary,
    required this.onPrimary,
    required this.accent,
    required this.card,
    required this.border,
    required this.track,
    required this.chipBg,
    this.chipLine,
    required this.headFont,
    required this.bodyFont,
    required this.cardRadius,
    required this.buttonRadius,
    required this.chipRadius,
  });

  final String id;
  final String name;
  final String description;
  final Brightness brightness;

  /// 底色（背景圖還沒載入時、或淡化的目標色）
  final Color ground;

  /// 次要底色（標籤、側欄）
  final Color panel;
  final Color text;

  /// 次要文字
  final Color sub;
  final Color primary;
  final Color onPrimary;

  /// 點綴色（進度條、第二強調）
  final Color accent;

  /// 卡片：半透明，讓背景圖透一點出來
  final Color card;
  final Color border;
  final Color track;

  /// 功能圖示底色
  final Color chipBg;

  /// 有值＝功能圖示是白底描邊（留白與朱印）
  final Color? chipLine;

  /// Google Fonts 字族名稱
  final String headFont;
  final String bodyFont;
  final double cardRadius;

  /// 999＝膠囊形
  final double buttonRadius;
  final double chipRadius;

  String get backgroundAsset => 'assets/themes/$id.jpg';

  BorderRadius get buttonBorderRadius => BorderRadius.circular(buttonRadius >= 999 ? 999 : buttonRadius);
}

const _serif = 'Noto Serif TC';
const _sans = 'Noto Sans TC';
const _kai = 'LXGW WenKai TC';
const _round = 'Huninn';
const _geo = 'Chocolate Classical Sans';

const appThemes = <AppThemeSpec>[
  AppThemeSpec(
    id: 'dawn', name: '晨光', description: '米白配暖橘，像清晨的陽光', brightness: Brightness.light,
    ground: Color(0xFFFBF5EC), panel: Color(0xFFF3E8D6), text: Color(0xFF3D362C), sub: Color(0xFF6B5D4C),
    primary: Color(0xFFA65A22), onPrimary: Color(0xFFFFFFFF), accent: Color(0xFFC98A4E),
    card: Color(0xD6FFFFFF), border: Color(0xFFEADFCB), track: Color(0xFFF0E3CE), chipBg: Color(0xFFF2DFC8),
    headFont: _serif, bodyFont: _sans, cardRadius: 18, buttonRadius: 14, chipRadius: 12,
  ),
  AppThemeSpec(
    id: 'ink-gold', name: '墨與金', description: '深墨色底、低調的金色', brightness: Brightness.dark,
    ground: Color(0xFF16140F), panel: Color(0xFF221F19), text: Color(0xFFEDE3D3), sub: Color(0xFFA89A82),
    primary: Color(0xFFD4A657), onPrimary: Color(0xFF16140F), accent: Color(0xFF9C7B45),
    card: Color(0xDB1D1A15), border: Color(0xFF3A342A), track: Color(0xFF2E2922), chipBg: Color(0xFF2E271C),
    headFont: _serif, bodyFont: _sans, cardRadius: 14, buttonRadius: 10, chipRadius: 10,
  ),
  AppThemeSpec(
    id: 'paper', name: '留白與朱印', description: '宣紙白、墨黑，只有一點朱紅', brightness: Brightness.light,
    ground: Color(0xFFF7F4EE), panel: Color(0xFFEFEAE0), text: Color(0xFF1E1E1C), sub: Color(0xFF6B675F),
    primary: Color(0xFFB23A2B), onPrimary: Color(0xFFFFFFFF), accent: Color(0xFF1E1E1C),
    card: Color(0xE0FFFFFF), border: Color(0xFFE2DDD3), track: Color(0xFFECE7DD), chipBg: Color(0xFFFFFFFF),
    chipLine: Color(0xFF1E1E1C),
    headFont: _serif, bodyFont: _sans, cardRadius: 6, buttonRadius: 4, chipRadius: 4,
  ),
  AppThemeSpec(
    id: 'forest', name: '森林', description: '苔綠和木頭色，晨霧森林', brightness: Brightness.light,
    ground: Color(0xFFEEF2E8), panel: Color(0xFFDFE7D6), text: Color(0xFF22301F), sub: Color(0xFF536250),
    primary: Color(0xFF3F6B3A), onPrimary: Color(0xFFFFFFFF), accent: Color(0xFFA7793F),
    card: Color(0xDBFFFFFF), border: Color(0xFFCFDAC4), track: Color(0xFFDCE5D2), chipBg: Color(0xFFDCE8D3),
    headFont: _kai, bodyFont: _sans, cardRadius: 20, buttonRadius: 999, chipRadius: 999,
  ),
  AppThemeSpec(
    id: 'ocean', name: '海洋', description: '淺海到深海藍，點綴珊瑚橘', brightness: Brightness.light,
    ground: Color(0xFFE6F0F3), panel: Color(0xFFD3E5EB), text: Color(0xFF12313F), sub: Color(0xFF4A6875),
    primary: Color(0xFF1F5F7A), onPrimary: Color(0xFFFFFFFF), accent: Color(0xFFE0875A),
    card: Color(0xDBFFFFFF), border: Color(0xFFC4DCE4), track: Color(0xFFD6E7EC), chipBg: Color(0xFFD3E7EE),
    headFont: _sans, bodyFont: _sans, cardRadius: 22, buttonRadius: 14, chipRadius: 14,
  ),
  AppThemeSpec(
    id: 'sakura', name: '櫻花', description: '櫻花粉配嫩葉綠，溫柔不甜膩', brightness: Brightness.light,
    ground: Color(0xFFFDF4F5), panel: Color(0xFFF8E4E7), text: Color(0xFF4A2E33), sub: Color(0xFF8A6268),
    primary: Color(0xFFB8506A), onPrimary: Color(0xFFFFFFFF), accent: Color(0xFF7E9C7B),
    card: Color(0xDEFFFFFF), border: Color(0xFFF1D3D8), track: Color(0xFFF6E0E4), chipBg: Color(0xFFFBE3E8),
    headFont: _kai, bodyFont: _sans, cardRadius: 24, buttonRadius: 999, chipRadius: 999,
  ),
  AppThemeSpec(
    id: 'night', name: '星空', description: '深夜藍配月光黃，看得到銀河', brightness: Brightness.dark,
    ground: Color(0xFF141A33), panel: Color(0xFF1E2547), text: Color(0xFFE8EBFF), sub: Color(0xFFA3ABD6),
    primary: Color(0xFF9DB0FF), onPrimary: Color(0xFF141A33), accent: Color(0xFFF2E6C4),
    card: Color(0xD61E2547), border: Color(0xFF343E6E), track: Color(0xFF2A3260), chipBg: Color(0xFF2A3260),
    headFont: _serif, bodyFont: _sans, cardRadius: 18, buttonRadius: 14, chipRadius: 12,
  ),
  AppThemeSpec(
    id: 'nordic', name: '北歐簡約', description: '淺灰白配沉穩的藍，方正俐落', brightness: Brightness.light,
    ground: Color(0xFFF4F5F7), panel: Color(0xFFFFFFFF), text: Color(0xFF1F2430), sub: Color(0xFF5D6472),
    primary: Color(0xFF3E63B8), onPrimary: Color(0xFFFFFFFF), accent: Color(0xFFE2A33B),
    card: Color(0xEDFFFFFF), border: Color(0xFFDADDE3), track: Color(0xFFE6E9EE), chipBg: Color(0xFFE3E8F2),
    headFont: _geo, bodyFont: _sans, cardRadius: 8, buttonRadius: 8, chipRadius: 8,
  ),
  AppThemeSpec(
    id: 'retro', name: '復古', description: '芥末黃、鐵鏽紅、橄欖綠', brightness: Brightness.light,
    ground: Color(0xFFF5EBD7), panel: Color(0xFFEDDDBE), text: Color(0xFF3B2A1A), sub: Color(0xFF6F5A43),
    primary: Color(0xFFA8441F), onPrimary: Color(0xFFFFFFFF), accent: Color(0xFF6E7340),
    card: Color(0xE6FFFAF0), border: Color(0xFFDCC7A0), track: Color(0xFFE8D7B4), chipBg: Color(0xFFF0D9A8),
    headFont: _serif, bodyFont: _sans, cardRadius: 12, buttonRadius: 12, chipRadius: 10,
  ),
  AppThemeSpec(
    id: 'candy', name: '馬卡龍', description: '粉橘、薄荷、淡紫，字體圓圓的', brightness: Brightness.light,
    ground: Color(0xFFFFF8F1), panel: Color(0xFFFFEFE6), text: Color(0xFF4A3B47), sub: Color(0xFF7D6A78),
    primary: Color(0xFFB4507A), onPrimary: Color(0xFFFFFFFF), accent: Color(0xFF3E9479),
    card: Color(0xE0FFFFFF), border: Color(0xFFF3E1D8), track: Color(0xFFF7E8E0), chipBg: Color(0xFFFFE3D8),
    headFont: _round, bodyFont: _round, cardRadius: 26, buttonRadius: 999, chipRadius: 999,
  ),
];

const defaultThemeId = 'dawn';

AppThemeSpec themeById(String? id) =>
    appThemes.firstWhere((t) => t.id == id, orElse: () => appThemes.first);

/// 讓畫面元件拿得到目前風格的細節（功能圖示底色、背景圖…），
/// ColorScheme 放不下的都在這裡：`Theme.of(context).extension<AppThemeSpecExt>()!.spec`
class AppThemeSpecExt extends ThemeExtension<AppThemeSpecExt> {
  const AppThemeSpecExt(this.spec);

  final AppThemeSpec spec;

  @override
  AppThemeSpecExt copyWith({AppThemeSpec? spec}) => AppThemeSpecExt(spec ?? this.spec);

  @override
  AppThemeSpecExt lerp(ThemeExtension<AppThemeSpecExt>? other, double t) =>
      t < 0.5 ? this : (other as AppThemeSpecExt? ?? this);
}

extension AppThemeSpecContext on BuildContext {
  AppThemeSpec get themeSpec => Theme.of(this).extension<AppThemeSpecExt>()?.spec ?? appThemes.first;
}
