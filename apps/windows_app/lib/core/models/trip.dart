/// 旅行規劃（後端 /trips）。
const tripBudgetKeys = ['transport', 'lodging', 'food', 'tickets', 'shopping', 'other'];
const tripBudgetLabels = {
  'transport': '交通',
  'lodging': '住宿',
  'food': '吃飯',
  'tickets': '門票・活動',
  'shopping': '購物',
  'other': '其他',
};

class TripItineraryItem {
  const TripItineraryItem({required this.title, this.time, this.place, this.note});

  final String? time;
  final String title;
  final String? place;
  final String? note;

  factory TripItineraryItem.fromJson(Map<String, dynamic> json) => TripItineraryItem(
    time: json['time'] as String?,
    title: json['title'] as String,
    place: json['place'] as String?,
    note: json['note'] as String?,
  );

  Map<String, dynamic> toJson() => {'time': time, 'title': title, 'place': place, 'note': note};
}

class TripDay {
  const TripDay({required this.date, required this.items});

  final String date;
  final List<TripItineraryItem> items;

  factory TripDay.fromJson(Map<String, dynamic> json) => TripDay(
    date: json['date'] as String,
    items: [for (final i in json['items'] as List<dynamic>) TripItineraryItem.fromJson(i as Map<String, dynamic>)],
  );

  Map<String, dynamic> toJson() => {'date': date, 'items': [for (final i in items) i.toJson()]};
}

class PackingItem {
  const PackingItem({required this.item, required this.packed});

  final String item;
  final bool packed;

  factory PackingItem.fromJson(Map<String, dynamic> json) =>
      PackingItem(item: json['item'] as String, packed: json['packed'] as bool? ?? false);

  Map<String, dynamic> toJson() => {'item': item, 'packed': packed};
}

class Trip {
  const Trip({
    required this.id,
    required this.destination,
    required this.startDate,
    required this.endDate,
    required this.days,
    required this.daysUntil,
    required this.status,
    required this.travelers,
    required this.itinerary,
    required this.packingList,
    required this.inCalendar,
    required this.inWishlist,
    required this.spentByCategory,
    this.style,
    this.budget,
    this.budgetTotal,
    this.tips,
    this.notes,
    this.spent,
  });

  final String id;
  final String destination;
  final String startDate;
  final String endDate;
  final int days;
  final int daysUntil;

  /// upcoming | ongoing | done
  final String status;
  final int travelers;
  final String? style;
  final Map<String, double>? budget;
  final double? budgetTotal;
  final List<TripDay> itinerary;
  final List<PackingItem> packingList;
  final String? tips;
  final String? notes;
  final bool inCalendar;
  final bool inWishlist;

  /// 旅行期間記帳的支出（還沒出發是 null）。
  final double? spent;
  final List<({String name, double total})> spentByCategory;

  factory Trip.fromJson(Map<String, dynamic> json) {
    final budget = json['budget'] as Map<String, dynamic>?;
    return Trip(
      id: json['id'] as String,
      destination: json['destination'] as String,
      startDate: json['startDate'] as String,
      endDate: json['endDate'] as String,
      days: json['days'] as int,
      daysUntil: json['daysUntil'] as int,
      status: json['status'] as String,
      travelers: json['travelers'] as int,
      style: json['style'] as String?,
      budget: budget == null ? null : {for (final e in budget.entries) e.key: (e.value as num).toDouble()},
      budgetTotal: (json['budgetTotal'] as num?)?.toDouble(),
      itinerary: [for (final d in json['itinerary'] as List<dynamic>) TripDay.fromJson(d as Map<String, dynamic>)],
      packingList: [for (final p in json['packingList'] as List<dynamic>) PackingItem.fromJson(p as Map<String, dynamic>)],
      tips: json['tips'] as String?,
      notes: json['notes'] as String?,
      inCalendar: json['inCalendar'] as bool? ?? false,
      inWishlist: json['inWishlist'] as bool? ?? false,
      spent: (json['spent'] as num?)?.toDouble(),
      spentByCategory: [
        for (final c in (json['spentByCategory'] as List<dynamic>? ?? const []))
          (name: (c as Map<String, dynamic>)['name'] as String, total: (c['total'] as num).toDouble()),
      ],
    );
  }
}
