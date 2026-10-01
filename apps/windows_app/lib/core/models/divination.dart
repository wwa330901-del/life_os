/// 算命（梅花易數）— see backend `divination/meihua.ts`.
class BirthProfile {
  const BirthProfile({required this.birthDate, required this.birthTime, required this.chart});

  /// YYYY-MM-DD, null = not set yet
  final String? birthDate;

  /// HH:mm, null = unknown
  final String? birthTime;
  final BirthChart? chart;

  factory BirthProfile.fromJson(Map<String, dynamic> json) => BirthProfile(
    birthDate: json['birthDate'] as String?,
    birthTime: json['birthTime'] as String?,
    chart: json['chart'] == null ? null : BirthChart.fromJson(json['chart'] as Map<String, dynamic>),
  );
}

class BirthChart {
  const BirthChart({required this.lunarBirthday, required this.zodiac, required this.pillars, required this.dayMaster});

  final String lunarBirthday;
  final String zodiac;
  final String pillars;
  final String dayMaster;

  factory BirthChart.fromJson(Map<String, dynamic> json) => BirthChart(
    lunarBirthday: json['lunarBirthday'] as String,
    zodiac: json['zodiac'] as String,
    pillars: json['pillars'] as String,
    dayMaster: json['dayMaster'] as String,
  );
}

class DivinationRecord {
  const DivinationRecord({
    required this.id,
    required this.question,
    required this.castAt,
    required this.hexagram,
    required this.interpretation,
    required this.summary,
    this.accuracy,
    this.feedback,
  });

  final String id;
  final String question;
  final DateTime castAt;
  final String hexagram;
  final String interpretation;

  /// 本卦／互卦／變卦／體用 one-liners for display.
  final List<String> summary;

  /// 事後準不準：3＝準、2＝部分準、1＝不準，null＝還沒回饋。
  final int? accuracy;
  final String? feedback;

  factory DivinationRecord.fromJson(Map<String, dynamic> json) {
    final r = json['reading'] as Map<String, dynamic>;
    String name(String key) => (r[key] as Map<String, dynamic>)['name'] as String;
    final ti = r['ti'] as Map<String, dynamic>;
    final yong = r['yong'] as Map<String, dynamic>;
    return DivinationRecord(
      id: json['id'] as String,
      question: json['question'] as String,
      castAt: DateTime.parse(json['castAt'] as String).toLocal(),
      hexagram: json['hexagram'] as String,
      interpretation: json['interpretation'] as String,
      summary: [
        '起卦：${r['lunarDate']}',
        '本卦 ${name('original')}（第 ${r['movingLine']} 爻動）→ 互卦 ${name('mutual')} → 變卦 ${name('changed')}',
        '體 ${ti['trigram']}${ti['element']}、用 ${yong['trigram']}${yong['element']}：${r['relation']}',
      ],
      accuracy: json['accuracy'] as int?,
      feedback: json['feedback'] as String?,
    );
  }
}

const divinationAccuracyLabel = {3: '準', 2: '部分準', 1: '不準'};
