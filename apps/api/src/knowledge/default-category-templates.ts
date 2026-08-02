import { KnowledgeFieldType } from './ai/ai-content-analysis.interface';

export interface DefaultCategoryTemplate {
  name: string;
  fields: { name: string; type: KnowledgeFieldType }[];
}

/** The 15-category draft worked out during design discussion — offered as
 * an opt-in "一鍵套用建議分類" starting point, never auto-seeded on account
 * creation. Address/phone-style fields are plain TEXT on purpose: 地址 gets
 * special handling by name (美食/景點 location search matches on a field
 * literally named "地址"), everything else is just informational text —
 * no dedicated ADDRESS/PHONE field types exist. */
export const DEFAULT_CATEGORY_TEMPLATES: DefaultCategoryTemplate[] = [
  {
    name: '美食',
    fields: [
      { name: '店名', type: 'TEXT' },
      { name: '地址', type: 'TEXT' },
      { name: '電話', type: 'TEXT' },
      { name: '營業時間', type: 'TEXT' },
      { name: '價位', type: 'TEXT' },
      { name: '評價', type: 'TEXT' },
      { name: '推薦餐點', type: 'TEXT' },
      { name: '停車資訊', type: 'TEXT' },
    ],
  },
  {
    name: '景點',
    fields: [
      { name: '景點名稱', type: 'TEXT' },
      { name: '地址', type: 'TEXT' },
      { name: '開放時間', type: 'TEXT' },
      { name: '門票', type: 'TEXT' },
      { name: '適合季節', type: 'TEXT' },
      { name: '停車資訊', type: 'TEXT' },
    ],
  },
  {
    name: '投資學習',
    fields: [
      { name: '主題/技巧名稱', type: 'TEXT' },
      { name: '核心觀念', type: 'TEXT' },
      { name: '適用情境', type: 'TEXT' },
      { name: '資料來源', type: 'TEXT' },
    ],
  },
  {
    name: '設計',
    fields: [
      { name: '風格', type: 'TEXT' },
      { name: '材料', type: 'TEXT' },
      { name: '品牌', type: 'TEXT' },
      { name: '尺寸', type: 'TEXT' },
      { name: '色彩', type: 'TEXT' },
      { name: '照明', type: 'TEXT' },
      { name: '適用空間', type: 'TEXT' },
    ],
  },
  {
    name: '材料',
    fields: [
      { name: '材料名稱', type: 'TEXT' },
      { name: '特性', type: 'TEXT' },
      { name: '適用場合', type: 'TEXT' },
      { name: '價格區間', type: 'TEXT' },
      { name: '品牌/供應商', type: 'TEXT' },
    ],
  },
  {
    name: '工法',
    fields: [
      { name: '工法名稱', type: 'TEXT' },
      { name: '適用材料', type: 'TEXT' },
      { name: '施工要點', type: 'TEXT' },
      { name: '注意事項', type: 'TEXT' },
    ],
  },
  {
    name: '人生哲學',
    fields: [
      { name: '核心觀念', type: 'TEXT' },
      { name: '可執行行動', type: 'TEXT' },
      { name: '個人心得', type: 'TEXT' },
    ],
  },
  {
    name: '心靈提升',
    fields: [
      { name: '核心觀念', type: 'TEXT' },
      { name: '練習方法', type: 'TEXT' },
      { name: '個人心得', type: 'TEXT' },
    ],
  },
  {
    name: '人際關係',
    fields: [
      { name: '核心觀念', type: 'TEXT' },
      { name: '可執行行動', type: 'TEXT' },
      { name: '適用情境', type: 'TEXT' },
    ],
  },
  {
    name: '穿搭',
    fields: [
      { name: '風格', type: 'TEXT' },
      { name: '單品/品牌', type: 'TEXT' },
      { name: '適合季節', type: 'TEXT' },
      { name: '適合場合', type: 'TEXT' },
    ],
  },
  {
    name: '攝影技巧',
    fields: [
      { name: '技巧名稱', type: 'TEXT' },
      { name: '適用場景', type: 'TEXT' },
      { name: '器材/設定', type: 'TEXT' },
      { name: '參數', type: 'TEXT' },
      { name: '核心觀念', type: 'TEXT' },
    ],
  },
  {
    name: '催淚影片',
    fields: [
      { name: '感動原因', type: 'TEXT' },
      { name: '適合心情', type: 'TEXT' },
    ],
  },
  {
    name: '星座',
    fields: [
      { name: '星座', type: 'TEXT' },
      { name: '主題', type: 'TEXT' },
      { name: '適用時效', type: 'TEXT' },
      { name: '核心內容', type: 'TEXT' },
    ],
  },
  {
    name: '軟體操作運用',
    fields: [
      { name: '軟體名稱', type: 'TEXT' },
      { name: '功能/操作步驟', type: 'TEXT' },
      { name: '適用情境', type: 'TEXT' },
    ],
  },
  {
    name: '展覽資訊',
    fields: [
      { name: '展覽名稱', type: 'TEXT' },
      { name: '地點', type: 'TEXT' },
      { name: '開始日期', type: 'DATE' },
      { name: '結束日期', type: 'DATE' },
      { name: '門票', type: 'TEXT' },
      { name: '預約方式', type: 'TEXT' },
      { name: '是否已觀展', type: 'BOOLEAN' },
    ],
  },
];
