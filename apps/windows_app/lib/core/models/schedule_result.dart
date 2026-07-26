/// Output of the backend's scheduling engine (`GET /projects/:id/schedule`)
/// — always fetched fresh, never computed client-side, so every client sees
/// identical dates. Field shape mirrors reno_pm's ScheduleResult (`byId` as
/// a map) so the ported Gantt widgets work unchanged; `fromJson` adapts the
/// API's `{tasks: [...]}` array shape into that map.
class ScheduledTask {
  final String workItemId;
  final DateTime start;

  /// Inclusive end date.
  final DateTime end;

  const ScheduledTask({
    required this.workItemId,
    required this.start,
    required this.end,
  });

  factory ScheduledTask.fromJson(Map<String, dynamic> json) => ScheduledTask(
    workItemId: json['workItemId'] as String,
    start: DateTime.parse(json['start'] as String),
    end: DateTime.parse(json['end'] as String),
  );
}

enum SchedulingIssueType { cycleDetected, danglingPredecessor, exceedsContractDeadline }

class SchedulingIssue {
  final SchedulingIssueType type;
  final List<String> involvedWorkItemIds;
  final String message;

  const SchedulingIssue({
    required this.type,
    required this.involvedWorkItemIds,
    required this.message,
  });

  factory SchedulingIssue.fromJson(Map<String, dynamic> json) =>
      SchedulingIssue(
        type: switch (json['type'] as String) {
          'cycleDetected' => SchedulingIssueType.cycleDetected,
          'exceedsContractDeadline' => SchedulingIssueType.exceedsContractDeadline,
          _ => SchedulingIssueType.danglingPredecessor,
        },
        involvedWorkItemIds: (json['involvedWorkItemIds'] as List<dynamic>)
            .cast<String>(),
        message: json['message'] as String,
      );
}

class ScheduleResult {
  final Map<String, ScheduledTask> byId;
  final List<String> topologicalOrder;
  final List<SchedulingIssue> issues;

  const ScheduleResult({
    required this.byId,
    required this.topologicalOrder,
    this.issues = const [],
  });

  bool get hasIssues => issues.isNotEmpty;

  factory ScheduleResult.fromJson(Map<String, dynamic> json) {
    final tasks = (json['tasks'] as List<dynamic>)
        .map((e) => ScheduledTask.fromJson(e as Map<String, dynamic>))
        .toList();
    return ScheduleResult(
      byId: {for (final t in tasks) t.workItemId: t},
      topologicalOrder: (json['topologicalOrder'] as List<dynamic>)
          .cast<String>(),
      issues: (json['issues'] as List<dynamic>)
          .map((e) => SchedulingIssue.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
