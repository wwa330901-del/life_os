/// `text` fields are a plain text box; `date` fields are a date picker whose
/// picked value is both formatted into the docx substitution text and, if
/// `writesTo` is set, sent back to the project as a real date.
enum DocumentFieldType { text, date }

/// One fillable field on a [DocumentTemplate] — `source` says where its
/// value comes from when a project generates this document: `null` means
/// always manual, `"project.name"`/`"project.startDate"` map to the
/// project's own fixed fields, `"property:<name>"` looks up a value by
/// name in the project's own property values (see `Project.propertyByName`).
/// `writesTo` is the reverse direction: for `date` fields, `"project.endDate"`
/// means the value picked here is written back onto the project's own
/// 預計結案日 when the document is generated (e.g. a contract's 完工日 field).
class DocumentField {
  const DocumentField({
    required this.key,
    required this.label,
    this.type = DocumentFieldType.text,
    this.source,
    this.writesTo,
  });

  final String key;
  final String label;
  final DocumentFieldType type;
  final String? source;
  final String? writesTo;

  factory DocumentField.fromJson(Map<String, dynamic> json) => DocumentField(
    key: json['key'] as String,
    label: json['label'] as String,
    type: (json['type'] as String?) == 'date' ? DocumentFieldType.date : DocumentFieldType.text,
    source: json['source'] as String?,
    writesTo: json['writesTo'] as String?,
  );
}

/// One document template a space can generate for its projects (see
/// `DocumentTemplate` in schema.prisma) — a pre-tagged `.docx` filled via
/// the backend's `.../fill` endpoint, byte-identical to the source layout
/// apart from the substituted fields.
class DocumentTemplate {
  const DocumentTemplate({
    required this.id,
    required this.spaceId,
    required this.code,
    required this.name,
    required this.category,
    required this.fields,
    required this.allowedTypeOptionIds,
  });

  final String id;
  final String spaceId;
  final String code;
  final String name;
  final String category;
  final List<DocumentField> fields;
  final List<String> allowedTypeOptionIds;

  factory DocumentTemplate.fromJson(Map<String, dynamic> json) => DocumentTemplate(
    id: json['id'] as String,
    spaceId: json['spaceId'] as String,
    code: json['code'] as String,
    name: json['name'] as String,
    category: json['category'] as String,
    fields: (json['fields'] as List<dynamic>)
        .map((e) => DocumentField.fromJson(e as Map<String, dynamic>))
        .toList(),
    allowedTypeOptionIds: (json['allowedTypeOptionIds'] as List<dynamic>).cast<String>(),
  );
}
