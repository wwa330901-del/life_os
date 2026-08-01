import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models/app_user.dart';
import '../../core/theme/app_accents.dart';
import '../../state/auth_provider.dart';
import '../../state/space_provider.dart';
import '../../state/ui_prefs_provider.dart';

const _sidebarWidth = 220.0;
const _railWidth = 14.0;

/// Persistent left navigation for a selected space. Normally pinned open
/// (`_sidebarWidth` wide); the pin button lets the user collapse it to a
/// slim `_railWidth` rail instead, freeing that space for the content pane
/// — hovering the rail pops the full nav back out as a floating overlay
/// (via `Overlay`/`CompositedTransformFollower` so it draws above the
/// content pane instead of being squeezed into the rail's own layout box)
/// without re-pinning it open.
class AppSidebar extends ConsumerStatefulWidget {
  const AppSidebar({
    super.key,
    required this.space,
    required this.onGoToProjects,
    required this.onOpenPropertiesSettings,
    required this.propertiesSettingsSelected,
    required this.onOpenApprovals,
    required this.approvalsSelected,
  });

  final SpaceSummary space;
  final VoidCallback onGoToProjects;
  final VoidCallback onOpenPropertiesSettings;
  final bool propertiesSettingsSelected;
  final VoidCallback onOpenApprovals;
  final bool approvalsSelected;

  @override
  ConsumerState<AppSidebar> createState() => _AppSidebarState();
}

class _AppSidebarState extends ConsumerState<AppSidebar> {
  final _layerLink = LayerLink();
  OverlayEntry? _overlayEntry;
  Timer? _hideTimer;

  @override
  void dispose() {
    _hideTimer?.cancel();
    _overlayEntry?.remove();
    super.dispose();
  }

  void _cancelHide() => _hideTimer?.cancel();

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(milliseconds: 200), _removeOverlay);
  }

  void _removeOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  void _pin() {
    ref.read(sidebarCollapsedProvider.notifier).toggle();
    _removeOverlay();
  }

  void _showFlyout() {
    _cancelHide();
    if (_overlayEntry != null) return;
    final screenHeight = MediaQuery.sizeOf(context).height;
    _overlayEntry = OverlayEntry(
      builder: (context) => CompositedTransformFollower(
        link: _layerLink,
        showWhenUnlinked: false,
        child: MouseRegion(
          onEnter: (_) => _cancelHide(),
          onExit: (_) => _scheduleHide(),
          child: SizedBox(
            width: _sidebarWidth,
            height: screenHeight,
            child: Material(
              elevation: 8,
              child: _SidebarPanel(
                space: widget.space,
                onGoToProjects: widget.onGoToProjects,
                onOpenPropertiesSettings: widget.onOpenPropertiesSettings,
                propertiesSettingsSelected: widget.propertiesSettingsSelected,
                onOpenApprovals: widget.onOpenApprovals,
                approvalsSelected: widget.approvalsSelected,
                collapsed: true,
                onTogglePin: _pin,
              ),
            ),
          ),
        ),
      ),
    );
    Overlay.of(context).insert(_overlayEntry!);
  }

  @override
  Widget build(BuildContext context) {
    final collapsed = ref.watch(sidebarCollapsedProvider);

    if (!collapsed) {
      return SizedBox(
        width: _sidebarWidth,
        child: _SidebarPanel(
          space: widget.space,
          onGoToProjects: widget.onGoToProjects,
          onOpenPropertiesSettings: widget.onOpenPropertiesSettings,
          propertiesSettingsSelected: widget.propertiesSettingsSelected,
          onOpenApprovals: widget.onOpenApprovals,
          approvalsSelected: widget.approvalsSelected,
          collapsed: false,
          onTogglePin: () => ref.read(sidebarCollapsedProvider.notifier).toggle(),
        ),
      );
    }

    final scheme = Theme.of(context).colorScheme;
    return CompositedTransformTarget(
      link: _layerLink,
      child: MouseRegion(
        onEnter: (_) => _showFlyout(),
        onExit: (_) => _scheduleHide(),
        child: Container(
          width: _railWidth,
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
            border: Border(right: BorderSide(color: scheme.outline.withValues(alpha: 0.25))),
          ),
          child: Center(
            child: Icon(Icons.chevron_right, size: 14, color: scheme.onSurface.withValues(alpha: 0.4)),
          ),
        ),
      ),
    );
  }
}

class _SidebarPanel extends ConsumerWidget {
  const _SidebarPanel({
    required this.space,
    required this.onGoToProjects,
    required this.onOpenPropertiesSettings,
    required this.propertiesSettingsSelected,
    required this.onOpenApprovals,
    required this.approvalsSelected,
    required this.collapsed,
    required this.onTogglePin,
  });

  final SpaceSummary space;
  final VoidCallback onGoToProjects;
  final VoidCallback onOpenPropertiesSettings;
  final bool propertiesSettingsSelected;
  final VoidCallback onOpenApprovals;
  final bool approvalsSelected;

  /// Whether this panel is currently rendering as the hover flyout (vs.
  /// pinned open in the normal layout) — only changes the pin button's
  /// icon/tooltip, the nav content itself is identical either way.
  final bool collapsed;
  final VoidCallback onTogglePin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final session = ref.watch(authControllerProvider).value;

    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        border: Border(right: BorderSide(color: scheme.outline.withValues(alpha: 0.25))),
      ),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 8, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '元序',
                      style: Theme.of(
                        context,
                      ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  IconButton(
                    icon: Icon(collapsed ? Icons.push_pin_outlined : Icons.push_pin, size: 16),
                    tooltip: collapsed ? '固定顯示側邊欄' : '隱藏側邊欄（滑鼠靠近可暫時顯示）',
                    visualDensity: VisualDensity.compact,
                    onPressed: onTogglePin,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Column(
                children: [
                  for (final s in ref.watch(mySpacesProvider).value ?? [space])
                    _SpaceRow(
                      space: s,
                      selected: s.id == space.id,
                      onTap: s.id == space.id
                          ? null
                          : () => ref.read(selectedSpaceProvider.notifier).select(s),
                    ),
                  _SpaceRow.home(onTap: () => ref.read(selectedSpaceProvider.notifier).clear()),
                ],
              ),
            ),
            const SizedBox(height: 8),
            if (space.type == SpaceType.company)
              _NavItem(
                icon: Icons.view_timeline_outlined,
                label: '專案管理',
                selected: !propertiesSettingsSelected && !approvalsSelected,
                onTap: onGoToProjects,
              ),
            if (space.type == SpaceType.company)
              _NavItem(
                icon: Icons.fact_check_outlined,
                label: '簽核',
                selected: approvalsSelected,
                onTap: onOpenApprovals,
              ),
            if (space.type == SpaceType.company && (session?.user.isPlatformAdmin ?? false))
              _NavItem(
                icon: Icons.tune,
                label: '專案設定',
                selected: propertiesSettingsSelected,
                onTap: onOpenPropertiesSettings,
              ),
            const Spacer(),
            Divider(height: 1, color: scheme.outline.withValues(alpha: 0.25)),
            _NavItem(
              icon: Icons.person_outline,
              label: session?.user.name ?? '個人設定',
              selected: false,
              onTap: () => _editName(context, ref, session?.user.name ?? ''),
            ),
            _NavItem(
              icon: Icons.logout,
              label: '登出',
              selected: false,
              onTap: () => ref.read(authControllerProvider.notifier).logout(),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Future<void> _editName(BuildContext context, WidgetRef ref, String currentName) async {
    final controller = TextEditingController(text: currentName);
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('個人設定'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: '顯示名稱'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('儲存'),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty || name == currentName || !context.mounted) return;

    try {
      await ref.read(authControllerProvider.notifier).updateName(name);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: Material(
        color: selected ? scheme.primary.withValues(alpha: 0.14) : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            child: Row(
              children: [
                Icon(icon, size: 18, color: selected ? scheme.primary : scheme.onSurface.withValues(alpha: 0.7)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: selected ? scheme.primary : scheme.onSurface.withValues(alpha: 0.85),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One row of the sidebar's flat space list (every space the user belongs
/// to, listed directly — no popup detour) plus the trailing 回首頁 row via
/// [_SpaceRow.home]. Mirrors the old single-row "current space" styling
/// (colored type badge + name) so switching spaces looks the same as
/// before, just without needing a click to reveal the other options first.
class _SpaceRow extends StatelessWidget {
  const _SpaceRow({required this.space, required this.selected, required this.onTap});

  const _SpaceRow.home({required this.onTap})
    : space = null,
      selected = false;

  final SpaceSummary? space;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = space;
    final tint = s == null
        ? scheme.onSurface.withValues(alpha: 0.12)
        : switch (s.type) {
            SpaceType.personal => AppAccents.personal(scheme.brightness),
            SpaceType.calendar => AppAccents.calendar(scheme.brightness),
            SpaceType.company => AppAccents.company(scheme.brightness),
          };
    final icon = s == null
        ? Icons.home_outlined
        : switch (s.type) {
            SpaceType.personal => Icons.person_outline,
            SpaceType.calendar => Icons.calendar_today_outlined,
            SpaceType.company => Icons.apartment,
          };

    return Material(
      color: selected ? scheme.primary.withValues(alpha: 0.14) : Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(color: tint, borderRadius: BorderRadius.circular(8)),
                alignment: Alignment.center,
                child: Icon(icon, size: 16, color: scheme.onSurface),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  s?.name ?? '回首頁',
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    fontSize: 13,
                    color: selected ? scheme.primary : scheme.onSurface,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
