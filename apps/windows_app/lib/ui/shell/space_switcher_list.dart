import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../core/theme/app_accents.dart';
import '../../state/knowledge_provider.dart';
import '../../state/space_provider.dart';

/// The flat list of "places you can jump straight to" — every space the
/// user belongs to, 知識庫 (account-level, not a Space), and 回首頁 — shown
/// identically in [AppSidebar] (inside a space) and [KnowledgeShell]'s own
/// sidebar, so switching between any of them never requires detouring back
/// through the home screen first. Exactly one of [selectedSpaceId] /
/// [knowledgeSelected] should reflect the current screen; both can be
/// false/null while on the home screen itself.
class SpaceSwitcherList extends ConsumerWidget {
  const SpaceSwitcherList({super.key, this.selectedSpaceId, this.knowledgeSelected = false});

  final String? selectedSpaceId;
  final bool knowledgeSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final spaces = ref.watch(mySpacesProvider).value ?? const [];

    void goToSpace(SpaceSummary target) {
      ref.read(showKnowledgeLibraryProvider.notifier).close();
      ref.read(selectedSpaceProvider.notifier).select(target);
    }

    return Column(
      children: [
        for (final s in spaces)
          _SpaceRow(space: s, selected: s.id == selectedSpaceId, onTap: s.id == selectedSpaceId ? null : () => goToSpace(s)),
        _SpaceRow.knowledge(
          selected: knowledgeSelected,
          onTap: knowledgeSelected ? null : () => ref.read(showKnowledgeLibraryProvider.notifier).open(),
        ),
        _SpaceRow.home(
          onTap: () {
            ref.read(showKnowledgeLibraryProvider.notifier).close();
            ref.read(selectedSpaceProvider.notifier).clear();
          },
        ),
      ],
    );
  }
}

/// One row of the flat switcher list. Mirrors the old single-row "current
/// space" styling (colored type badge + name) so switching spaces looks the
/// same as before, just without needing a click to reveal the other options
/// first.
class _SpaceRow extends StatelessWidget {
  const _SpaceRow({required this.space, required this.selected, required this.onTap}) : _isKnowledge = false;

  const _SpaceRow.home({required this.onTap})
    : space = null,
      selected = false,
      _isKnowledge = false;

  const _SpaceRow.knowledge({required this.selected, required this.onTap})
    : space = null,
      _isKnowledge = true;

  final SpaceSummary? space;
  final bool selected;
  final VoidCallback? onTap;
  final bool _isKnowledge;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = space;
    final tint = s != null
        ? switch (s.type) {
            SpaceType.personal => AppAccents.personal(scheme.brightness),
            SpaceType.calendar => AppAccents.calendar(scheme.brightness),
            SpaceType.company => AppAccents.company(scheme.brightness),
          }
        : _isKnowledge
        ? AppAccents.knowledge(scheme.brightness)
        : scheme.onSurface.withValues(alpha: 0.12);
    final icon = s != null
        ? switch (s.type) {
            SpaceType.personal => Icons.person_outline,
            SpaceType.calendar => Icons.calendar_today_outlined,
            SpaceType.company => Icons.apartment,
          }
        : _isKnowledge
        ? Icons.auto_stories_outlined
        : Icons.home_outlined;
    final label = s?.name ?? (_isKnowledge ? '知識庫' : '回首頁');

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
                  label,
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
