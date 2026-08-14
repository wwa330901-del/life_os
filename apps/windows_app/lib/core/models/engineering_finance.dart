/// 工程財務四表 (2026-08-14 全面重新設計) — 工程報價單/成控管制表(含①初始
/// 管制表/②拆項表/③執行中成控表)/採發比價表/工程請款單。見後端
/// `apps/api/src/engineering-finance/` 底下各 service 的說明，跟記憶
/// project_life_os_engineering_finance_module 的完整設計紀錄。
library;

// ---------------------------------------------------------------------------
// 廠商主檔
// ---------------------------------------------------------------------------

class Vendor {
  const Vendor({
    required this.id,
    required this.spaceId,
    required this.name,
    required this.taxId,
    required this.contactPerson,
    required this.contactPhone,
    required this.address,
    required this.tradeCategory,
    required this.rating,
    required this.characteristics,
    required this.bankAccount,
    required this.accountHolder,
    required this.bankBranch,
    required this.note,
  });

  final String id;
  final String spaceId;
  final String name;
  final String? taxId;
  final String? contactPerson;
  final String? contactPhone;
  final String? address;
  final String? tradeCategory;
  final int? rating;
  final String? characteristics;
  final String? bankAccount;
  final String? accountHolder;
  final String? bankBranch;
  final String? note;

  factory Vendor.fromJson(Map<String, dynamic> json) => Vendor(
    id: json['id'] as String,
    spaceId: json['spaceId'] as String,
    name: json['name'] as String,
    taxId: json['taxId'] as String?,
    contactPerson: json['contactPerson'] as String?,
    contactPhone: json['contactPhone'] as String?,
    address: json['address'] as String?,
    tradeCategory: json['tradeCategory'] as String?,
    rating: json['rating'] as int?,
    characteristics: json['characteristics'] as String?,
    bankAccount: json['bankAccount'] as String?,
    accountHolder: json['accountHolder'] as String?,
    bankBranch: json['bankBranch'] as String?,
    note: json['note'] as String?,
  );
}

class VendorHistoryEntry {
  const VendorHistoryEntry({
    required this.comparisonId,
    required this.projectId,
    required this.projectName,
    required this.scopeName,
    required this.quotedAmount,
    required this.negotiatedAmount,
    required this.awardedAmount,
    required this.wasSelected,
    required this.createdAt,
  });

  final String comparisonId;
  final String projectId;
  final String projectName;
  final String scopeName;
  final double quotedAmount;
  final double? negotiatedAmount;
  final double? awardedAmount;
  final bool wasSelected;
  final DateTime createdAt;

  factory VendorHistoryEntry.fromJson(Map<String, dynamic> json) => VendorHistoryEntry(
    comparisonId: json['comparisonId'] as String,
    projectId: json['projectId'] as String,
    projectName: json['projectName'] as String,
    scopeName: json['scopeName'] as String,
    quotedAmount: (json['quotedAmount'] as num).toDouble(),
    negotiatedAmount: (json['negotiatedAmount'] as num?)?.toDouble(),
    awardedAmount: (json['awardedAmount'] as num?)?.toDouble(),
    wasSelected: json['wasSelected'] as bool,
    createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
  );
}

// ---------------------------------------------------------------------------
// 工程報價單
// ---------------------------------------------------------------------------

class EngineeringQuotationHeader {
  const EngineeringQuotationHeader({
    required this.id,
    required this.projectId,
    required this.lastTargetMarginPercent,
    required this.lastNegotiatedTotalAmount,
  });

  final String id;
  final String projectId;
  final double? lastTargetMarginPercent;
  final double? lastNegotiatedTotalAmount;

  factory EngineeringQuotationHeader.fromJson(Map<String, dynamic> json) => EngineeringQuotationHeader(
    id: json['id'] as String,
    projectId: json['projectId'] as String,
    lastTargetMarginPercent: (json['lastTargetMarginPercent'] as num?)?.toDouble(),
    lastNegotiatedTotalAmount: (json['lastNegotiatedTotalAmount'] as num?)?.toDouble(),
  );
}

/// 報價單工項樹的一個節點——大項/中項/細項不分層級都用同一個型別，
/// `isLeaf`/`children` 決定它是最底層還是往上彙總的容器。所有金額欄位（
/// complexPrice 起）都是後端現算好的彙總值，不用在 App 端重算。
class QuotationItemNode {
  const QuotationItemNode({
    required this.id,
    required this.parentId,
    required this.name,
    required this.unit,
    required this.sortOrder,
    required this.quantity,
    required this.unitPrice,
    required this.costUnitPrice,
    required this.marginAdjustedUnitPrice,
    required this.negotiatedUnitPrice,
    required this.note,
    required this.isLeaf,
    required this.complexPrice,
    required this.costComplexPrice,
    required this.profit,
    required this.marginRate,
    required this.marginAdjustedComplexPrice,
    required this.negotiatedComplexPrice,
    required this.children,
  });

  final String id;
  final String? parentId;
  final String name;
  final String? unit;
  final int sortOrder;
  final double? quantity;
  final double? unitPrice;
  final double? costUnitPrice;
  final double? marginAdjustedUnitPrice;
  final double? negotiatedUnitPrice;
  final String? note;
  final bool isLeaf;
  final double complexPrice;
  final double costComplexPrice;
  final double profit;
  final double marginRate;
  final double marginAdjustedComplexPrice;
  final double negotiatedComplexPrice;
  final List<QuotationItemNode> children;

  factory QuotationItemNode.fromJson(Map<String, dynamic> json) => QuotationItemNode(
    id: json['id'] as String,
    parentId: json['parentId'] as String?,
    name: json['name'] as String,
    unit: json['unit'] as String?,
    sortOrder: json['sortOrder'] as int,
    quantity: (json['quantity'] as num?)?.toDouble(),
    unitPrice: (json['unitPrice'] as num?)?.toDouble(),
    costUnitPrice: (json['costUnitPrice'] as num?)?.toDouble(),
    marginAdjustedUnitPrice: (json['marginAdjustedUnitPrice'] as num?)?.toDouble(),
    negotiatedUnitPrice: (json['negotiatedUnitPrice'] as num?)?.toDouble(),
    note: json['note'] as String?,
    isLeaf: json['isLeaf'] as bool,
    complexPrice: (json['complexPrice'] as num).toDouble(),
    costComplexPrice: (json['costComplexPrice'] as num).toDouble(),
    profit: (json['profit'] as num).toDouble(),
    marginRate: (json['marginRate'] as num).toDouble(),
    marginAdjustedComplexPrice: (json['marginAdjustedComplexPrice'] as num).toDouble(),
    negotiatedComplexPrice: (json['negotiatedComplexPrice'] as num).toDouble(),
    children: (json['children'] as List<dynamic>)
        .map((e) => QuotationItemNode.fromJson(e as Map<String, dynamic>))
        .toList(),
  );

  /// 深度優先攤平成一份清單，方便渲染縮排列表／建立 id→node 查找表。
  Iterable<(int depth, QuotationItemNode node)> flatten([int depth = 0]) sync* {
    yield (depth, this);
    for (final child in children) {
      yield* child.flatten(depth + 1);
    }
  }
}

class QuotationSurchargeItem {
  const QuotationSurchargeItem({
    required this.id,
    required this.name,
    required this.percent,
    required this.isTaxLike,
    required this.sortOrder,
    required this.amount,
  });

  final String id;
  final String name;
  final double percent;
  final bool isTaxLike;
  final int sortOrder;
  final double amount;

  factory QuotationSurchargeItem.fromJson(Map<String, dynamic> json) => QuotationSurchargeItem(
    id: json['id'] as String,
    name: json['name'] as String,
    percent: (json['percent'] as num).toDouble(),
    isTaxLike: json['isTaxLike'] as bool,
    sortOrder: json['sortOrder'] as int,
    amount: (json['amount'] as num).toDouble(),
  );
}

class EngineeringQuotationTree {
  const EngineeringQuotationTree({
    required this.quotation,
    required this.tree,
    required this.grandTotalBeforeSurcharge,
    required this.grandCostTotalBeforeSurcharge,
    required this.surchargeItems,
    required this.surchargeTotal,
    required this.grandTotal,
  });

  final EngineeringQuotationHeader quotation;
  final List<QuotationItemNode> tree;
  final double grandTotalBeforeSurcharge;
  final double grandCostTotalBeforeSurcharge;
  final List<QuotationSurchargeItem> surchargeItems;
  final double surchargeTotal;
  final double grandTotal;

  /// 攤平整棵樹（含深度），給列表 UI／工項選擇器共用。
  List<(int depth, QuotationItemNode node)> get flattened => [for (final root in tree) ...root.flatten()];

  factory EngineeringQuotationTree.fromJson(Map<String, dynamic> json) => EngineeringQuotationTree(
    quotation: EngineeringQuotationHeader.fromJson(json['quotation'] as Map<String, dynamic>),
    tree: (json['tree'] as List<dynamic>).map((e) => QuotationItemNode.fromJson(e as Map<String, dynamic>)).toList(),
    grandTotalBeforeSurcharge: (json['grandTotalBeforeSurcharge'] as num).toDouble(),
    grandCostTotalBeforeSurcharge: (json['grandCostTotalBeforeSurcharge'] as num).toDouble(),
    surchargeItems: (json['surchargeItems'] as List<dynamic>)
        .map((e) => QuotationSurchargeItem.fromJson(e as Map<String, dynamic>))
        .toList(),
    surchargeTotal: (json['surchargeTotal'] as num).toDouble(),
    grandTotal: (json['grandTotal'] as num).toDouble(),
  );
}

// ---------------------------------------------------------------------------
// 成控管制表 — ①初始管制表／②拆項表・③執行中成控表
// ---------------------------------------------------------------------------

class CostControlInitialSheetItem {
  const CostControlInitialSheetItem({
    required this.quotationLineItemId,
    required this.name,
    required this.ownerQuoteAmount,
    required this.estimatedCostAmount,
    required this.marginPercent,
  });

  final String quotationLineItemId;
  final String name;
  final double ownerQuoteAmount;
  final double estimatedCostAmount;
  final double marginPercent;

  factory CostControlInitialSheetItem.fromJson(Map<String, dynamic> json) => CostControlInitialSheetItem(
    quotationLineItemId: json['quotationLineItemId'] as String,
    name: json['name'] as String,
    ownerQuoteAmount: (json['ownerQuoteAmount'] as num).toDouble(),
    estimatedCostAmount: (json['estimatedCostAmount'] as num).toDouble(),
    marginPercent: (json['marginPercent'] as num).toDouble(),
  );
}

class CostControlInitialSheet {
  const CostControlInitialSheet({required this.id, required this.locked, required this.items});

  final String id;
  final bool locked;
  final List<CostControlInitialSheetItem> items;

  factory CostControlInitialSheet.fromJson(Map<String, dynamic> json) => CostControlInitialSheet(
    id: json['id'] as String,
    locked: json['locked'] as bool,
    items: (json['items'] as List<dynamic>)
        .map((e) => CostControlInitialSheetItem.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class CostControlAdjustment {
  const CostControlAdjustment({
    required this.id,
    required this.side,
    required this.type,
    required this.amount,
    required this.note,
    required this.createdAt,
  });

  final String id;
  final String side; // 'OWNER' | 'VENDOR'
  final String type; // 'ADD' | 'DEDUCT'
  final double amount;
  final String? note;
  final DateTime createdAt;

  bool get isOwner => side == 'OWNER';

  factory CostControlAdjustment.fromJson(Map<String, dynamic> json) => CostControlAdjustment(
    id: json['id'] as String,
    side: json['side'] as String,
    type: json['type'] as String,
    amount: (json['amount'] as num).toDouble(),
    note: json['note'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
  );
}

/// ②拆項表／③執行中成控表——同一份資料，App 端不分兩個型別。
class CostControlRow {
  const CostControlRow({
    required this.id,
    required this.projectId,
    required this.name,
    required this.sortOrder,
    required this.procurementComparisonId,
    required this.quotationLineItemIds,
    required this.quoteRevenueTotal,
    required this.estimatedCostTotal,
    required this.awardedAmount,
    required this.ownerAdjustmentsTotal,
    required this.vendorAdjustmentsTotal,
    required this.ownerContractAmount,
    required this.vendorContractAmount,
    required this.billedTotal,
    required this.billedPercent,
    required this.adjustments,
  });

  final String id;
  final String projectId;
  final String name;
  final int sortOrder;
  final String? procurementComparisonId;
  final List<String> quotationLineItemIds;
  final double quoteRevenueTotal;
  final double estimatedCostTotal;
  final double? awardedAmount;
  final double ownerAdjustmentsTotal;
  final double vendorAdjustmentsTotal;
  final double ownerContractAmount;
  final double vendorContractAmount;
  final double billedTotal;
  final double billedPercent;
  final List<CostControlAdjustment> adjustments;

  factory CostControlRow.fromJson(Map<String, dynamic> json) => CostControlRow(
    id: json['id'] as String,
    projectId: json['projectId'] as String,
    name: json['name'] as String,
    sortOrder: json['sortOrder'] as int,
    procurementComparisonId: json['procurementComparisonId'] as String?,
    quotationLineItemIds: (json['quotationLineItemIds'] as List<dynamic>).cast<String>(),
    quoteRevenueTotal: (json['quoteRevenueTotal'] as num).toDouble(),
    estimatedCostTotal: (json['estimatedCostTotal'] as num).toDouble(),
    awardedAmount: (json['awardedAmount'] as num?)?.toDouble(),
    ownerAdjustmentsTotal: (json['ownerAdjustmentsTotal'] as num).toDouble(),
    vendorAdjustmentsTotal: (json['vendorAdjustmentsTotal'] as num).toDouble(),
    ownerContractAmount: (json['ownerContractAmount'] as num).toDouble(),
    vendorContractAmount: (json['vendorContractAmount'] as num).toDouble(),
    billedTotal: (json['billedTotal'] as num).toDouble(),
    billedPercent: (json['billedPercent'] as num).toDouble(),
    adjustments: (json['adjustments'] as List<dynamic>)
        .map((e) => CostControlAdjustment.fromJson(e as Map<String, dynamic>))
        .toList(),
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
  final double? unitPrice;
  final double? quantity;
  final double complexPrice;
  final double? costUnitPrice;
  final double costComplexPrice;

  factory CostControlBreakdownItem.fromJson(Map<String, dynamic> json) => CostControlBreakdownItem(
    id: json['id'] as String,
    name: json['name'] as String,
    unitPrice: (json['unitPrice'] as num?)?.toDouble(),
    quantity: (json['quantity'] as num?)?.toDouble(),
    complexPrice: (json['complexPrice'] as num).toDouble(),
    costUnitPrice: (json['costUnitPrice'] as num?)?.toDouble(),
    costComplexPrice: (json['costComplexPrice'] as num).toDouble(),
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

// ---------------------------------------------------------------------------
// 採發比價表
// ---------------------------------------------------------------------------

enum ProcurementInspectionMethod { monthly, milestone, other }

extension ProcurementInspectionMethodX on ProcurementInspectionMethod {
  static ProcurementInspectionMethod fromJson(String value) => switch (value) {
    'MONTHLY' => ProcurementInspectionMethod.monthly,
    'MILESTONE' => ProcurementInspectionMethod.milestone,
    _ => ProcurementInspectionMethod.other,
  };

  String get wireValue => switch (this) {
    ProcurementInspectionMethod.monthly => 'MONTHLY',
    ProcurementInspectionMethod.milestone => 'MILESTONE',
    ProcurementInspectionMethod.other => 'OTHER',
  };

  String get label => switch (this) {
    ProcurementInspectionMethod.monthly => '月估驗',
    ProcurementInspectionMethod.milestone => '階段完工',
    ProcurementInspectionMethod.other => '其他',
  };
}

enum ProcurementPaymentMethod { monthly5050, full100, other }

extension ProcurementPaymentMethodX on ProcurementPaymentMethod {
  static ProcurementPaymentMethod fromJson(String value) => switch (value) {
    'MONTHLY_50_50' => ProcurementPaymentMethod.monthly5050,
    'FULL_100' => ProcurementPaymentMethod.full100,
    _ => ProcurementPaymentMethod.other,
  };

  String get wireValue => switch (this) {
    ProcurementPaymentMethod.monthly5050 => 'MONTHLY_50_50',
    ProcurementPaymentMethod.full100 => 'FULL_100',
    ProcurementPaymentMethod.other => 'OTHER',
  };

  String get label => switch (this) {
    ProcurementPaymentMethod.monthly5050 => '月付50%次月50%',
    ProcurementPaymentMethod.full100 => '月付100%',
    ProcurementPaymentMethod.other => '其他',
  };
}

class VendorQuote {
  const VendorQuote({
    required this.id,
    required this.comparisonId,
    required this.vendor,
    required this.quotedAmount,
    required this.negotiatedAmount,
    required this.awardedAmount,
    required this.note,
    required this.attachmentFilePath,
    required this.attachmentUrl,
  });

  final String id;
  final String comparisonId;
  final Vendor vendor;
  final double quotedAmount;
  final double? negotiatedAmount;
  final double? awardedAmount;
  final String? note;
  final String? attachmentFilePath;
  final String? attachmentUrl;

  factory VendorQuote.fromJson(Map<String, dynamic> json) => VendorQuote(
    id: json['id'] as String,
    comparisonId: json['comparisonId'] as String,
    vendor: Vendor.fromJson(json['vendor'] as Map<String, dynamic>),
    quotedAmount: (json['quotedAmount'] as num).toDouble(),
    negotiatedAmount: (json['negotiatedAmount'] as num?)?.toDouble(),
    awardedAmount: (json['awardedAmount'] as num?)?.toDouble(),
    note: json['note'] as String?,
    attachmentFilePath: json['attachmentFilePath'] as String?,
    attachmentUrl: json['attachmentUrl'] as String?,
  );
}

class ProcurementComparison {
  const ProcurementComparison({
    required this.id,
    required this.projectId,
    required this.quotationLineItemId,
    required this.inspectionMethod,
    required this.inspectionOtherNote,
    required this.paymentMethod,
    required this.paymentOtherNote,
    required this.finalAwardedAmount,
    required this.selectedVendorQuoteId,
    required this.vendorQuotes,
    required this.ownerQuoteAmount,
    required this.procurementBudget,
    required this.marginRate,
    required this.locked,
  });

  final String id;
  final String projectId;
  final String quotationLineItemId;
  final ProcurementInspectionMethod inspectionMethod;
  final String? inspectionOtherNote;
  final ProcurementPaymentMethod paymentMethod;
  final String? paymentOtherNote;
  final double? finalAwardedAmount;
  final String? selectedVendorQuoteId;
  final List<VendorQuote> vendorQuotes;
  final double? ownerQuoteAmount;
  final double? procurementBudget;
  final double? marginRate;
  final bool locked;

  factory ProcurementComparison.fromJson(Map<String, dynamic> json) => ProcurementComparison(
    id: json['id'] as String,
    projectId: json['projectId'] as String,
    quotationLineItemId: json['quotationLineItemId'] as String,
    inspectionMethod: ProcurementInspectionMethodX.fromJson(json['inspectionMethod'] as String),
    inspectionOtherNote: json['inspectionOtherNote'] as String?,
    paymentMethod: ProcurementPaymentMethodX.fromJson(json['paymentMethod'] as String),
    paymentOtherNote: json['paymentOtherNote'] as String?,
    finalAwardedAmount: (json['finalAwardedAmount'] as num?)?.toDouble(),
    selectedVendorQuoteId: json['selectedVendorQuoteId'] as String?,
    vendorQuotes: (json['vendorQuotes'] as List<dynamic>)
        .map((e) => VendorQuote.fromJson(e as Map<String, dynamic>))
        .toList(),
    ownerQuoteAmount: (json['ownerQuoteAmount'] as num?)?.toDouble(),
    procurementBudget: (json['procurementBudget'] as num?)?.toDouble(),
    marginRate: (json['marginRate'] as num?)?.toDouble(),
    locked: json['locked'] as bool,
  );
}

// ---------------------------------------------------------------------------
// 工程請款單
// ---------------------------------------------------------------------------

class PaymentRequestPeriod {
  const PaymentRequestPeriod({
    required this.id,
    required this.costControlRowId,
    required this.periodLabel,
    required this.amount,
    required this.requestDate,
    required this.note,
    required this.additionalAmount,
    required this.additionalQuotationAttachmentPath,
    required this.additionalQuotationAttachmentUrl,
    required this.vendorNameSnapshot,
    required this.vendorBankAccountSnapshot,
    required this.vendorAccountHolderSnapshot,
    required this.vendorBankBranchSnapshot,
    required this.contractAmountSnapshot,
    required this.billedPercentBefore,
    required this.submittedByUserId,
    required this.createdAt,
    required this.locked,
  });

  final String id;
  final String costControlRowId;
  final String periodLabel;
  final double amount;
  final DateTime requestDate;
  final String? note;
  final double? additionalAmount;
  final String? additionalQuotationAttachmentPath;
  final String? additionalQuotationAttachmentUrl;
  final String vendorNameSnapshot;
  final String? vendorBankAccountSnapshot;
  final String? vendorAccountHolderSnapshot;
  final String? vendorBankBranchSnapshot;
  final double contractAmountSnapshot;
  final double billedPercentBefore;
  final String submittedByUserId;
  final DateTime createdAt;
  final bool locked;

  factory PaymentRequestPeriod.fromJson(Map<String, dynamic> json) => PaymentRequestPeriod(
    id: json['id'] as String,
    costControlRowId: json['costControlRowId'] as String,
    periodLabel: json['periodLabel'] as String,
    amount: (json['amount'] as num).toDouble(),
    requestDate: DateTime.parse(json['requestDate'] as String),
    note: json['note'] as String?,
    additionalAmount: (json['additionalAmount'] as num?)?.toDouble(),
    additionalQuotationAttachmentPath: json['additionalQuotationAttachmentPath'] as String?,
    additionalQuotationAttachmentUrl: json['additionalQuotationAttachmentUrl'] as String?,
    vendorNameSnapshot: json['vendorNameSnapshot'] as String,
    vendorBankAccountSnapshot: json['vendorBankAccountSnapshot'] as String?,
    vendorAccountHolderSnapshot: json['vendorAccountHolderSnapshot'] as String?,
    vendorBankBranchSnapshot: json['vendorBankBranchSnapshot'] as String?,
    contractAmountSnapshot: (json['contractAmountSnapshot'] as num).toDouble(),
    billedPercentBefore: (json['billedPercentBefore'] as num).toDouble(),
    submittedByUserId: json['submittedByUserId'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
    locked: json['locked'] as bool,
  );
}

// ---------------------------------------------------------------------------
// 簽核固定關卡職稱（顯示用，跟後端 FIXED_ROLE_CHAINS 一致）
// ---------------------------------------------------------------------------

const kCostControlInitialSheetRoles = ['主辦', '業務主管', '成控', '總經理'];
const kProcurementComparisonRoles = ['主辦', '業務主管', '成控', '總經理'];
const kPaymentRequestPeriodRoles = ['主辦', '業務主管', '財務初審', '成控', '總經理', '出納'];
