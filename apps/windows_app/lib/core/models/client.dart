/// 客戶資料庫（2026-09，顧問文件「CRM：客戶與協力廠商雙軌管理」的客戶端
/// 那一半——Vendor 是協力商那一半）。掛在公司空間底下，該空間所有成員共
/// 用同一份清單。這輪只做基本資料＋關聯專案，「聯繫紀錄」「業務成案比例
/// 分析」使用者明確要求跳過。
class Client {
  const Client({
    required this.id,
    required this.name,
    required this.contactPerson,
    required this.contactPhone,
    required this.contactEmail,
    required this.address,
    required this.note,
  });

  final String id;
  final String name;
  final String? contactPerson;
  final String? contactPhone;
  final String? contactEmail;
  final String? address;
  final String? note;

  factory Client.fromJson(Map<String, dynamic> json) => Client(
    id: json['id'] as String,
    name: json['name'] as String,
    contactPerson: json['contactPerson'] as String?,
    contactPhone: json['contactPhone'] as String?,
    contactEmail: json['contactEmail'] as String?,
    address: json['address'] as String?,
    note: json['note'] as String?,
  );
}
