/** AI 功能使用次數（2026-10-13）：每個 AI 工具屬於哪個功能、中文叫什麼。
 * 用來看哪些功能根本沒在用，之後可以拿掉（工具清單每次對話都要送給 AI，
 * 少一個工具就少一點費用）。新增 AI 工具時記得加進來，沒加的會歸到「其他」。 */
export const AI_TOOL_FEATURES: Record<string, { feature: string; label: string }> = {
  // 記帳
  record_transaction: { feature: '記帳', label: '記一筆收支' },
  record_transfer: { feature: '記帳', label: '帳戶轉帳' },
  update_transaction: { feature: '記帳', label: '改一筆記帳' },
  propose_delete: { feature: '記帳', label: '刪除記錄' },
  list_finance_transactions: { feature: '記帳', label: '查記帳明細' },
  get_finance_overview: { feature: '記帳', label: '財務總覽' },
  list_account_balances: { feature: '記帳', label: '查帳戶餘額' },
  // 信用卡
  get_credit_card_bills: { feature: '信用卡', label: '查卡費帳單' },
  propose_card_payment: { feature: '信用卡', label: '繳卡費' },
  set_credit_card: { feature: '信用卡', label: '設定結帳日/繳款日' },
  get_subscriptions: { feature: '訂閱', label: '查訂閱' },
  // 借貸／代墊
  list_loans_and_advances: { feature: '借貸／代墊', label: '查借貸和代墊' },
  propose_loan: { feature: '借貸／代墊', label: '記借貸' },
  propose_loan_repayment: { feature: '借貸／代墊', label: '記借貸還款' },
  propose_existing_debt: { feature: '借貸／代墊', label: '記之前就欠的（學貸…）' },
  set_loan_installment: { feature: '借貸／代墊', label: '設每月固定還款' },
  set_loan_due_date: { feature: '借貸／代墊', label: '設約定還款日' },
  propose_advance: { feature: '借貸／代墊', label: '記代墊' },
  propose_advance_repayment: { feature: '借貸／代墊', label: '記代墊收回' },
  propose_existing_advance: { feature: '借貸／代墊', label: '記之前就墊的' },
  // 財務規劃
  get_financial_health: { feature: '財務健檢／規劃', label: '財務健檢' },
  get_financial_plan_inputs: { feature: '財務健檢／規劃', label: '理財評估資料' },
  get_finance_plan_questionnaire: { feature: '財務健檢／規劃', label: '規劃問卷' },
  save_finance_plan_answers: { feature: '財務健檢／規劃', label: '存問卷答案' },
  make_finance_plan: { feature: '財務健檢／規劃', label: '產生財務規劃' },
  propose_budgets: { feature: '財務健檢／規劃', label: '設預算' },
  set_fixed_income: { feature: '財務健檢／規劃', label: '設固定薪資' },
  get_retirement_projection: { feature: '退休試算', label: '退休試算' },
  set_retirement_settings: { feature: '退休試算', label: '改退休設定' },
  // 購物車
  list_wishlist: { feature: '購物車', label: '查購物車' },
  add_wishlist_item: { feature: '購物車', label: '加進購物車' },
  update_wishlist_item: { feature: '購物車', label: '改購物車' },
  remove_wishlist_item: { feature: '購物車', label: '移除購物車' },
  mark_wishlist_bought: { feature: '購物車', label: '標記已買' },
  set_wishlist_budget: { feature: '購物車', label: '設每月撥多少' },
  // 股票
  get_stock_portfolio: { feature: '股票', label: '查持股' },
  analyze_stock_trend: { feature: '股票', label: '股票走勢分析' },
  get_stock_fundamentals: { feature: '股票', label: '股票基本面' },
  propose_stock_trade: { feature: '股票', label: '記股票買賣' },
  set_stock_account: { feature: '股票', label: '設股票帳戶' },
  set_stock_opening: { feature: '股票', label: '設期初持股' },
  // 行事曆
  list_calendar_events: { feature: '行事曆', label: '查行程' },
  create_calendar_event: { feature: '行事曆', label: '新增行程' },
  propose_calendar_event: { feature: '行事曆', label: '新增行程（要確認）' },
  update_calendar_event: { feature: '行事曆', label: '改行程' },
  find_free_slots: { feature: '行事曆', label: '找空檔' },
  // 代辦／提醒
  list_todos: { feature: '代辦／提醒', label: '查代辦' },
  create_todo: { feature: '代辦／提醒', label: '新增代辦' },
  update_todo: { feature: '代辦／提醒', label: '改代辦' },
  complete_todo: { feature: '代辦／提醒', label: '完成代辦' },
  create_reminder: { feature: '代辦／提醒', label: '短時間提醒' },
  set_reminder: { feature: '代辦／提醒', label: '開關自動提醒' },
  // 人生目標
  list_life_goals: { feature: '人生目標', label: '查目標' },
  create_goal: { feature: '人生目標', label: '新增目標' },
  add_check_in: { feature: '人生目標', label: '打卡' },
  set_goal_value: { feature: '人生目標', label: '更新進度' },
  set_goal_status: { feature: '人生目標', label: '完成/放棄目標' },
  plan_life_goal: { feature: '人生目標', label: '目標規劃' },
  // 知識庫
  search_knowledge: { feature: '知識庫', label: '查知識庫' },
  search_places_near: { feature: '知識庫', label: '找附近地點' },
  list_upcoming_exhibitions: { feature: '知識庫', label: '查展覽' },
  // 日記／回顧
  add_journal_entry: { feature: '日記', label: '寫日記' },
  update_journal_entry: { feature: '日記', label: '改日記' },
  list_journal_entries: { feature: '日記', label: '查日記' },
  get_life_review: { feature: '週/月回顧', label: '查回顧' },
  // 算命
  cast_meihua: { feature: '算命', label: '起卦' },
  list_divinations: { feature: '算命', label: '查算命紀錄' },
  get_birth_info: { feature: '算命', label: '查生辰' },
  set_birth_info: { feature: '算命', label: '設生辰' },
  record_divination_feedback: { feature: '算命', label: '算命準不準回饋' },
  // 記住的事／重要日子
  remember: { feature: '記住的事', label: '記住' },
  forget: { feature: '記住的事', label: '忘掉' },
  add_important_date: { feature: '重要日子', label: '新增重要日子' },
  list_important_dates: { feature: '重要日子', label: '查重要日子' },
  update_important_date: { feature: '重要日子', label: '改重要日子' },
  delete_important_date: { feature: '重要日子', label: '刪重要日子' },
  // 旅行
  plan_trip: { feature: '旅行', label: '規劃旅行' },
  list_trips: { feature: '旅行', label: '查旅行' },
  get_trip: { feature: '旅行', label: '看行程細節' },
  update_trip: { feature: '旅行', label: '改旅行' },
  replan_trip: { feature: '旅行', label: '重排行程' },
  set_trip_day: { feature: '旅行', label: '改某一天' },
  delete_trip: { feature: '旅行', label: '刪旅行' },
  add_trip_to_calendar: { feature: '旅行', label: '放進行事曆' },
  pack_trip_items: { feature: '旅行', label: '行李清單' },
  save_for_trip: { feature: '旅行', label: '存旅費' },
  // 天氣
  get_weather: { feature: '天氣', label: '查天氣' },
  // 確認／取消（每個要確認的功能都會用到）
  confirm_pending_action: { feature: '確認／取消', label: '確認' },
  cancel_pending_action: { feature: '確認／取消', label: '取消' },
};

/** 不是透過對話工具、而是直接呼叫 AI 的功能（AiUsageLog.feature）→ 歸到哪個功能。
 * 對話本身（line_ai_agent、app 問答）不算，裡面用到的工具已經各自算過。 */
export const AI_LOG_FEATURES: Record<string, string> = {
  line_ai_chat: '閒聊',
  app_ai_chat: '閒聊',
  knowledge: '知識庫',
  divination: '算命',
  finance_plan: '財務健檢／規劃',
  life_goal_category: '人生目標',
  life_goal_plan: '人生目標',
  life_review: '週/月回顧',
  trip_plan: '旅行',
  receipt: '收據辨識',
  voice: '語音轉文字',
};

/** 確認／取消是系統用的，不列進「沒用過、可以拿掉」。 */
const NEVER_REMOVABLE = new Set(['確認／取消', '閒聊']);

export interface FeatureUsage {
  feature: string;
  count: number;
  lastUsedAt: Date | null;
  tools: { tool: string; label: string; count: number }[];
}

/** 把工具呼叫次數＋直接呼叫 AI 的次數整理成「每個功能用了幾次」。
 * 所有已知功能都會列出（0 次的也列），unused＝0 次、可以考慮拿掉的功能。 */
export function summarizeFeatureUsage(
  toolCalls: { tool: string; count: number; lastUsedAt: Date | null }[],
  logCalls: { feature: string; count: number; lastUsedAt: Date | null }[],
): { features: FeatureUsage[]; unused: string[] } {
  const byFeature = new Map<string, FeatureUsage>();
  const get = (feature: string) => {
    let f = byFeature.get(feature);
    if (!f) byFeature.set(feature, (f = { feature, count: 0, lastUsedAt: null, tools: [] }));
    return f;
  };
  const touch = (f: FeatureUsage, count: number, at: Date | null) => {
    f.count += count;
    if (at && (!f.lastUsedAt || at > f.lastUsedAt)) f.lastUsedAt = at;
  };

  for (const [tool, meta] of Object.entries(AI_TOOL_FEATURES)) get(meta.feature).tools.push({ tool, label: meta.label, count: 0 });
  for (const feature of new Set(Object.values(AI_LOG_FEATURES))) get(feature);

  for (const c of toolCalls) {
    const meta = AI_TOOL_FEATURES[c.tool] ?? { feature: '其他', label: c.tool };
    const f = get(meta.feature);
    let t = f.tools.find((x) => x.tool === c.tool);
    if (!t) f.tools.push((t = { tool: c.tool, label: meta.label, count: 0 }));
    t.count += c.count;
    touch(f, c.count, c.lastUsedAt);
  }
  for (const c of logCalls) {
    const feature = AI_LOG_FEATURES[c.feature];
    if (feature) touch(get(feature), c.count, c.lastUsedAt);
  }

  const features = [...byFeature.values()].sort((a, b) => b.count - a.count || a.feature.localeCompare(b.feature, 'zh-Hant'));
  for (const f of features) f.tools.sort((a, b) => b.count - a.count);
  return { features, unused: features.filter((f) => f.count === 0 && !NEVER_REMOVABLE.has(f.feature)).map((f) => f.feature) };
}
