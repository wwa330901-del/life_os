/// 工程財務四表 (2026-08-07) — 工程報價單/採發比價表/成控管制表/工程請款單。
/// 見後端 `apps/api/src/engineering-finance/` 底下各 service 的說明。
library;

class QuotationItem {
  const QuotationItem({
    required this.id,
    required this.projectId,
    required this.name,
    required this.sortOrder,
    required this.unitPrice,
    required this.quantity,
    required this.costUnitPrice,
    required this.complexPrice,
    required this.costComplexPrice,
    required this.profit,
    required this.marginRate,
  });

  final String id;
  final String projectId;
  final String name;
  final int sortOrder;
  final double unitPrice;
  final double quantity;
  final double costUnitPrice;
  final double complexPrice;
  final double costComplexPrice;
  final double profit;
  final double marginRate;

  factory QuotationItem.fromJson(Map<String, dynamic> json) => QuotationItem(
    id: json['id'] as String,
    projectId: json['projectId'] as String,
    name: json['name'] as String,
    sortOrder: json['sortOrder'] as int,
    unitPrice: (json['unitPrice'] as num).toDouble(),
    quantity: (json['quantity'] as num).toDouble(),
    costUnitPrice: (json['costUnitPrice'] as num).toDouble(),
    complexPrice: (json['complexPrice'] as num).toDouble(),
    costComplexPrice: (json['costComplexPrice'] as num).toDouble(),
    profit: (json['profit'] as num).toDouble(),
    marginRate: (json['marginRate'] as num).toDouble(),
  );
}

class QuotationSummary {
  const QuotationSummary({
    required this.complexPrice,
    required this.costComplexPrice,
    required this.profit,
    required this.marginRate,
  });

  final double complexPrice;
  final double costComplexPrice;
  final double profit;
  final double marginRate;

  factory QuotationSummary.fromJson(Map<String, dynamic> json) => QuotationSummary(
    complexPrice: (json['complexPrice'] as num).toDouble(),
    costComplexPrice: (json['costComplexPrice'] as num).toDouble(),
    profit: (json['profit'] as num).toDouble(),
    marginRate: (json['marginRate'] as num).toDouble(),
  );
}

class QuotationList {
  const QuotationList({required this.items, required this.summary});

  final List<QuotationItem> items;
  final QuotationSummary summary;

  factory QuotationList.fromJson(Map<String, dynamic> json) => QuotationList(
    items: (json['items'] as List<dynamic>)
        .map((e) => QuotationItem.fromJson(e as Map<String, dynamic>))
        .toList(),
    summary: QuotationSummary.fromJson(json['summary'] as Map<String, dynamic>),
  );
}

class VendorQuote {
  const VendorQuote({
    required this.id,
    required this.comparisonId,
    required this.vendorName,
    required this.quotedAmount,
    required this.note,
    required this.attachmentFilePath,
    required this.attachmentUrl,
  });

  final String id;
  final String comparisonId;
  final String vendorName;
  final double quotedAmount;
  final String? note;
  final String? attachmentFilePath;
  final String? attachmentUrl;

  factory VendorQuote.fromJson(Map<String, dynamic> json) => VendorQuote(
    id: json['id'] as String,
    comparisonId: json['comparisonId'] as String,
    vendorName: json['vendorName'] as String,
    quotedAmount: (json['quotedAmount'] as num).toDouble(),
    note: json['note'] as String?,
    attachmentFilePath: json['attachmentFilePath'] as String?,
    attachmentUrl: json['attachmentUrl'] as String?,
  );
}

class ProcurementComparison {
  const ProcurementComparison({
    required this.id,
    required this.projectId,
    required this.scopeName,
    required this.finalAwardedAmount,
    required this.selectedVendorQuoteId,
    required this.vendorQuotes,
  });

  final String id;
  final String projectId;
  final String scopeName;
  final double? finalAwardedAmount;
  final String? selectedVendorQuoteId;
  final List<VendorQuote> vendorQuotes;

  factory ProcurementComparison.fromJson(Map<String, dynamic> json) => ProcurementComparison(
    id: json['id'] as String,
    projectId: json['projectId'] as String,
    scopeName: json['scopeName'] as String,
    finalAwardedAmount: json['finalAwardedAmount'] == null
        ? null
        : (json['finalAwardedAmount'] as num).toDouble(),
    selectedVendorQuoteId: json['selectedVendorQuoteId'] as String?,
    vendorQuotes: (json['vendorQuotes'] as List<dynamic>)
        .map((e) => VendorQuote.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class CostControlAdjustment {
  const CostControlAdjustment({
    required this.id,
    required this.type,
    required this.amount,
    required this.note,
  });

  final String id;
  final String type; // 'ADD' | 'DEDUCT'
  final double amount;
  final String? note;

  factory CostControlAdjustment.fromJson(Map<String, dynamic> json) => CostControlAdjustment(
    id: json['id'] as String,
    type: json['type'] as String,
    amount: (json['amount'] as num).toDouble(),
    note: json['note'] as String?,
  );
}

class CostControlRow {
  const CostControlRow({
    required this.id,
    required this.projectId,
    required this.name,
    required this.sortOrder,
    required this.procurementComparisonId,
    required this.quotationItems,
    required this.quoteRevenueTotal,
    required this.estimatedCostTotal,
    required this.awardedAmount,
    required this.adjustmentsTotal,
    required this.contractAmount,
    required this.billedTotal,
    required this.billedPercent,
    required this.adjustments,
  });

  final String id;
  final String projectId;
  final String name;
  final int sortOrder;
  final String? procurementComparisonId;
  final List<QuotationItem> quotationItems;
  final double quoteRevenueTotal;
  final double estimatedCostTotal;
  final double? awardedAmount;
  final double adjustmentsTotal;
  final double contractAmount;
  final double billedTotal;
  final double billedPercent;
  final List<CostControlAdjustment> adjustments;

  factory CostControlRow.fromJson(Map<String, dynamic> json) => CostControlRow(
    id: json['id'] as String,
    projectId: json['projectId'] as String,
    name: json['name'] as String,
    sortOrder: json['sortOrder'] as int,
    procurementComparisonId: json['procurementComparisonId'] as String?,
    quotationItems: (json['quotationItems'] as List<dynamic>)
        .map((e) => _quotationItemFromRowJson(e as Map<String, dynamic>))
        .toList(),
    quoteRevenueTotal: (json['quoteRevenueTotal'] as num).toDouble(),
    estimatedCostTotal: (json['estimatedCostTotal'] as num).toDouble(),
    awardedAmount: json['awardedAmount'] == null ? null : (json['awardedAmount'] as num).toDouble(),
    adjustmentsTotal: (json['adjustmentsTotal'] as num).toDouble(),
    contractAmount: (json['contractAmount'] as num).toDouble(),
    billedTotal: (json['billedTotal'] as num).toDouble(),
    billedPercent: (json['billedPercent'] as num).toDouble(),
    adjustments: (json['adjustments'] as List<dynamic>)
        .map((e) => CostControlAdjustment.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// `CostControlRow.quotationItems` 是原始 `QuotationLineItem`（沒有
/// complexPrice 等衍生欄位），這裡現算補上，跟 `QuotationItem.fromJson`
/// 分開是因為來源 JSON 形狀不同（沒有 complexPrice/profit/marginRate）。
QuotationItem _quotationItemFromRowJson(Map<String, dynamic> json) {
  final unitPrice = (json['unitPrice'] as num).toDouble();
  final quantity = (json['quantity'] as num).toDouble();
  final costUnitPrice = (json['costUnitPrice'] as num).toDouble();
  final complexPrice = unitPrice * quantity;
  final costComplexPrice = costUnitPrice * quantity;
  final profit = complexPrice - costComplexPrice;
  return QuotationItem(
    id: json['id'] as String,
    projectId: json['projectId'] as String,
    name: json['name'] as String,
    sortOrder: json['sortOrder'] as int? ?? 0,
    unitPrice: unitPrice,
    quantity: quantity,
    costUnitPrice: costUnitPrice,
    complexPrice: complexPrice,
    costComplexPrice: costComplexPrice,
    profit: profit,
    marginRate: complexPrice != 0 ? profit / complexPrice : 0,
  );
}

class CostControlBreakdown {
  const CostControlBreakdown({
    required this.rowId,
    required this.rowName,
    required this.items,
    required this.totalComplexPrice,
    required this.totalCostComplexPrice,
  });

  final String rowId;
  final String rowName;
  final List<CostControlBreakdownItem> items;
  final double totalComplexPrice;
  final double totalCostComplexPrice;

  factory CostControlBreakdown.fromJson(Map<String, dynamic> json) => CostControlBreakdown(
    rowId: json['rowId'] as String,
    rowName: json['rowName'] as String,
    items: (json['items'] as List<dynamic>)
        .map((e) => CostControlBreakdownItem.fromJson(e as Map<String, dynamic>))
        .toList(),
    totalComplexPrice: (json['totalComplexPrice'] as num).toDouble(),
    totalCostComplexPrice: (json['totalCostComplexPrice'] as num).toDouble(),
  );
}

class CostControlBreakdownItem {
  const CostControlBreakdownItem({
    required this.id,
    required this.name,
    required this.unitPrice,
    required this.quantity,
    required this.complexPrice,
    required this.costUnitPrice,
    required this.costComplexPrice,
  });

  final String id;
  final String name;
  final double unitPrice;
  final double quantity;
  final double complexPrice;
  final double costUnitPrice;
  final double costComplexPrice;

  factory CostControlBreakdownItem.fromJson(Map<String, dynamic> json) => CostControlBreakdownItem(
    id: json['id'] as String,
    name: json['name'] as String,
    unitPrice: (json['unitPrice'] as num).toDouble(),
    quantity: (json['quantity'] as num).toDouble(),
    complexPrice: (json['complexPrice'] as num).toDouble(),
    costUnitPrice: (json['costUnitPrice'] as num).toDouble(),
    costComplexPrice: (json['costComplexPrice'] as num).toDouble(),
  );
}

/// 五關固定順序，跟後端 `PaymentRequestStage` 一致。
enum PaymentRequestStageKey { salesManager, financeReview, costControlApprover, generalManager, accounting }

extension PaymentRequestStageKeyX on PaymentRequestStageKey {
  String get wireValue => switch (this) {
    PaymentRequestStageKey.salesManager => 'salesManager',
    PaymentRequestStageKey.financeReview => 'financeReview',
    PaymentRequestStageKey.costControlApprover => 'costControlApprover',
    PaymentRequestStageKey.generalManager => 'generalManager',
    PaymentRequestStageKey.accounting => 'accounting',
  };

  String get label => switch (this) {
    PaymentRequestStageKey.salesManager => '業務主管',
    PaymentRequestStageKey.financeReview => '財務初審',
    PaymentRequestStageKey.costControlApprover => '成控',
    PaymentRequestStageKey.generalManager => '總經理',
    PaymentRequestStageKey.accounting => '會計出納',
  };
}

const kPaymentRequestStageOrder = [
  PaymentRequestStageKey.salesManager,
  PaymentRequestStageKey.financeReview,
  PaymentRequestStageKey.costControlApprover,
  PaymentRequestStageKey.generalManager,
  PaymentRequestStageKey.accounting,
];

class PaymentRequestStageState {
  const PaymentRequestStageState({required this.userId, required this.status, required this.comment});

  final String userId;
  final String status; // PENDING | APPROVED | REJECTED
  final String? comment;
}

class PaymentRequest {
  const PaymentRequest({
    required this.id,
    required this.costControlRowId,
    required this.vendorName,
    required this.amount,
    required this.requestDate,
    required this.note,
    required this.contractAmountSnapshot,
    required this.billedPercentBefore,
    required this.submittedByUserId,
    required this.stages,
    required this.overallStatus,
    required this.createdAt,
  });

  final String id;
  final String costControlRowId;
  final String vendorName;
  final double amount;
  final DateTime requestDate;
  final String? note;
  final double contractAmountSnapshot;
  final double billedPercentBefore;
  final String submittedByUserId;
  final Map<PaymentRequestStageKey, PaymentRequestStageState> stages;
  final String overallStatus; // PENDING | APPROVED | REJECTED
  final DateTime createdAt;

  factory PaymentRequest.fromJson(Map<String, dynamic> json) => PaymentRequest(
    id: json['id'] as String,
    costControlRowId: json['costControlRowId'] as String,
    vendorName: json['vendorName'] as String,
    amount: (json['amount'] as num).toDouble(),
    requestDate: DateTime.parse(json['requestDate'] as String),
    note: json['note'] as String?,
    contractAmountSnapshot: (json['contractAmountSnapshot'] as num).toDouble(),
    billedPercentBefore: (json['billedPercentBefore'] as num).toDouble(),
    submittedByUserId: json['submittedByUserId'] as String,
    stages: {
      for (final stage in kPaymentRequestStageOrder)
        stage: PaymentRequestStageState(
          userId: json['${stage.wireValue}UserId'] as String,
          status: json['${stage.wireValue}Status'] as String,
          comment: json['${stage.wireValue}Comment'] as String?,
        ),
    },
    overallStatus: json['overallStatus'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
  );
}

class PendingPaymentRequestApproval {
  const PendingPaymentRequestApproval({
    required this.paymentRequestId,
    required this.stage,
    required this.stageLabel,
    required this.vendorName,
    required this.amount,
    required this.projectId,
    required this.projectName,
    required this.submittedByUserId,
  });

  final String paymentRequestId;
  final PaymentRequestStageKey stage;
  final String stageLabel;
  final String vendorName;
  final double amount;
  final String projectId;
  final String projectName;
  final String submittedByUserId;

  factory PendingPaymentRequestApproval.fromJson(Map<String, dynamic> json) => PendingPaymentRequestApproval(
    paymentRequestId: json['paymentRequestId'] as String,
    stage: kPaymentRequestStageOrder.firstWhere((s) => s.wireValue == json['stage']),
    stageLabel: json['stageLabel'] as String,
    vendorName: json['vendorName'] as String,
    amount: (json['amount'] as num).toDouble(),
    projectId: json['projectId'] as String,
    projectName: json['projectName'] as String,
    submittedByUserId: json['submittedByUserId'] as String,
  );
}
