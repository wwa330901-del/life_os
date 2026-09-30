/// 日記 — see schema.prisma's `JournalEntry`. [mood] is 1（很差）…5（很好）.
class JournalEntry {
  const JournalEntry({
    required this.id,
    required this.date,
    required this.content,
    required this.mood,
    required this.tags,
  });

  final String id;

  /// Date-only (the Taipei calendar day the entry is about).
  final DateTime date;
  final String content;
  final int? mood;
  final List<String> tags;

  factory JournalEntry.fromJson(Map<String, dynamic> json) {
    final date = DateTime.parse(json['date'] as String);
    return JournalEntry(
      id: json['id'] as String,
      date: DateTime(date.year, date.month, date.day),
      content: json['content'] as String,
      mood: json['mood'] as int?,
      tags: (json['tags'] as List<dynamic>).cast<String>(),
    );
  }
}

const journalMoodEmoji = ['', '😞', '😕', '😐', '🙂', '😄'];
const journalMoodLabel = ['', '很差', '不太好', '普通', '不錯', '很好'];

String journalDateKey(DateTime date) =>
    '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
