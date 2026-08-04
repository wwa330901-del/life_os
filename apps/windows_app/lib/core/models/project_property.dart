enum PropertyType { text, number, date, select }

PropertyType propertyTypeFromJson(String value) => switch (value) {
  'NUMBER' => PropertyType.number,
  'DATE' => PropertyType.date,
  'SELECT' => PropertyType.select,
  _ => PropertyType.text,
};

String propertyTypeToJson(PropertyType type) => switch (type) {
  PropertyType.text => 'TEXT',
  PropertyType.number => 'NUMBER',
  PropertyType.date => 'DATE',
  PropertyType.select => 'SELECT',
};

/// One choice for a SELECT-type property definition.
class PropertyOption {
  const PropertyOption({required this.id, required this.label});

  final String id;
  final String label;

  factory PropertyOption.fromJson(Map<String, dynamic> json) =>
      PropertyOption(id: json['id'] as String, label: json['label'] as String);
}

/// One property a space has defined for its own projects — the "columns"
/// this space's project-info shape has, each space sets these up itself
/// (`GET/POST/PATCH/DELETE /spaces/:id/properties`).
class PropertyDefinition {
  const PropertyDefinition({
    required this.id,
    required this.name,
    required this.type,
    required this.sortOrder,
    this.options = const [],
  });

  final String id;
  final String name;
  final PropertyType type;
  final int sortOrder;
  final List<PropertyOption> options;

  factory PropertyDefinition.fromJson(Map<String, dynamic> json) => PropertyDefinition(
    id: json['id'] as String,
    name: json['name'] as String,
    type: propertyTypeFromJson(json['type'] as String),
    sortOrder: json['sortOrder'] as int,
    options: (json['options'] as List<dynamic>? ?? const [])
        .map((e) => PropertyOption.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// One project's value for one of its space's property definitions —
/// exactly one of [textValue]/[numberValue]/[dateValue]/[optionId] is set,
/// matching [definitionType].
class ProjectPropertyValue {
  const ProjectPropertyValue({
    required this.definitionId,
    required this.definitionName,
    required this.definitionType,
    this.textValue,
    this.numberValue,
    this.dateValue,
    this.optionId,
    this.optionLabel,
  });

  final String definitionId;
  final String definitionName;
  final PropertyType definitionType;
  final String? textValue;
  final double? numberValue;
  final DateTime? dateValue;
  final String? optionId;
  final String? optionLabel;

  factory ProjectPropertyValue.fromJson(Map<String, dynamic> json) {
    final definition = json['definition'] as Map<String, dynamic>;
    final option = json['option'] as Map<String, dynamic>?;
    return ProjectPropertyValue(
      definitionId: definition['id'] as String,
      definitionName: definition['name'] as String,
      definitionType: propertyTypeFromJson(definition['type'] as String),
      textValue: json['textValue'] as String?,
      numberValue: (json['numberValue'] as num?)?.toDouble(),
      dateValue: json['dateValue'] == null ? null : DateTime.parse(json['dateValue'] as String),
      optionId: json['optionId'] as String?,
      optionLabel: option?['label'] as String?,
    );
  }

  /// Human-readable value — project list badges, the 專案資料 tab's
  /// read-only moments, etc.
  String get displayValue {
    switch (definitionType) {
      case PropertyType.text:
        return textValue ?? '';
      case PropertyType.number:
        return numberValue == null ? '' : _trimTrailingZero(numberValue!);
      case PropertyType.date:
        final d = dateValue;
        return d == null ? '' : '${d.year}/${d.month}/${d.day}';
      case PropertyType.select:
        return optionLabel ?? '';
    }
  }

  static String _trimTrailingZero(double value) =>
      value == value.roundToDouble() ? value.toInt().toString() : value.toString();
}

/// This space's own rule (if any) for suggesting a new project's 案名 —
/// joins the named properties' current values, in this order, with
/// [separator]. Applied once at project-creation time only, never
/// retroactively when a property value changes later.
class NamingTemplate {
  const NamingTemplate({required this.propertyNames, required this.separator});

  final List<String> propertyNames;
  final String separator;

  factory NamingTemplate.fromJson(Map<String, dynamic> json) => NamingTemplate(
    propertyNames: (json['propertyNames'] as List<dynamic>).map((e) => e as String).toList(),
    separator: json['separator'] as String,
  );

  Map<String, dynamic> toJson() => {'propertyNames': propertyNames, 'separator': separator};
}

/// What the client sends back for one property when creating/updating a
/// project — mirrors `PropertyValueInputDto` on the API.
class PropertyValueInput {
  const PropertyValueInput({required this.definitionId, required this.value});

  final String definitionId;

  /// A String for TEXT/DATE/SELECT (SELECT's string is the chosen
  /// option's id) or a num for NUMBER.
  final Object value;

  Map<String, dynamic> toJson() => {'definitionId': definitionId, 'value': value};
}
