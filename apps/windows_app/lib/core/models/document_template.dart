/// One fillable field on a [DocumentTemplate] — `source` says where its
/// value comes from when a project generates this document: `null` means
/// always manual, `"project.name"`/`"project.startDate"` map to the
/// project's own fixed fields, `"property:<name>"` looks up a value by
/// name in the project's own property values (see `Project.propertyByName`).
class DocumentField {
  const DocumentField({required this.key, required this.label, this.source});

  final String key;
  final String label;
  final String? source;

  factory DocumentField.fromJson(Map<String, dynamic> json) => DocumentField(
    key: json['key'] as String,
    label: json['label'] as String,
    source: json['source'] as String?,
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
