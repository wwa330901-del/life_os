import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/project_property.dart';
import '../../../state/auth_provider.dart';
import '../../../state/project_properties_provider.dart';
import '../../../state/projects_provider.dart';

/// Renders one input per this space's own property definitions — a space
/// with none defined yet just gets a plain name + start date form, same as
/// a brand new Notion database with no properties. 專案名稱 auto-fills from
/// this space's own 案名自動命名規則 (`NamingTemplate`, set in 專案設定) if one
/// is configured — joins the named properties' current values, in the
/// template's order, with its separator. No template configured (or the
/// space is missing one of the named properties) just leaves 專案名稱 empty
/// for the user to type by hand, same as before this feature existed.
class CreateProjectDialog extends ConsumerStatefulWidget {
  const CreateProjectDialog({super.key, required this.spaceId});

  final String spaceId;

  static Future<bool> show(BuildContext context, String spaceId) async {
    final created = await showDialog<bool>(
      context: context,
      builder: (_) => CreateProjectDialog(spaceId: spaceId),
    );
    return created ?? false;
  }

  @override
  ConsumerState<CreateProjectDialog> createState() => _CreateProjectDialogState();
}

class _CreateProjectDialogState extends ConsumerState<CreateProjectDialog> {
  final _nameController = TextEditingController();
  final Map<String, TextEditingController> _textControllers = {};
  final Map<String, DateTime?> _dateValues = {};
  final Map<String, String?> _selectValues = {};
  List<PropertyDefinition> _definitions = const [];
  NamingTemplate? _namingTemplate;
  bool _fieldsInitialized = false;
  String _lastAutoName = '';
  var _startDate = DateTime.now();
  bool _submitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    for (final controller in _textControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _ensureFieldsFor(List<PropertyDefinition> definitions) {
    if (_fieldsInitialized) return;
    _fieldsInitialized = true;
    _definitions = definitions;
    for (final definition in definitions) {
      switch (definition.type) {
        case PropertyType.text:
        case PropertyType.number:
          final controller = TextEditingController();
          controller.addListener(_recomputeName);
          _textControllers[definition.id] = controller;
        case PropertyType.date:
          _dateValues[definition.id] = null;
        case PropertyType.select:
          _selectValues[definition.id] = null;
      }
    }
  }

  PropertyDefinition? _findByName(String name) =>
      _definitions.firstWhereOrNull((d) => d.name == name);

  /// Current display value the user has entered so far for [definition],
  /// regardless of its type — empty string if not filled in yet.
  String _currentValueOf(PropertyDefinition definition) {
    switch (definition.type) {
      case PropertyType.text:
      case PropertyType.number:
        return _textControllers[definition.id]?.text ?? '';
      case PropertyType.date:
        final date = _dateValues[definition.id];
        return date == null ? '' : '${date.year}/${date.month}/${date.day}';
      case PropertyType.select:
        final optionId = _selectValues[definition.id];
        return definition.options.firstWhereOrNull((o) => o.id == optionId)?.label ?? '';
    }
  }

  void _recomputeName() {
    final template = _namingTemplate;
    if (template == null || template.propertyNames.isEmpty) return;
    final parts = <String>[];
    for (final name in template.propertyNames) {
      final definition = _findByName(name);
      if (definition == null) return; // space no longer has this property — skip the suggestion
      parts.add(_currentValueOf(definition));
    }
    final auto = parts.join(template.separator);
    // Only overwrite the name field if it still holds the last auto-generated
    // value — once the user types their own text in, it stops following.
    if (_nameController.text == _lastAutoName) {
      _nameController.text = auto;
    }
    _lastAutoName = auto;
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;

    final propertyValues = <PropertyValueInput>[];
    for (final definition in _definitions) {
      switch (definition.type) {
        case PropertyType.text:
          final text = _textControllers[definition.id]?.text.trim() ?? '';
          if (text.isNotEmpty) {
            propertyValues.add(PropertyValueInput(definitionId: definition.id, value: text));
          }
        case PropertyType.number:
          final number = double.tryParse(_textControllers[definition.id]?.text.trim() ?? '');
          if (number != null) {
            propertyValues.add(PropertyValueInput(definitionId: definition.id, value: number));
          }
        case PropertyType.date:
          final date = _dateValues[definition.id];
          if (date != null) {
            propertyValues.add(
              PropertyValueInput(definitionId: definition.id, value: _dateOnly(date)),
            );
          }
        case PropertyType.select:
          final optionId = _selectValues[definition.id];
          if (optionId != null) {
            propertyValues.add(PropertyValueInput(definitionId: definition.id, value: optionId));
          }
      }
    }

    setState(() => _submitting = true);
    try {
      await ref
          .read(apiClientProvider)
          .createProject(
            spaceId: widget.spaceId,
            name: name,
            projectStartDate: _startDate,
            propertyValues: propertyValues,
          );
      ref.invalidate(spaceProjectsProvider(widget.spaceId));
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _submitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final propertiesAsync = ref.watch(spacePropertiesProvider(widget.spaceId));
    _namingTemplate = ref.watch(namingTemplateProvider(widget.spaceId)).value;

    return AlertDialog(
      title: const Text('新增專案'),
      content: SizedBox(
        width: 360,
        child: propertiesAsync.when(
          data: (definitions) {
            _ensureFieldsFor(definitions);
            return _buildForm(definitions);
          },
          loading: () => const SizedBox(height: 80, child: Center(child: CircularProgressIndicator())),
          error: (error, _) => Text('讀取屬性設定失敗：$error'),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(false),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: _submitting ? null : _submit,
          child: _submitting
              ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('建立'),
        ),
      ],
    );
  }

  Widget _buildForm(List<PropertyDefinition> definitions) {
    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final definition in definitions) ...[
            _buildField(definition),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _nameController,
            autofocus: definitions.isEmpty,
            decoration: const InputDecoration(labelText: '專案名稱'),
          ),
          const SizedBox(height: 12),
          _buildDateField(
            label: '簽約日期',
            value: _startDate,
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _startDate,
                firstDate: DateTime(2020),
                lastDate: DateTime(2100),
              );
              if (picked != null) setState(() => _startDate = picked);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildField(PropertyDefinition definition) {
    switch (definition.type) {
      case PropertyType.text:
        return TextField(
          controller: _textControllers[definition.id],
          decoration: InputDecoration(labelText: definition.name),
        );
      case PropertyType.number:
        return TextField(
          controller: _textControllers[definition.id],
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: definition.name),
        );
      case PropertyType.date:
        final value = _dateValues[definition.id];
        return _buildDateField(
          label: definition.name,
          value: value,
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: value ?? DateTime.now(),
              firstDate: DateTime(2020),
              lastDate: DateTime(2100),
            );
            if (picked != null) {
              setState(() => _dateValues[definition.id] = picked);
              _recomputeName();
            }
          },
        );
      case PropertyType.select:
        return DropdownButtonFormField<String>(
          initialValue: _selectValues[definition.id],
          decoration: InputDecoration(labelText: definition.name),
          items: [
            for (final option in definition.options)
              DropdownMenuItem(value: option.id, child: Text(option.label)),
          ],
          onChanged: (value) => setState(() {
            _selectValues[definition.id] = value;
            _recomputeName();
          }),
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

  String _dateOnly(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
}
