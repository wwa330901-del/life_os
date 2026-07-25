import 'dart:io';
import 'dart:typed_data';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/document_template.dart';
import '../../../../core/models/project.dart';
import '../../../../services/documents/document_fill_service.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/document_templates_provider.dart';
import '../../../../state/project_editor_provider.dart';

/// 相關文件 tab — every document template this project's own "類型" allows
/// (set up in the space's 專案設定 → 文件選用), each with a "產生文件" action
/// that fills the template with this project's data and lets the user save
/// it as Word (always available, byte-identical to the template) or PDF /
/// send to a printer (both need a local LibreOffice install).
class ProjectDocumentsTab extends ConsumerWidget {
  const ProjectDocumentsTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final templatesAsync = ref.watch(projectDocumentTemplatesProvider(projectId));

    return templatesAsync.when(
      data: (templates) {
        if (templates.isEmpty) {
          return const Center(child: Text('這個專案目前的類型沒有可用的文件範本'));
        }
        return ListView(
          padding: const EdgeInsets.all(24),
          children: [
            for (final template in templates)
              Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: ListTile(
                  title: Text(template.name),
                  subtitle: Text('${template.code} · ${template.category}'),
                  trailing: FilledButton(
                    onPressed: () => _generate(context, ref, template),
                    child: const Text('產生文件'),
                  ),
                ),
              ),
          ],
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取文件範本失敗：$error')),
    );
  }

  Future<void> _generate(BuildContext context, WidgetRef ref, DocumentTemplate template) async {
    final project = ref.read(projectEditorProvider(projectId)).value?.project;
    if (project == null) return;

    final values = await showDialog<Map<String, String>>(
      context: context,
      builder: (_) => _FillDialog(template: template, project: project),
    );
    if (values == null || !context.mounted) return;

    final Uint8List bytes;
    try {
      bytes = await ref
          .read(apiClientProvider)
          .fillDocumentTemplate(projectId: projectId, templateId: template.id, values: values);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }
    if (!context.mounted) return;

    final action = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('文件已產生'),
        children: [
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop('docx'),
            child: const Text('另存為 Word 檔'),
          ),
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop('pdf'),
            child: const Text('另存為 PDF'),
          ),
          SimpleDialogOption(onPressed: () => Navigator.of(context).pop('print'), child: const Text('列印')),
        ],
      ),
    );
    if (action == null || !context.mounted) return;

    switch (action) {
      case 'docx':
        await _saveDocx(template, bytes);
      case 'pdf':
        await _savePdf(context, template, bytes);
      case 'print':
        await _print(context, template, bytes);
    }
  }

  Future<void> _saveDocx(DocumentTemplate template, Uint8List bytes) async {
    final location = await getSaveLocation(
      suggestedName: '${template.name}.docx',
      acceptedTypeGroups: const [
        XTypeGroup(label: 'Word 文件', extensions: ['docx']),
      ],
    );
    if (location == null) return;
    final path = location.path.endsWith('.docx') ? location.path : '${location.path}.docx';
    await File(path).writeAsBytes(bytes);
  }

  Future<void> _savePdf(BuildContext context, DocumentTemplate template, Uint8List bytes) async {
    final pdfBytes = await DocumentFillService.convertDocxToPdf(bytes);
    if (pdfBytes == null) {
      if (context.mounted) _showLibreOfficeMissing(context);
      return;
    }
    final location = await getSaveLocation(
      suggestedName: '${template.name}.pdf',
      acceptedTypeGroups: const [
        XTypeGroup(label: 'PDF 文件', extensions: ['pdf']),
      ],
    );
    if (location == null) return;
    final path = location.path.endsWith('.pdf') ? location.path : '${location.path}.pdf';
    await File(path).writeAsBytes(pdfBytes);
  }

  Future<void> _print(BuildContext context, DocumentTemplate template, Uint8List bytes) async {
    final pdfBytes = await DocumentFillService.convertDocxToPdf(bytes);
    if (pdfBytes == null) {
      if (context.mounted) _showLibreOfficeMissing(context);
      return;
    }
    await Printing.layoutPdf(onLayout: (_) async => pdfBytes, name: template.name);
  }

  void _showLibreOfficeMissing(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('找不到 LibreOffice，請先安裝（libreoffice.org）後再試一次')),
    );
  }
}

class _FillDialog extends StatefulWidget {
  const _FillDialog({required this.template, required this.project});

  final DocumentTemplate template;
  final Project project;

  @override
  State<_FillDialog> createState() => _FillDialogState();
}

class _FillDialogState extends State<_FillDialog> {
  late final Map<String, TextEditingController> _controllers = {
    for (final field in widget.template.fields)
      field.key: TextEditingController(text: _autoFillValue(field) ?? ''),
  };

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  /// Resolves a field's `source` against this project — `null` means
  /// always-manual, `project.name`/`project.startDate` map to the
  /// project's own fixed fields, `property:<name>` looks up a value by
  /// name in the project's own property values.
  String? _autoFillValue(DocumentField field) {
    final source = field.source;
    if (source == null) return null;
    if (source == 'project.name') return widget.project.name;
    if (source == 'project.startDate') {
      final d = widget.project.projectStartDate;
      return '${d.year}/${d.month}/${d.day}';
    }
    if (source.startsWith('property:')) {
      final name = source.substring('property:'.length);
      final value = widget.project.propertyByName(name)?.displayValue;
      return (value == null || value.isEmpty) ? null : value;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('產生「${widget.template.name}」'),
      content: SizedBox(
        width: 360,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final field in widget.template.fields) ...[
                TextField(
                  controller: _controllers[field.key],
                  decoration: InputDecoration(labelText: field.label),
                ),
                const SizedBox(height: 12),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: () {
            final values = {for (final entry in _controllers.entries) entry.key: entry.value.text};
            Navigator.of(context).pop(values);
          },
          child: const Text('產生'),
        ),
      ],
    );
  }
}
