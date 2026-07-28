import 'dart:io';
import 'dart:typed_data';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/document_template.dart';
import '../../../../core/models/generated_document.dart';
import '../../../../core/models/project.dart';
import '../../../../services/documents/document_fill_service.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/document_templates_provider.dart';
import '../../../../state/project_editor_provider.dart';

/// 相關文件 tab — two sections: every document template this project's own
/// "類型" allows (set up in the space's 專案設定 → 文件選用), each with a
/// "產生文件" action; and every document already generated from one of
/// those templates for this project, kept as a record inside the app (not
/// a one-shot download) so it can be reopened later — laying the ground
/// for a future company sign-off/approval workflow, which needs something
/// stateful to attach to rather than a file that only ever existed for the
/// length of one download dialog. 列印/匯出 Word/匯出 PDF are actions on an
/// already-generated record, not the immediate and only outcome of filling
/// a template.
class ProjectDocumentsTab extends ConsumerWidget {
  const ProjectDocumentsTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final templatesAsync = ref.watch(projectDocumentTemplatesProvider(projectId));
    final generatedAsync = ref.watch(generatedDocumentsProvider(projectId));

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text('可用範本', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        templatesAsync.when(
          data: (templates) {
            if (templates.isEmpty) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text('這個專案目前的類型沒有可用的文件範本'),
              );
            }
            return Column(
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
          error: (error, _) => Text('讀取文件範本失敗：$error'),
        ),
        const SizedBox(height: 32),
        Text('已產生的文件', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        generatedAsync.when(
          data: (docs) {
            if (docs.isEmpty) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text('目前還沒有產生過任何文件'),
              );
            }
            return Column(
              children: [
                for (final doc in docs)
                  Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: ListTile(
                      leading: const Icon(Icons.description_outlined),
                      title: Text(doc.name),
                      subtitle: Text(_formatDateTime(doc.createdAt)),
                      onTap: () => _preview(context, ref, doc),
                      trailing: PopupMenuButton<String>(
                        onSelected: (action) => _handleAction(context, ref, doc, action),
                        itemBuilder: (context) => const [
                          PopupMenuItem(value: 'preview', child: Text('預覽')),
                          PopupMenuItem(value: 'docx', child: Text('另存為 Word 檔')),
                          PopupMenuItem(value: 'pdf', child: Text('另存為 PDF')),
                          PopupMenuItem(value: 'print', child: Text('列印')),
                          PopupMenuItem(value: 'delete', child: Text('刪除')),
                        ],
                      ),
                    ),
                  ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Text('讀取已產生文件失敗：$error'),
        ),
      ],
    );
  }

  String _formatDateTime(DateTime d) =>
      '${d.year}/${d.month}/${d.day} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  Future<void> _handleAction(
    BuildContext context,
    WidgetRef ref,
    GeneratedDocument doc,
    String action,
  ) async {
    if (action == 'delete') {
      await _delete(context, ref, doc);
      return;
    }
    if (action == 'preview') {
      await _preview(context, ref, doc);
      return;
    }

    final Uint8List bytes;
    try {
      bytes = await ref
          .read(apiClientProvider)
          .downloadGeneratedDocument(projectId: projectId, documentId: doc.id);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }
    if (!context.mounted) return;
    switch (action) {
      case 'docx':
        await _saveDocx(doc.name, bytes);
      case 'pdf':
        await _savePdf(context, doc.name, bytes);
      case 'print':
        await _print(context, doc.name, bytes);
    }
  }

  Future<void> _preview(BuildContext context, WidgetRef ref, GeneratedDocument doc) async {
    final Uint8List bytes;
    try {
      bytes = await ref
          .read(apiClientProvider)
          .downloadGeneratedDocument(projectId: projectId, documentId: doc.id);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }
    if (!context.mounted) return;

    final pdfBytes = await DocumentFillService.convertDocxToPdf(bytes);
    if (pdfBytes == null) {
      if (context.mounted) _showLibreOfficeMissing(context);
      return;
    }
    if (!context.mounted) return;

    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => _DocumentPreviewScreen(name: doc.name, pdfBytes: pdfBytes)),
    );
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, GeneratedDocument doc) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除文件'),
        content: Text('確定要刪除「${doc.name}」嗎？這個動作無法復原。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .deleteGeneratedDocument(projectId: projectId, documentId: doc.id);
      ref.invalidate(generatedDocumentsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _generate(BuildContext context, WidgetRef ref, DocumentTemplate template) async {
    final project = ref.read(projectEditorProvider(projectId)).value?.project;
    if (project == null) return;

    final result = await showDialog<_FillResult>(
      context: context,
      builder: (_) => _FillDialog(template: template, project: project),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .fillDocumentTemplate(projectId: projectId, templateId: template.id, values: result.values);
      ref.invalidate(generatedDocumentsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }
    if (!context.mounted) return;
    await _writeBackDates(context, ref, template, result);
    if (!context.mounted) return;

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('「${template.name}」已產生，可以在下面「已產生的文件」列表找到')));
  }

  Future<void> _saveDocx(String name, Uint8List bytes) async {
    final location = await getSaveLocation(
      suggestedName: '$name.docx',
      acceptedTypeGroups: const [
        XTypeGroup(label: 'Word 文件', extensions: ['docx']),
      ],
    );
    if (location == null) return;
    final path = location.path.endsWith('.docx') ? location.path : '${location.path}.docx';
    await File(path).writeAsBytes(bytes);
  }

  Future<void> _savePdf(BuildContext context, String name, Uint8List bytes) async {
    final pdfBytes = await DocumentFillService.convertDocxToPdf(bytes);
    if (pdfBytes == null) {
      if (context.mounted) _showLibreOfficeMissing(context);
      return;
    }
    final location = await getSaveLocation(
      suggestedName: '$name.pdf',
      acceptedTypeGroups: const [
        XTypeGroup(label: 'PDF 文件', extensions: ['pdf']),
      ],
    );
    if (location == null) return;
    final path = location.path.endsWith('.pdf') ? location.path : '${location.path}.pdf';
    await File(path).writeAsBytes(pdfBytes);
  }

  Future<void> _print(BuildContext context, String name, Uint8List bytes) async {
    final pdfBytes = await DocumentFillService.convertDocxToPdf(bytes);
    if (pdfBytes == null) {
      if (context.mounted) _showLibreOfficeMissing(context);
      return;
    }
    await Printing.layoutPdf(onLayout: (_) async => pdfBytes, name: name);
  }

  void _showLibreOfficeMissing(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('找不到 LibreOffice，請先安裝（libreoffice.org）後再試一次')),
    );
  }

  /// After a document is generated, any `date`-type field whose template
  /// definition has `writesTo` set feeds its picked value back onto the
  /// project (currently only `"project.endDate"` — a contract's 完工日
  /// setting the project's 預計結案日) so the schedule tab's deadline
  /// warning has something to compare against.
  Future<void> _writeBackDates(
    BuildContext context,
    WidgetRef ref,
    DocumentTemplate template,
    _FillResult result,
  ) async {
    for (final field in template.fields) {
      if (field.writesTo != 'project.endDate') continue;
      final date = result.dateValues[field.key];
      if (date == null) continue;
      try {
        await ref.read(apiClientProvider).updateProject(projectId: projectId, projectEndDate: date);
        ref.invalidate(projectEditorProvider(projectId));
      } on ApiException catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('更新預計結案日失敗：${e.message}')));
        }
      }
    }
  }
}

/// What [_FillDialog] hands back: `values` is what goes to the fill API
/// (docx substitution text for every field), `dateValues` additionally
/// carries the raw picked [DateTime] for each `date`-type field so
/// [ProjectDocumentsTab._writeBackDates] doesn't have to re-parse the
/// formatted text.
class _FillResult {
  const _FillResult({required this.values, required this.dateValues});

  final Map<String, String> values;
  final Map<String, DateTime?> dateValues;
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
      if (field.type == DocumentFieldType.text)
        field.key: TextEditingController(text: _autoFillValue(field) ?? ''),
  };

  late final Map<String, DateTime?> _dateValues = {
    for (final field in widget.template.fields)
      if (field.type == DocumentFieldType.date) field.key: _autoFillDate(field),
  };

  @override
  void initState() {
    super.initState();
    // Auto-fill from `source` (e.g. a date pulled from the project's own
    // properties) can already populate both ends of a duration pair before
    // the user touches anything, so seed derived fields once up front too.
    _recomputeDurations();
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  /// Fills in every `text` field that declares `durationFromKey`/
  /// `durationToKey` (see [DocumentField]) as the day count between those
  /// two date fields, once both are set — e.g. a contract's 工期(天) field
  /// computed from 開工日/完工日 instead of typed by hand.
  void _recomputeDurations() {
    for (final field in widget.template.fields) {
      final fromKey = field.durationFromKey;
      final toKey = field.durationToKey;
      if (fromKey == null || toKey == null) continue;
      final from = _dateValues[fromKey];
      final to = _dateValues[toKey];
      if (from == null || to == null) continue;
      _controllers[field.key]?.text = to.difference(from).inDays.toString();
    }
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

  /// Same resolution as [_autoFillValue] but for `date`-type fields, which
  /// need the raw [DateTime] (both to show a real date picker and, via
  /// `writesTo`, to write back onto the project without re-parsing text).
  DateTime? _autoFillDate(DocumentField field) {
    final source = field.source;
    if (source == null) return null;
    if (source == 'project.startDate') return widget.project.projectStartDate;
    if (source.startsWith('property:')) {
      final name = source.substring('property:'.length);
      return widget.project.propertyByName(name)?.dateValue;
    }
    return null;
  }

  String _formatChineseDate(DateTime d) => '${d.year}年${d.month}月${d.day}日';

  Future<void> _pickDate(String key) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dateValues[key] ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      _dateValues[key] = picked;
      _recomputeDurations();
    });
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
                if (field.type == DocumentFieldType.date)
                  InkWell(
                    borderRadius: BorderRadius.circular(4),
                    onTap: () => _pickDate(field.key),
                    child: InputDecorator(
                      decoration: InputDecoration(
                        labelText: field.label,
                        suffixIcon: const Icon(Icons.calendar_today_outlined, size: 18),
                      ),
                      isEmpty: _dateValues[field.key] == null,
                      child: _dateValues[field.key] == null
                          ? null
                          : Text(_formatChineseDate(_dateValues[field.key]!)),
                    ),
                  )
                else
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
            final values = {
              for (final field in widget.template.fields)
                field.key: field.type == DocumentFieldType.date
                    ? (_dateValues[field.key] == null ? '' : _formatChineseDate(_dateValues[field.key]!))
                    : (_controllers[field.key]?.text ?? ''),
            };
            Navigator.of(context).pop(_FillResult(values: values, dateValues: _dateValues));
          },
          child: const Text('產生'),
        ),
      ],
    );
  }
}

/// In-app preview of an already-generated document — converts its docx
/// bytes to PDF (same local-LibreOffice path the print/export actions
/// already use) and renders it with `printing`'s own preview widget rather
/// than requiring the user to open an external file just to see what's in
/// it.
class _DocumentPreviewScreen extends StatelessWidget {
  const _DocumentPreviewScreen({required this.name, required this.pdfBytes});

  final String name;
  final Uint8List pdfBytes;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(name)),
      body: PdfPreview(
        build: (format) async => pdfBytes,
        pdfFileName: '$name.pdf',
      ),
    );
  }
}
