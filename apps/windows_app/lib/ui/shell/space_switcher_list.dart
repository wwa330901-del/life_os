import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../core/theme/app_accents.dart';
import '../../state/ai_assistant_provider.dart';
import '../../state/knowledge_provider.dart';
import '../../state/space_provider.dart';
import '../../state/todo_provider.dart';

/// The flat list of "places you can jump straight to" — every space the
/// user belongs to, 知識庫/代辦事項/AI 問答 (all account-level, not a Space),
/// and 回首頁 — shown identically in [AppSidebar] (inside a space),
/// [KnowledgeShell]'s own sidebar, [TodoShell]'s own sidebar, and
/// `AiAssistantShell`'s own sidebar, so switching between any of them never
/// requires detouring back through the home screen first. Exactly one of
/// [selectedSpaceId] / [knowledgeSelected] / [todoSelected] /
/// [aiAssistantSelected] should reflect the current screen; all can be
/// false/null while on the home screen itself.
class SpaceSwitcherList extends ConsumerWidget {
  const SpaceSwitcherList({
    super.key,
    this.selectedSpaceId,
    this.knowledgeSelected = false,
    this.todoSelected = false,
    this.aiAssistantSelected = false,
  });

  final String? selectedSpaceId;
  final bool knowledgeSelected;
  final bool todoSelected;
  final bool aiAssistantSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final spaces = ref.watch(mySpacesProvider).value ?? const [];

    void closeAllNonSpace() {
      ref.read(showKnowledgeLibraryProvider.notifier).close();
      ref.read(showTodoSpaceProvider.notifier).close();
      ref.read(showAiAssistantProvider.notifier).close();
    }

    void goToSpace(SpaceSummary target) {
      closeAllNonSpace();
      ref.read(selectedSpaceProvider.notifier).select(target);
    }

    return Column(
      children: [
        for (final s in spaces)
          _SpaceRow(space: s, selected: s.id == selectedSpaceId, onTap: s.id == selectedSpaceId ? null : () => goToSpace(s)),
        _SpaceRow.knowledge(
          selected: knowledgeSelected,
          onTap: knowledgeSelected
              ? null
              : () {
                  closeAllNonSpace();
                  ref.read(selectedSpaceProvider.notifier).clear();
                  ref.read(showKnowledgeLibraryProvider.notifier).open();
                },
        ),
        _SpaceRow.todo(
          selected: todoSelected,
          onTap: todoSelected
              ? null
              : () {
                  closeAllNonSpace();
                  ref.read(selectedSpaceProvider.notifier).clear();
                  ref.read(showTodoSpaceProvider.notifier).open();
                },
        ),
        _SpaceRow.aiAssistant(
          selected: aiAssistantSelected,
          onTap: aiAssistantSelected
              ? null
              : () {
                  closeAllNonSpace();
                  ref.read(selectedSpaceProvider.notifier).clear();
                  ref.read(showAiAssistantProvider.notifier).open();
                },
        ),
        _SpaceRow.home(
          onTap: () {
            closeAllNonSpace();
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
enum _NonSpaceKind { none, knowledge, todo, aiAssistant }

class _SpaceRow extends StatelessWidget {
  const _SpaceRow({required this.space, required this.selected, required this.onTap})
    : _kind = _NonSpaceKind.none;

  const _SpaceRow.home({required this.onTap})
    : space = null,
      selected = false,
      _kind = _NonSpaceKind.none;

  const _SpaceRow.knowledge({required this.selected, required this.onTap})
    : space = null,
      _kind = _NonSpaceKind.knowledge;

  const _SpaceRow.todo({required this.selected, required this.onTap})
    : space = null,
      _kind = _NonSpaceKind.todo;

  const _SpaceRow.aiAssistant({required this.selected, required this.onTap})
    : space = null,
      _kind = _NonSpaceKind.aiAssistant;

  final SpaceSummary? space;
  final bool selected;
  final VoidCallback? onTap;
  final _NonSpaceKind _kind;

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
        : switch (_kind) {
            _NonSpaceKind.knowledge => AppAccents.knowledge(scheme.brightness),
            _NonSpaceKind.todo => AppAccents.todo(scheme.brightness),
            _NonSpaceKind.aiAssistant => AppAccents.aiAssistant(scheme.brightness),
            _NonSpaceKind.none => scheme.onSurface.withValues(alpha: 0.12),
          };
    final icon = s != null
        ? switch (s.type) {
            SpaceType.personal => Icons.person_outline,
            SpaceType.calendar => Icons.calendar_today_outlined,
            SpaceType.company => Icons.apartment,
          }
        : switch (_kind) {
            _NonSpaceKind.knowledge => Icons.auto_stories_outlined,
            _NonSpaceKind.todo => Icons.checklist_outlined,
            _NonSpaceKind.aiAssistant => Icons.smart_toy_outlined,
            _NonSpaceKind.none => Icons.home_outlined,
          };
    final label =
        s?.name ??
        switch (_kind) {
          _NonSpaceKind.knowledge => '知識庫',
          _NonSpaceKind.todo => '代辦事項',
          _NonSpaceKind.aiAssistant => 'AI 問答',
          _NonSpaceKind.none => '回首頁',
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
