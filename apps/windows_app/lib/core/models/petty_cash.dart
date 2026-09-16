/// 零用金規則（2026-09，顧問文件財務系統子項）——掛在公司空間底下，全空
/// 間共用同一本帳。見後端 `apps/api/src/petty-cash/petty-cash.service.ts`。
library;

enum PettyCashType { deposit, expense }

class PettyCashTransaction {
  const PettyCashTransaction({
    required this.id,
    required this.transactionDate,
    required this.type,
    required this.amount,
    required this.purpose,
    required this.projectId,
    required this.projectName,
  });

  final String id;
  final DateTime transactionDate;
  final PettyCashType type;
  final double amount;
  final String purpose;
  final String? projectId;
  final String? projectName;

  factory PettyCashTransaction.fromJson(Map<String, dynamic> json) {
    final project = json['project'] as Map<String, dynamic>?;
    return PettyCashTransaction(
      id: json['id'] as String,
      transactionDate: DateTime.parse(json['transactionDate'] as String),
      type: (json['type'] as String) == 'DEPOSIT' ? PettyCashType.deposit : PettyCashType.expense,
      amount: (json['amount'] as num).toDouble(),
      purpose: json['purpose'] as String,
      projectId: project?['id'] as String?,
      projectName: project?['name'] as String?,
    );
  }
}

class PettyCashLedger {
  const PettyCashLedger({required this.transactions, required this.balance});

  final List<PettyCashTransaction> transactions;
  final double balance;

  factory PettyCashLedger.fromJson(Map<String, dynamic> json) => PettyCashLedger(
    transactions: (json['transactions'] as List<dynamic>)
        .map((e) => PettyCashTransaction.fromJson(e as Map<String, dynamic>))
        .toList(),
    balance: (json['balance'] as num).toDouble(),
  );
}
