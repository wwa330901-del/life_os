enum KnowledgeFieldType { text, number, date, select, boolean }

extension KnowledgeFieldTypeJson on KnowledgeFieldType {
  static KnowledgeFieldType fromJson(String value) => switch (value) {
    'NUMBER' => KnowledgeFieldType.number,
    'DATE' => KnowledgeFieldType.date,
    'SELECT' => KnowledgeFieldType.select,
    'BOOLEAN' => KnowledgeFieldType.boolean,
    _ => KnowledgeFieldType.text,
  };

  String get wireValue => switch (this) {
    KnowledgeFieldType.text => 'TEXT',
    KnowledgeFieldType.number => 'NUMBER',
    KnowledgeFieldType.date => 'DATE',
    KnowledgeFieldType.select => 'SELECT',
    KnowledgeFieldType.boolean => 'BOOLEAN',
  };

  String get label => switch (this) {
    KnowledgeFieldType.text => '文字',
    KnowledgeFieldType.number => '數字',
    KnowledgeFieldType.date => '日期',
    KnowledgeFieldType.select => '選項',
    KnowledgeFieldType.boolean => '是否',
  };
}

class KnowledgeFieldOption {
  const KnowledgeFieldOption({required this.id, required this.label});

  final String id;
  final String label;

  factory KnowledgeFieldOption.fromJson(Map<String, dynamic> json) =>
      KnowledgeFieldOption(id: json['id'] as String, label: json['label'] as String);
}

class KnowledgeFieldDefinition {
  const KnowledgeFieldDefinition({
    required this.id,
    required this.name,
    required this.type,
    required this.options,
  });

  final String id;
  final String name;
  final KnowledgeFieldType type;
  final List<KnowledgeFieldOption> options;

  factory KnowledgeFieldDefinition.fromJson(Map<String, dynamic> json) => KnowledgeFieldDefinition(
    id: json['id'] as String,
    name: json['name'] as String,
    type: KnowledgeFieldTypeJson.fromJson(json['type'] as String),
    options: (json['options'] as List<dynamic>? ?? [])
        .map((e) => KnowledgeFieldOption.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class KnowledgeBlockedUser {
  const KnowledgeBlockedUser({required this.id, required this.name, required this.email});

  final String id;
  final String name;
  final String email;

  factory KnowledgeBlockedUser.fromJson(Map<String, dynamic> json) => KnowledgeBlockedUser(
    id: json['id'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
  );
}

/// A knowledge-collection category the caller owns (or, when fetched via
/// `/knowledge/categories/public`, someone else's public one — `ownerName`
/// is only populated in that case). Account-level, not scoped to any Space.
class KnowledgeCategory {
  const KnowledgeCategory({
    required this.id,
    required this.name,
    required this.isPublic,
    required this.fields,
    required this.blacklistedUsers,
    this.ownerName,
  });

  final String id;
  final String name;
  final bool isPublic;
  final List<KnowledgeFieldDefinition> fields;
  final List<KnowledgeBlockedUser> blacklistedUsers;
  final String? ownerName;

  factory KnowledgeCategory.fromJson(Map<String, dynamic> json) => KnowledgeCategory(
    id: json['id'] as String,
    name: json['name'] as String,
    isPublic: json['isPublic'] as bool,
    fields: (json['fields'] as List<dynamic>? ?? [])
        .map((e) => KnowledgeFieldDefinition.fromJson(e as Map<String, dynamic>))
        .toList(),
    blacklistedUsers: (json['blacklistedUsers'] as List<dynamic>? ?? [])
        .map((e) => KnowledgeBlockedUser.fromJson(e as Map<String, dynamic>))
        .toList(),
    ownerName: (json['owner'] as Map<String, dynamic>?)?['name'] as String?,
  );
}

enum KnowledgeItemStatus { pending, processing, awaitingCategoryDecision, done, failed }

extension KnowledgeItemStatusJson on KnowledgeItemStatus {
  static KnowledgeItemStatus fromJson(String value) => switch (value) {
    'PROCESSING' => KnowledgeItemStatus.processing,
    'AWAITING_CATEGORY_DECISION' => KnowledgeItemStatus.awaitingCategoryDecision,
    'DONE' => KnowledgeItemStatus.done,
    'FAILED' => KnowledgeItemStatus.failed,
    _ => KnowledgeItemStatus.pending,
  };

  String get label => switch (this) {
    KnowledgeItemStatus.pending => '等待處理',
    KnowledgeItemStatus.processing => '分析中',
    KnowledgeItemStatus.awaitingCategoryDecision => '等待分類決定',
    KnowledgeItemStatus.done => '完成',
    KnowledgeItemStatus.failed => '失敗',
  };
}

/// One field's value on one item, already resolved to a display string —
/// the raw JSON has a nullable column per type (textValue/numberValue/...),
/// collapsed here to whichever one the field's own type actually uses.
class KnowledgeFieldValueDisplay {
  const KnowledgeFieldValueDisplay({
    required this.fieldName,
    required this.fieldType,
    required this.displayValue,
  });

  final String fieldName;
  final KnowledgeFieldType fieldType;
  final String displayValue;
}

class KnowledgeItem {
  const KnowledgeItem({
    required this.id,
    required this.ownerUserId,
    required this.status,
    required this.tags,
    required this.fieldValues,
    required this.createdAt,
    this.categoryId,
    this.categoryName,
    this.suggestedCategoryName,
    this.errorMessage,
    this.sourceUrl,
    this.sourcePlatform,
    this.title,
    this.summary,
    this.ownerName,
    this.rawContent,
    this.fileUrl,
  });

  final String id;
  final String ownerUserId;
  final KnowledgeItemStatus status;
  final String? categoryId;
  final String? categoryName;
  final String? suggestedCategoryName;
  final String? errorMessage;
  final String? sourceUrl;
  final String? sourcePlatform;
  final String? title;
  final String? summary;

  /// 純文字來源（傳「分析」貼上的內容）本來的樣子——連結/圖片/影片來源
  /// 這個欄位是 null。
  final String? rawContent;

  /// 圖片/影片來源的短效期簽名網址（見後端 `getDetailWithFileUrl`），只有
  /// `GET /knowledge/items/:id`（詳細頁）才會有值，列表頁不會。
  final String? fileUrl;
  final List<String> tags;
  final List<KnowledgeFieldValueDisplay> fieldValues;
  final String? ownerName;
  final DateTime createdAt;

  factory KnowledgeItem.fromJson(Map<String, dynamic> json) {
    final fieldValuesJson = json['fieldValues'] as List<dynamic>? ?? [];
    return KnowledgeItem(
      id: json['id'] as String,
      ownerUserId: json['ownerUserId'] as String,
      status: KnowledgeItemStatusJson.fromJson(json['status'] as String),
      categoryId: json['categoryId'] as String?,
      categoryName: (json['category'] as Map<String, dynamic>?)?['name'] as String?,
      suggestedCategoryName: json['suggestedCategoryName'] as String?,
      errorMessage: json['errorMessage'] as String?,
      sourceUrl: json['sourceUrl'] as String?,
      sourcePlatform: json['sourcePlatform'] as String?,
      title: json['title'] as String?,
      summary: json['summary'] as String?,
      tags: (json['tags'] as List<dynamic>? ?? []).map((e) => e as String).toList(),
      fieldValues: fieldValuesJson.map((e) => _fieldValueFromJson(e as Map<String, dynamic>)).toList(),
      ownerName: (json['owner'] as Map<String, dynamic>?)?['name'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      rawContent: json['rawContent'] as String?,
      fileUrl: json['fileUrl'] as String?,
    );
  }

  static KnowledgeFieldValueDisplay _fieldValueFromJson(Map<String, dynamic> json) {
    final definition = json['definition'] as Map<String, dynamic>;
    final type = KnowledgeFieldTypeJson.fromJson(definition['type'] as String);
    final option = json['option'] as Map<String, dynamic>?;
    final display = switch (type) {
      KnowledgeFieldType.number => json['numberValue']?.toString() ?? '',
      KnowledgeFieldType.date =>
        json['dateValue'] != null ? _formatDate(DateTime.parse(json['dateValue'] as String)) : '',
      KnowledgeFieldType.boolean => (json['booleanValue'] as bool? ?? false) ? '是' : '否',
      KnowledgeFieldType.select => option?['label'] as String? ?? '',
      KnowledgeFieldType.text => json['textValue'] as String? ?? '',
    };
    return KnowledgeFieldValueDisplay(fieldName: definition['name'] as String, fieldType: type, displayValue: display);
  }
}

/// One page of a cursor-paginated `/knowledge/items` (or `/public`) fetch —
/// `nextCursor` is null once there's nothing more to load.
class KnowledgeItemsPage {
  const KnowledgeItemsPage({required this.items, required this.nextCursor});

  final List<KnowledgeItem> items;
  final String? nextCursor;

  factory KnowledgeItemsPage.fromJson(Map<String, dynamic> json) => KnowledgeItemsPage(
    items: (json['items'] as List<dynamic>? ?? [])
        .map((e) => KnowledgeItem.fromJson(e as Map<String, dynamic>))
        .toList(),
    nextCursor: json['nextCursor'] as String?,
  );
}

String _formatDate(DateTime date) => '${date.year}/${date.month}/${date.day}';
