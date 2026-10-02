/// 退休試算（後端 GET /retirement）。金額都是今天的幣值。
class RetirementSettings {
  const RetirementSettings({
    required this.retireAge,
    required this.lifeExpectancy,
    required this.returnRate,
    required this.inflation,
    required this.pensionMonthly,
    required this.pensionStartAge,
    this.monthlyExpense,
    this.monthlySaving,
    this.age,
  });

  final double retireAge;
  final double lifeExpectancy;
  final double returnRate;
  final double inflation;
  final double pensionMonthly;
  final double pensionStartAge;

  /// null＝用近 6 個月平均。
  final double? monthlyExpense;
  final double? monthlySaving;

  /// 沒有生日時自己填的年齡。
  final double? age;

  factory RetirementSettings.fromJson(Map<String, dynamic> json) => RetirementSettings(
    retireAge: (json['retireAge'] as num).toDouble(),
    lifeExpectancy: (json['lifeExpectancy'] as num).toDouble(),
    returnRate: (json['returnRate'] as num).toDouble(),
    inflation: (json['inflation'] as num).toDouble(),
    pensionMonthly: (json['pensionMonthly'] as num).toDouble(),
    pensionStartAge: (json['pensionStartAge'] as num? ?? 65).toDouble(),
    monthlyExpense: (json['monthlyExpense'] as num?)?.toDouble(),
    monthlySaving: (json['monthlySaving'] as num?)?.toDouble(),
    age: (json['age'] as num?)?.toDouble(),
  );
}

class RetirementProjection {
  const RetirementProjection({
    required this.age,
    required this.retireAge,
    required this.assets,
    required this.monthlySaving,
    required this.monthlyExpense,
    required this.assetsAtRetire,
    required this.needAtRetire,
    required this.gap,
    required this.onTrack,
    required this.requiredMonthlySaving,
    required this.realReturnRate,
    required this.series,
    required this.scenarios,
    this.earliestAge,
    this.depletionAge,
  });

  final double age;
  final double retireAge;
  final double assets;
  final double monthlySaving;
  final double monthlyExpense;
  final double assetsAtRetire;
  final double needAtRetire;

  /// 正的＝還差多少。
  final double gap;
  final bool onTrack;
  final double requiredMonthlySaving;
  final double realReturnRate;
  final int? earliestAge;
  final int? depletionAge;
  final List<({int age, double assets})> series;
  final List<({int extraMonthly, int? earliestAge})> scenarios;

  factory RetirementProjection.fromJson(Map<String, dynamic> json) => RetirementProjection(
    age: (json['age'] as num).toDouble(),
    retireAge: (json['retireAge'] as num).toDouble(),
    assets: (json['assets'] as num).toDouble(),
    monthlySaving: (json['monthlySaving'] as num).toDouble(),
    monthlyExpense: (json['monthlyExpense'] as num).toDouble(),
    assetsAtRetire: (json['assetsAtRetire'] as num).toDouble(),
    needAtRetire: (json['needAtRetire'] as num).toDouble(),
    gap: (json['gap'] as num).toDouble(),
    onTrack: json['onTrack'] as bool,
    requiredMonthlySaving: (json['requiredMonthlySaving'] as num).toDouble(),
    realReturnRate: (json['realReturnRate'] as num).toDouble(),
    earliestAge: json['earliestAge'] as int?,
    depletionAge: json['depletionAge'] as int?,
    series: [
      for (final s in json['series'] as List<dynamic>)
        (age: (s as Map<String, dynamic>)['age'] as int, assets: (s['assets'] as num).toDouble()),
    ],
    scenarios: [
      for (final s in json['scenarios'] as List<dynamic>)
        (extraMonthly: (s as Map<String, dynamic>)['extraMonthly'] as int, earliestAge: s['earliestAge'] as int?),
    ],
  );
}

class RetirementReport {
  const RetirementReport({
    required this.needsAge,
    required this.needsExpense,
    required this.settings,
    required this.autoMonthlySaving,
    required this.autoMonthlyExpense,
    required this.autoAssets,
    this.autoAge,
    this.projection,
  });

  final bool needsAge;
  final bool needsExpense;
  final RetirementSettings settings;
  final double autoMonthlySaving;
  final double autoMonthlyExpense;
  final double autoAssets;
  final int? autoAge;
  final RetirementProjection? projection;

  factory RetirementReport.fromJson(Map<String, dynamic> json) {
    final auto = json['auto'] as Map<String, dynamic>;
    final projection = json['projection'] as Map<String, dynamic>?;
    return RetirementReport(
      needsAge: json['needsAge'] as bool,
      needsExpense: json['needsExpense'] as bool? ?? false,
      settings: RetirementSettings.fromJson(json['settings'] as Map<String, dynamic>),
      autoMonthlySaving: (auto['monthlySaving'] as num).toDouble(),
      autoMonthlyExpense: (auto['monthlyExpense'] as num).toDouble(),
      autoAssets: (auto['assets'] as num).toDouble(),
      autoAge: auto['age'] as int?,
      projection: projection == null ? null : RetirementProjection.fromJson(projection),
    );
  }
}
