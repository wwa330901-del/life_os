import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/project.dart';
import '../../../../core/models/project_property.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/project_editor_provider.dart';
import '../../../../state/project_properties_provider.dart';

/// 專案資料 tab: loops over this space's own property definitions (Notion-
/// database-style, set up via the space's 屬性設定 screen) and renders one
/// editable field per definition — a space with no properties defined just
/// shows 開工日 and nothing else. Replaces what used to be a hardcoded
/// 類型/狀態/業主名稱/專案地點/案號 form.
class ProjectInfoTab extends ConsumerStatefulWidget {
  const ProjectInfoTab({super.key, required this.projectId});

  final String projectId;

  @override
  ConsumerState<ProjectInfoTab> createState() => _ProjectInfoTabState();
}

class _ProjectInfoTabState extends ConsumerState<ProjectInfoTab> {
  final Map<String, TextEditingController> _textControllers = {};
  final Map<String, FocusNode> _focusNodes = {};
  Project? _lastKnownProject;

  @override
  void dispose() {
    for (final controller in _textControllers.values) {
      controller.dispose();
    }
    for (final focus in _focusNodes.values) {
      focus.dispose();
    }
    super.dispose();
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
          data: (definitions) {
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

  Widget _buildBody(Project project, List<PropertyDefinition> definitions) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final definition in definitions) ...[
              _buildField(project, definition),
              const SizedBox(height: 16),
            ],
            Row(
              children: [
                Expanded(
                  child: Text(
                    '開工日：${project.projectStartDate.year}/${project.projectStartDate.month}/${project.projectStartDate.day}',
                  ),
                ),
                TextButton(
                  onPressed: () async {
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
                  child: const Text('修改日期'),
                ),
              ],
            ),
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
        return Row(
          children: [
            Expanded(
              child: Text(
                '${definition.name}：${value == null ? '未設定' : '${value.year}/${value.month}/${value.day}'}',
              ),
            ),
            TextButton(
              onPressed: () async {
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
              child: const Text('選擇日期'),
            ),
          ],
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
}
