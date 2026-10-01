class AiUsagePeriodSummary {
  const AiUsagePeriodSummary({
    required this.count,
    required this.inputTokens,
    required this.outputTokens,
    required this.costUsd,
  });

  final int count;
  final int inputTokens;
  final int outputTokens;
  final double costUsd;

  factory AiUsagePeriodSummary.fromJson(Map<String, dynamic> json) => AiUsagePeriodSummary(
    count: json['count'] as int,
    inputTokens: json['inputTokens'] as int,
    outputTokens: json['outputTokens'] as int,
    costUsd: (json['costUsd'] as num).toDouble(),
  );
}

enum AiUsageStatus { success, failed }

extension AiUsageStatusJson on AiUsageStatus {
  static AiUsageStatus fromJson(String value) => value == 'FAILED' ? AiUsageStatus.failed : AiUsageStatus.success;
}

class AiUsageLogEntry {
  const AiUsageLogEntry({
    required this.id,
    required this.feature,
    required this.model,
    required this.inputTokens,
    required this.outputTokens,
    required this.costUsd,
    required this.durationMs,
    required this.status,
    required this.createdAt,
    this.errorMessage,
  });

  final String id;
  final String feature;
  final String model;
  final int inputTokens;
  final int outputTokens;
  final double costUsd;
  final int durationMs;
  final AiUsageStatus status;
  final String? errorMessage;
  final DateTime createdAt;

  factory AiUsageLogEntry.fromJson(Map<String, dynamic> json) => AiUsageLogEntry(
    id: json['id'] as String,
    feature: json['feature'] as String,
    model: json['model'] as String,
    inputTokens: json['inputTokens'] as int,
    outputTokens: json['outputTokens'] as int,
    costUsd: (json['costUsd'] as num).toDouble(),
    durationMs: json['durationMs'] as int,
    status: AiUsageStatusJson.fromJson(json['status'] as String),
    errorMessage: json['errorMessage'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

/// This user's own AI usage only — there is no cross-account view.
class AiUsageHistory {
  const AiUsageHistory({
    required this.today,
    required this.thisWeek,
    required this.thisMonth,
    required this.recentEntries,
  });

  final AiUsagePeriodSummary today;
  final AiUsagePeriodSummary thisWeek;
  final AiUsagePeriodSummary thisMonth;
  final List<AiUsageLogEntry> recentEntries;

  factory AiUsageHistory.fromJson(Map<String, dynamic> json) => AiUsageHistory(
    today: AiUsagePeriodSummary.fromJson(json['today'] as Map<String, dynamic>),
    thisWeek: AiUsagePeriodSummary.fromJson(json['thisWeek'] as Map<String, dynamic>),
    thisMonth: AiUsagePeriodSummary.fromJson(json['thisMonth'] as Map<String, dynamic>),
    recentEntries: (json['recentEntries'] as List<dynamic>)
        .map((e) => AiUsageLogEntry.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// 管理員看的 AI 用量（GET /admin/ai-usage）。
class AdminAiUsageStat {
  const AdminAiUsageStat({required this.count, required this.costUsd, required this.failures});

  final int count;
  final double costUsd;
  final int failures;

  factory AdminAiUsageStat.fromJson(Map<String, dynamic> json) => AdminAiUsageStat(
    count: json['count'] as int,
    costUsd: (json['costUsd'] as num).toDouble(),
    failures: json['failures'] as int,
  );
}

class AdminAiUsageRow {
  const AdminAiUsageRow({required this.label, required this.stat});

  final String label;
  final AdminAiUsageStat stat;
}

class AdminAiUsageFailure {
  const AdminAiUsageFailure({required this.at, required this.user, required this.feature, this.error});

  final DateTime at;
  final String user;
  final String feature;
  final String? error;
}

class AdminAiUsage {
  const AdminAiUsage({
    required this.today,
    required this.thisWeek,
    required this.thisMonth,
    required this.users,
    required this.features,
    required this.daily,
    required this.recentFailures,
  });

  final AdminAiUsageStat today;
  final AdminAiUsageStat thisWeek;
  final AdminAiUsageStat thisMonth;
  final List<AdminAiUsageRow> users;
  final List<AdminAiUsageRow> features;

  /// 近 14 天，舊到新；label 是 'YYYY-MM-DD'。
  final List<AdminAiUsageRow> daily;
  final List<AdminAiUsageFailure> recentFailures;

  factory AdminAiUsage.fromJson(Map<String, dynamic> json) {
    AdminAiUsageStat stat(dynamic v) => AdminAiUsageStat.fromJson(v as Map<String, dynamic>);
    List<AdminAiUsageRow> rows(String key, String labelKey) => (json[key] as List<dynamic>)
        .map((e) => e as Map<String, dynamic>)
        .map((e) => AdminAiUsageRow(label: e[labelKey] as String, stat: AdminAiUsageStat.fromJson(e)))
        .toList();
    return AdminAiUsage(
      today: stat(json['today']),
      thisWeek: stat(json['thisWeek']),
      thisMonth: stat(json['thisMonth']),
      users: rows('users', 'name'),
      features: rows('features', 'label'),
      daily: rows('daily', 'date'),
      recentFailures: (json['recentFailures'] as List<dynamic>)
          .map((e) => e as Map<String, dynamic>)
          .map(
            (e) => AdminAiUsageFailure(
              at: DateTime.parse(e['at'] as String).toLocal(),
              user: e['user'] as String,
              feature: e['feature'] as String,
              error: e['error'] as String?,
            ),
          )
          .toList(),
    );
  }
}
