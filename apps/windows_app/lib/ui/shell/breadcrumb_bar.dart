import 'package:flutter/material.dart';

/// One crumb in a [BreadcrumbBar]. Tappable segments (everything but the
/// current page) carry [onTap]; the last segment is always plain text.
class BreadcrumbSegment {
  const BreadcrumbSegment(this.label, {this.onTap});

  final String label;
  final VoidCallback? onTap;
}

/// Shared top strip for shell content panes: `境為 / 專案管理 / {專案名稱}`
/// style wayfinding plus a right-aligned action slot (e.g. "＋ 新增專案"),
/// replacing each screen's own `AppBar` now that the sidebar owns the outer
/// chrome.
class BreadcrumbBar extends StatelessWidget {
  const BreadcrumbBar({super.key, required this.segments, this.actions = const []});

  final List<BreadcrumbSegment> segments;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: scheme.outline.withValues(alpha: 0.25))),
      ),
      child: Row(
        children: [
          for (var i = 0; i < segments.length; i++) ...[
            if (i > 0)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Icon(Icons.chevron_right, size: 16, color: scheme.onSurface.withValues(alpha: 0.35)),
              ),
            _Crumb(segment: segments[i], isCurrent: i == segments.length - 1),
          ],
          const Spacer(),
          for (final action in actions) Padding(padding: const EdgeInsets.only(left: 8), child: action),
        ],
      ),
    );
  }
}

class _Crumb extends StatelessWidget {
  const _Crumb({required this.segment, required this.isCurrent});

  final BreadcrumbSegment segment;
  final bool isCurrent;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final style = TextStyle(
      fontSize: 14,
      fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w500,
      color: isCurrent ? scheme.onSurface : scheme.onSurface.withValues(alpha: 0.6),
    );
    if (segment.onTap == null) return Text(segment.label, style: style);
    return InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: segment.onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
        child: Text(segment.label, style: style),
      ),
    );
  }
}
