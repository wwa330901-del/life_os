// 公司空間部門＋矩陣權限（2026-08-31 設計）——Department 由空間 OWNER
// 自建，DepartmentRank 掛在各自部門底下（每個部門自己定義自己的職級清
// 單，不是空間共用一份）。

class DepartmentRank {
  const DepartmentRank({required this.id, required this.departmentId, required this.name, required this.sortOrder});

  final String id;
  final String departmentId;
  final String name;
  final int sortOrder;

  factory DepartmentRank.fromJson(Map<String, dynamic> json) => DepartmentRank(
    id: json['id'] as String,
    departmentId: json['departmentId'] as String,
    name: json['name'] as String,
    sortOrder: json['sortOrder'] as int,
  );
}

class Department {
  const Department({required this.id, required this.spaceId, required this.name, required this.sortOrder, required this.ranks});

  final String id;
  final String spaceId;
  final String name;
  final int sortOrder;
  final List<DepartmentRank> ranks;

  factory Department.fromJson(Map<String, dynamic> json) => Department(
    id: json['id'] as String,
    spaceId: json['spaceId'] as String,
    name: json['name'] as String,
    sortOrder: json['sortOrder'] as int,
    ranks: (json['ranks'] as List<dynamic>)
        .map((e) => DepartmentRank.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// 一個模組一條，跟後端 `PermissionResourceType` 一一對應——見
/// `project_life_os_company_space_target_scope` 記憶裡這 8 個模組的清單。
enum PermissionResourceType { project, todos, documents, vendor, quotation, costControl, procurement, paymentRequest }

PermissionResourceType permissionResourceTypeFromJson(String value) => switch (value) {
  'TODOS' => PermissionResourceType.todos,
  'DOCUMENTS' => PermissionResourceType.documents,
  'VENDOR' => PermissionResourceType.vendor,
  'QUOTATION' => PermissionResourceType.quotation,
  'COST_CONTROL' => PermissionResourceType.costControl,
  'PROCUREMENT' => PermissionResourceType.procurement,
  'PAYMENT_REQUEST' => PermissionResourceType.paymentRequest,
  _ => PermissionResourceType.project,
};

String permissionResourceTypeToJson(PermissionResourceType type) => switch (type) {
  PermissionResourceType.project => 'PROJECT',
  PermissionResourceType.todos => 'TODOS',
  PermissionResourceType.documents => 'DOCUMENTS',
  PermissionResourceType.vendor => 'VENDOR',
  PermissionResourceType.quotation => 'QUOTATION',
  PermissionResourceType.costControl => 'COST_CONTROL',
  PermissionResourceType.procurement => 'PROCUREMENT',
  PermissionResourceType.paymentRequest => 'PAYMENT_REQUEST',
};

String permissionResourceTypeLabel(PermissionResourceType type) => switch (type) {
  PermissionResourceType.project => '專案管理',
  PermissionResourceType.todos => '代辦事項',
  PermissionResourceType.documents => '文件簽核',
  PermissionResourceType.vendor => '廠商管理',
  PermissionResourceType.quotation => '工程報價單',
  PermissionResourceType.costControl => '成控管制表',
  PermissionResourceType.procurement => '採發比價表',
  PermissionResourceType.paymentRequest => '工程請款單',
};

/// 「讀」不受這套規則管，只有這三種動作會被擋——見 `PermissionsService`。
enum PermissionAction { write, approve, export }

PermissionAction permissionActionFromJson(String value) => switch (value) {
  'APPROVE' => PermissionAction.approve,
  'EXPORT' => PermissionAction.export,
  _ => PermissionAction.write,
};

String permissionActionToJson(PermissionAction action) => switch (action) {
  PermissionAction.write => 'WRITE',
  PermissionAction.approve => 'APPROVE',
  PermissionAction.export => 'EXPORT',
};

String permissionActionLabel(PermissionAction action) => switch (action) {
  PermissionAction.write => '寫入',
  PermissionAction.approve => '核准',
  PermissionAction.export => '匯出',
};

class PermissionRule {
  const PermissionRule({
    required this.id,
    required this.resourceType,
    required this.action,
    required this.departmentId,
    required this.departmentName,
    required this.rankId,
    required this.rankName,
  });

  final String id;
  final PermissionResourceType resourceType;
  final PermissionAction action;
  final String? departmentId;
  final String? departmentName;
  final String? rankId;
  final String? rankName;

  factory PermissionRule.fromJson(Map<String, dynamic> json) => PermissionRule(
    id: json['id'] as String,
    resourceType: permissionResourceTypeFromJson(json['resourceType'] as String),
    action: permissionActionFromJson(json['action'] as String),
    departmentId: json['departmentId'] as String?,
    departmentName: (json['department'] as Map<String, dynamic>?)?['name'] as String?,
    rankId: json['rankId'] as String?,
    rankName: (json['rank'] as Map<String, dynamic>?)?['name'] as String?,
  );
}
