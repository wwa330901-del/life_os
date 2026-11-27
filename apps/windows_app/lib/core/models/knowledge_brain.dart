/// 知識庫大腦（2026-11-27）的資料：首頁、大腦地圖、一則的相關收藏。
library;

class BrainEvent {
  const BrainEvent({
    required this.id,
    required this.title,
    this.startDate,
    this.endDate,
    this.daysLeft,
    required this.started,
  });

  final String id;
  final String title;
  final DateTime? startDate;
  final DateTime? endDate;
  final int? daysLeft;
  final bool started;

  factory BrainEvent.fromJson(Map<String, dynamic> json) => BrainEvent(
    id: json['id'] as String,
    title: (json['title'] as String?) ?? '未命名',
    startDate: _date(json['startDate']),
    endDate: _date(json['endDate']),
    daysLeft: json['daysLeft'] as int?,
    started: json['started'] as bool? ?? true,
  );

  /// 「還剩 9 天 · 12/6 結束」「12/12 開始」這種一行字。
  String get whenText {
    if (!started && startDate != null) return '${startDate!.month}/${startDate!.day} 開始';
    if (endDate == null) return '';
    if (daysLeft == 0) return '今天最後一天';
    return '還剩 $daysLeft 天 · ${endDate!.month}/${endDate!.day} 結束';
  }

  bool get urgent => started && daysLeft != null && daysLeft! <= 14;
}

class BrainUnread {
  const BrainUnread({required this.id, required this.title, this.sourcePlatform});

  final String id;
  final String title;
  final String? sourcePlatform;

  factory BrainUnread.fromJson(Map<String, dynamic> json) => BrainUnread(
    id: json['id'] as String,
    title: (json['title'] as String?) ?? '未命名',
    sourcePlatform: json['sourcePlatform'] as String?,
  );
}

class BrainTopic {
  const BrainTopic({required this.id, required this.name, required this.count});

  final String id;
  final String name;
  final int count;

  factory BrainTopic.fromJson(Map<String, dynamic> json) =>
      BrainTopic(id: json['id'] as String, name: json['name'] as String, count: (json['count'] as num?)?.toInt() ?? 0);
}

class BrainOverview {
  const BrainOverview({
    required this.total,
    required this.topicCount,
    required this.events,
    required this.unread,
    required this.unreadCount,
    required this.topTopics,
  });

  final int total;
  final int topicCount;
  final List<BrainEvent> events;
  final List<BrainUnread> unread;
  final int unreadCount;
  final List<BrainTopic> topTopics;

  factory BrainOverview.fromJson(Map<String, dynamic> json) => BrainOverview(
    total: (json['total'] as num).toInt(),
    topicCount: (json['topicCount'] as num).toInt(),
    events: _list(json['events'], BrainEvent.fromJson),
    unread: _list(json['unread'], BrainUnread.fromJson),
    unreadCount: (json['unreadCount'] as num).toInt(),
    topTopics: _list(json['topTopics'], BrainTopic.fromJson),
  );
}

class BrainGraphItem {
  const BrainGraphItem({required this.id, required this.title, required this.read, this.eventEndDate});

  final String id;
  final String title;
  final bool read;
  final DateTime? eventEndDate;

  factory BrainGraphItem.fromJson(Map<String, dynamic> json) => BrainGraphItem(
    id: json['id'] as String,
    title: json['title'] as String,
    read: json['read'] as bool? ?? true,
    eventEndDate: _date(json['eventEndDate']),
  );
}

class BrainGraphEdge {
  const BrainGraphEdge({required this.from, required this.to, required this.toTopic});

  final String from;
  final String to;

  /// true：收藏→主題點；false：收藏↔收藏。
  final bool toTopic;

  factory BrainGraphEdge.fromJson(Map<String, dynamic> json) =>
      BrainGraphEdge(from: json['from'] as String, to: json['to'] as String, toTopic: json['kind'] == 'topic');
}

class BrainGraph {
  const BrainGraph({required this.topics, required this.items, required this.edges});

  final List<BrainTopic> topics;
  final List<BrainGraphItem> items;
  final List<BrainGraphEdge> edges;

  factory BrainGraph.fromJson(Map<String, dynamic> json) => BrainGraph(
    topics: _list(json['topics'], BrainTopic.fromJson),
    items: _list(json['items'], BrainGraphItem.fromJson),
    edges: _list(json['edges'], BrainGraphEdge.fromJson),
  );
}

class BrainRelated {
  const BrainRelated({required this.id, required this.title, this.reason});

  final String id;
  final String title;
  final String? reason;

  factory BrainRelated.fromJson(Map<String, dynamic> json) =>
      BrainRelated(id: json['id'] as String, title: json['title'] as String, reason: json['reason'] as String?);
}

class BrainConnections {
  const BrainConnections({required this.topics, required this.related});

  final List<BrainTopic> topics;
  final List<BrainRelated> related;

  factory BrainConnections.fromJson(Map<String, dynamic> json) => BrainConnections(
    topics: _list(json['topics'], BrainTopic.fromJson),
    related: _list(json['related'], BrainRelated.fromJson),
  );
}

class BrainTopicItem {
  const BrainTopicItem({required this.id, required this.title, this.summary, required this.read});

  final String id;
  final String title;
  final String? summary;
  final bool read;

  factory BrainTopicItem.fromJson(Map<String, dynamic> json) => BrainTopicItem(
    id: json['id'] as String,
    title: (json['title'] as String?) ?? '未命名',
    summary: json['summary'] as String?,
    read: json['readAt'] != null,
  );
}

class BrainTopicDetail {
  const BrainTopicDetail({required this.id, required this.name, required this.items});

  final String id;
  final String name;
  final List<BrainTopicItem> items;

  factory BrainTopicDetail.fromJson(Map<String, dynamic> json) => BrainTopicDetail(
    id: json['id'] as String,
    name: json['name'] as String,
    items: _list(json['items'], BrainTopicItem.fromJson),
  );
}

DateTime? _date(Object? value) => value is String ? DateTime.parse(value) : null;

List<T> _list<T>(Object? value, T Function(Map<String, dynamic>) fromJson) =>
    (value as List<dynamic>? ?? []).map((e) => fromJson(e as Map<String, dynamic>)).toList();

/// 首頁「從大腦翻出來的」一則。
class BrainRandomItem {
  const BrainRandomItem({
    required this.id,
    required this.title,
    this.summary,
    this.sourcePlatform,
    required this.read,
    required this.topics,
    this.imageUrl,
    required this.createdAt,
  });

  final String id;
  final String title;
  final String? summary;
  final String? sourcePlatform;
  final bool read;
  final List<String> topics;
  final String? imageUrl;
  final DateTime createdAt;

  factory BrainRandomItem.fromJson(Map<String, dynamic> json) => BrainRandomItem(
    id: json['id'] as String,
    title: json['title'] as String,
    summary: json['summary'] as String?,
    sourcePlatform: json['sourcePlatform'] as String?,
    read: json['read'] as bool? ?? true,
    topics: (json['topics'] as List<dynamic>? ?? []).map((e) => e as String).toList(),
    imageUrl: json['imageUrl'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}
