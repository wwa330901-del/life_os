import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/project.dart';
import '../../../../core/models/project_property.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/project_editor_provider.dart';
import '../../../../state/project_properties_provider.dart';

/// 專案資料 tab: loops over this space's own property definitions (Notion-
/// database-style, set up via the space's 專案設定 screen) and renders one
/// editable field per definition — a space with no properties defined just
/// shows 簽約日期 and nothing else. Replaces what used to be a hardcoded
/// 類型/狀態/業主名稱/專案地點/案號 form.
class ProjectInfoTab extends ConsumerStatefulWidget {
  const ProjectInfoTab({super.key, required this.projectId});

  final String projectId;

  @override
  ConsumerState<ProjectInfoTab> createState() => _ProjectInfoTabState();
}

/// Property names now backed by a fixed `Project` column instead of a
/// generic property — reserved so a space can no longer create/keep a
/// same-named custom property that would render as a confusing duplicate
/// next to the fixed field below.
const _reservedPropertyNames = {'簽約日期', '預計結案日'};

class _ProjectInfoTabState extends ConsumerState<ProjectInfoTab> {
  final Map<String, TextEditingController> _textControllers = {};
  final Map<String, FocusNode> _focusNodes = {};
  Project? _lastKnownProject;

  late final TextEditingController _nameController;
  final FocusNode _nameFocusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _nameFocusNode.addListener(_commitNameOnBlur);
  }

  @override
  void dispose() {
    for (final controller in _textControllers.values) {
      controller.dispose();
    }
    for (final focus in _focusNodes.values) {
      focus.dispose();
    }
    _nameController.dispose();
    _nameFocusNode.dispose();
    super.dispose();
  }

  void _commitNameOnBlur() {
    if (_nameFocusNode.hasFocus) return;
    final project = _lastKnownProject;
    if (project == null) return;
    final text = _nameController.text.trim();
    if (text.isEmpty || text == project.name) {
      _nameController.text = project.name;
      return;
    }
    _run(
      () => ref
          .read(apiClientProvider)
          .updateProject(projectId: widget.projectId, name: text),
    );
  }

  void _ensureControllerFor(String definitionId) {
    if (_textControllers.containsKey(definitionId)) return;
    final controller = TextEditingController();
    final focus = FocusNode();
    focus.addListener(() => _commitOnBlur(definitionId, focus, controller));
    _textControllers[definitionId] = controller;
    _focusNodes[definitionId] = focus;
  }

  void _syncControllers(Project project, List<PropertyDefinition> definitions) {
    if (identical(project, _lastKnownProject)) return;
    _lastKnownProject = project;
    if (!_nameFocusNode.hasFocus) _nameController.text = project.name;
    for (final definition in definitions) {
      if (definition.type != PropertyType.text && definition.type != PropertyType.number) continue;
      final focus = _focusNodes[definition.id];
      if (focus != null && focus.hasFocus) continue;
      _textControllers[definition.id]?.text = project.propertyValue(definition.id)?.displayValue ?? '';
    }
  }

  void _commitOnBlur(String definitionId, FocusNode node, TextEditingController controller) {
    if (node.hasFocus) return;
    final project = _lastKnownProject;
    if (project == null) return;
    final current = project.propertyValue(definitionId)?.displayValue ?? '';
    final text = controller.text.trim();
    if (text == current) return;
    final definition = _definitionOf(definitionId);
    if (definition == null) return;
    if (definition.type == PropertyType.number) {
      final number = double.tryParse(text);
      if (number == null) return;
      _savePropertyValue(definitionId, number);
    } else {
      _savePropertyValue(definitionId, text);
    }
  }

  List<PropertyDefinition> _definitions = const [];

  PropertyDefinition? _definitionOf(String definitionId) {
    for (final definition in _definitions) {
      if (definition.id == definitionId) return definition;
    }
    return null;
  }

  Future<void> _run(Future<void> Function() action) async {
    try {
      await action();
      ref.invalidate(projectEditorProvider(widget.projectId));
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  void _savePropertyValue(String definitionId, Object value) {
    _run(
      () => ref
          .read(apiClientProvider)
          .updateProject(
            projectId: widget.projectId,
            propertyValues: [PropertyValueInput(definitionId: definitionId, value: value)],
          ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final editorAsync = ref.watch(projectEditorProvider(widget.projectId));

    return editorAsync.when(
      data: (editor) {
        final propertiesAsync = ref.watch(spacePropertiesProvider(editor.project.spaceId));
        return propertiesAsync.when(
          data: (allDefinitions) {
            final definitions = allDefinitions
                .where((d) => !_reservedPropertyNames.contains(d.name))
                .toList();
            _definitions = definitions;
            for (final definition in definitions) {
              _ensureControllerFor(definition.id);
            }
            _syncControllers(editor.project, definitions);
            return _buildBody(editor.project, definitions);
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('讀取屬性設定失敗：$error')),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取專案失敗：$error')),
    );
  }

  /// Fixed display order: 案號、業主名稱、案名、專案地點、類型、狀態、簽約日期、
  /// 預計結案日 — mixes per-space custom properties (looked up by name) with
  /// the two fixed fields (案名/簽約日期/預計結案日 aren't properties at all).
  /// Any custom property a space adds beyond this standard set still shows
  /// up, just appended after — so nothing a space owner configured silently
  /// disappears just because it wasn't in this fixed list.
  static const _propertyDisplayOrder = ['案號', '業主名稱', '專案地點', '類型', '狀態'];

  Widget _buildBody(Project project, List<PropertyDefinition> definitions) {
    final byName = {for (final d in definitions) d.name: d};
    final extras = definitions.where((d) => !_propertyDisplayOrder.contains(d.name));

    Widget field(Widget child) => Padding(padding: const EdgeInsets.only(bottom: 16), child: child);

    return Padding(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (byName['案號'] case final def?) field(_buildField(project, def)),
            if (byName['業主名稱'] case final def?) field(_buildField(project, def)),
            field(
              TextField(
                controller: _nameController,
                focusNode: _nameFocusNode,
                decoration: const InputDecoration(labelText: '案名'),
                onSubmitted: (_) => _nameFocusNode.unfocus(),
              ),
            ),
            if (byName['專案地點'] case final def?) field(_buildField(project, def)),
            if (byName['類型'] case final def?) field(_buildField(project, def)),
            if (byName['狀態'] case final def?) field(_buildField(project, def)),
            // 簽約日期/預計結案日 are still backed by the fixed `projectStartDate`/
            // `projectEndDate` columns (the schedule/Gantt engine anchors off
            // the former; the latter feeds the "超出合約期限" schedule
            // warning) rather than a generic property — this just renders
            // them in the same visual language as the properties above.
            field(
              _buildDateField(
                label: '簽約日期',
                value: project.projectStartDate,
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: project.projectStartDate,
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (picked == null) return;
                  await _run(
                    () => ref
                        .read(apiClientProvider)
                        .updateProject(projectId: widget.projectId, projectStartDate: picked),
                  );
                },
              ),
            ),
            field(
              _buildDateField(
                label: '預計結案日',
                value: project.projectEndDate,
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: project.projectEndDate ?? project.projectStartDate,
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (picked == null) return;
                  await _run(
                    () => ref
                        .read(apiClientProvider)
                        .updateProject(projectId: widget.projectId, projectEndDate: picked),
                  );
                },
              ),
            ),
            for (final definition in extras) field(_buildField(project, definition)),
          ],
        ),
      ),
    );
  }

  Widget _buildField(Project project, PropertyDefinition definition) {
    switch (definition.type) {
      case PropertyType.text:
        return TextField(
          controller: _textControllers[definition.id],
          focusNode: _focusNodes[definition.id],
          decoration: InputDecoration(labelText: definition.name),
          onSubmitted: (_) => _focusNodes[definition.id]?.unfocus(),
        );
      case PropertyType.number:
        return TextField(
          controller: _textControllers[definition.id],
          focusNode: _focusNodes[definition.id],
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: definition.name),
          onSubmitted: (_) => _focusNodes[definition.id]?.unfocus(),
        );
      case PropertyType.date:
        final value = project.propertyValue(definition.id)?.dateValue;
        return _buildDateField(
          label: definition.name,
          value: value,
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: value ?? DateTime.now(),
              firstDate: DateTime(2000),
              lastDate: DateTime(2100),
            );
            if (picked == null) return;
            _savePropertyValue(
              definition.id,
              '${picked.year.toString().padLeft(4, '0')}-'
              '${picked.month.toString().padLeft(2, '0')}-'
              '${picked.day.toString().padLeft(2, '0')}',
            );
          },
        );
      case PropertyType.select:
        final currentOptionId = project.propertyValue(definition.id)?.optionId;
        return DropdownButtonFormField<String>(
          initialValue: currentOptionId,
          decoration: InputDecoration(labelText: definition.name),
          items: [
            for (final option in definition.options)
              DropdownMenuItem(value: option.id, child: Text(option.label)),
          ],
          onChanged: (value) {
            if (value == null) return;
            _savePropertyValue(definition.id, value);
          },
        );
    }
  }

  /// Same boxed/labeled look as the `TextField`/`DropdownButtonFormField`
  /// property widgets above — a date picker isn't directly typable, but it
  /// should still read as "one more field in this list", not a visually
  /// distinct row.
  Widget _buildDateField({required String label, required DateTime? value, required VoidCallback onTap}) {
    return InkWell(
      borderRadius: BorderRadius.circular(4),
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: const Icon(Icons.calendar_today_outlined, size: 18),
        ),
        isEmpty: value == null,
        child: value == null ? null : Text('${value.year}/${value.month}/${value.day}'),
      ),
    );
  }
}
