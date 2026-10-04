import 'package:flutter/material.dart';

import 'app_themes.dart';

/// 目前風格的背景圖，鋪滿整頁、放在內容底下。圖是橫的風景，
/// 對齊底部，平板直著拿時裁掉左右、山和地平線還在。
class ThemedBackground extends StatelessWidget {
  const ThemedBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final spec = context.themeSpec;
    return Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(color: spec.ground),
        Image.asset(
          spec.backgroundAsset,
          fit: BoxFit.cover,
          alignment: Alignment.bottomCenter,
          gaplessPlayback: true,
          errorBuilder: (_, _, _) => const SizedBox.shrink(),
        ),
        child,
      ],
    );
  }
}

/// 每一頁（MaterialPageRoute）都墊一層背景圖，再用平台預設的轉場動畫。
/// 背景放在「頁」裡而不是整個 App 底下：Scaffold 是透明的，
/// 如果背景只有一層，換頁動畫時新舊兩頁的內容會疊在一起。
class ThemedPageTransitionsBuilder extends PageTransitionsBuilder {
  const ThemedPageTransitionsBuilder();

  static const _inner = ZoomPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    return _inner.buildTransitions(route, context, animation, secondaryAnimation, ThemedBackground(child: child));
  }
}
