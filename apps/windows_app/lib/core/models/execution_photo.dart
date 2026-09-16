/// 執行照片（2026-09，顧問文件「工程執行紀錄系統」第四項，即日報表當初
/// 刻意排除的「執行紀錄留存」）。[photoUrl] 是後端現簽的短效網址（1 小
/// 時內有效，見 SupabaseStorageService.getSignedUrl），可能是 null（例如
/// 檔案儲存服務尚未設定），畫面要能處理拿不到圖的情況。
class ExecutionPhoto {
  const ExecutionPhoto({
    required this.id,
    required this.photoDate,
    required this.caption,
    required this.photoUrl,
    required this.uploadedByName,
    required this.createdAt,
  });

  final String id;
  final DateTime photoDate;
  final String? caption;
  final String? photoUrl;
  final String uploadedByName;
  final DateTime createdAt;

  factory ExecutionPhoto.fromJson(Map<String, dynamic> json) => ExecutionPhoto(
    id: json['id'] as String,
    photoDate: DateTime.parse(json['photoDate'] as String),
    caption: json['caption'] as String?,
    photoUrl: json['photoUrl'] as String?,
    uploadedByName: (json['uploadedBy'] as Map<String, dynamic>)['name'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
  );
}
