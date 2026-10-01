/// 購物車（後端 GET /wishlist）。
class WishlistItem {
  const WishlistItem({
    required this.id,
    required this.name,
    required this.price,
    required this.priority,
    this.targetDate,
    this.note,
    this.affordableMonth,
    this.onTime,
    this.neededMonthly,
  });

  final String id;
  final String name;
  final double price;

  /// 1 高、2 中、3 低。
  final int priority;
  final String? targetDate;
  final String? note;

  /// 'YYYY-MM'：照每月撥的錢，大概哪個月買得起；null＝排不出來。
  final String? affordableMonth;
  final bool? onTime;
  final double? neededMonthly;

  factory WishlistItem.fromJson(Map<String, dynamic> json) => WishlistItem(
    id: json['id'] as String,
    name: json['name'] as String,
    price: (json['price'] as num).toDouble(),
    priority: json['priority'] as int,
    targetDate: json['targetDate'] as String?,
    note: json['note'] as String?,
    affordableMonth: json['affordableMonth'] as String?,
    onTime: json['onTime'] as bool?,
    neededMonthly: (json['neededMonthly'] as num?)?.toDouble(),
  );
}

class WishlistOverview {
  const WishlistOverview({
    required this.monthlyBudget,
    required this.budgetIsCustom,
    required this.suggestedBudget,
    required this.averageMonthlySurplus,
    required this.total,
    required this.items,
  });

  final double monthlyBudget;
  final bool budgetIsCustom;
  final double suggestedBudget;
  final double averageMonthlySurplus;
  final double total;
  final List<WishlistItem> items;

  factory WishlistOverview.fromJson(Map<String, dynamic> json) => WishlistOverview(
    monthlyBudget: (json['monthlyBudget'] as num).toDouble(),
    budgetIsCustom: json['budgetIsCustom'] as bool,
    suggestedBudget: (json['suggestedBudget'] as num).toDouble(),
    averageMonthlySurplus: (json['averageMonthlySurplus'] as num).toDouble(),
    total: (json['total'] as num).toDouble(),
    items: (json['items'] as List<dynamic>).map((e) => WishlistItem.fromJson(e as Map<String, dynamic>)).toList(),
  );
}
