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
