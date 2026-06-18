/**
 * categoryDetect.js
 * 品名・資材名からカテゴリを自動判定するユーティリティ。
 * ScanInbox（スキャン取り込み時）と MasterManagement（一括補正）で共有。
 */

// ── 野菜・ハーブ・果物の品種名リスト ────────────────────────
// 品種名のみで「苗・種子」と判定するためのキーワード群
const VEGGIE_KEYWORDS = [
  // 葉物・サラダ野菜
  'レタス', 'lettuce', 'サニーレタス', 'リーフレタス', 'ロメインレタス', 'バターレタス',
  'フリルレタス', 'コスレタス', 'サラダ菜', 'グリーンリーフ', 'レッドリーフ', 'コーラルリーフ',
  'ベビーリーフ', 'baby leaf', 'サラダミックス',
  'ほうれん草', 'ホウレンソウ', 'spinach',
  '小松菜', 'コマツナ', '水菜', 'ミズナ', '春菊', 'シュンギク',
  'チンゲン菜', 'チンゲンサイ', 'ターツァイ',
  'ルッコラ', 'arugula', 'ロケット',
  'クレソン', 'cress', 'ウォータークレス',
  'マスタードグリーン', 'マスタードリーフ',
  'スイスチャード', 'フダンソウ',
  'エンダイブ', 'チコリ',
  'マーシュ', 'コーンサラダ',
  'サンチュ', 'チマサンチュ',

  // 根菜
  '大根', 'だいこん', 'ダイコン', 'radish',
  'ラデッシュ', 'ラディッシュ', '二十日大根', 'はつかだいこん',
  'にんじん', 'ニンジン', 'キャロット', 'carrot',
  'かぶ', 'カブ', 'turnip',
  'ビーツ', 'ビート', 'beet',
  'ごぼう', 'ゴボウ', 'burdock',
  'さつまいも', 'サツマイモ', '薩摩芋', 'sweet potato',
  'じゃがいも', 'ジャガイモ', 'potato',
  'さといも', 'サトイモ', '里芋',
  'やまいも', 'ヤマイモ', 'yam',

  // 実野菜
  'トマト', 'tomato', 'ミニトマト', 'チェリートマト',
  'きゅうり', 'キュウリ', 'cucumber',
  'なす', 'ナス', 'eggplant',
  'ピーマン', 'pepper',
  'パプリカ', 'paprika',
  'とうがらし', 'トウガラシ', '唐辛子',
  'かぼちゃ', 'カボチャ', 'pumpkin', 'squash',
  'ズッキーニ', 'zucchini',
  'ゴーヤ', 'にがうり', 'ニガウリ',
  'いんげん', 'インゲン', 'サヤインゲン', 'green bean',
  'えだまめ', 'エダマメ', '枝豆',
  'そらまめ', 'ソラマメ', '空豆', 'fava bean',
  'えんどう', 'エンドウ', 'スナップエンドウ', 'さやえんどう', 'サヤエンドウ', 'pea',
  'とうもろこし', 'トウモロコシ', 'コーン', 'corn',
  'オクラ', 'okra',

  // アブラナ科
  'キャベツ', 'cabbage',
  'ブロッコリー', 'broccoli',
  'カリフラワー', 'cauliflower',
  'コールラビ', 'kohlrabi',
  'ケール', 'kale',
  'はくさい', 'ハクサイ', '白菜', 'napa cabbage',
  'コマツナ',

  // ネギ類・香辛野菜
  'ネギ', 'ねぎ', '長ネギ', 'leek',
  'たまねぎ', 'タマネギ', '玉ねぎ', 'onion',
  'にんにく', 'ニンニク', 'garlic',
  'らっきょう', 'ラッキョウ',
  'ニラ', 'にら', 'chive', 'チャイブ',
  'わけぎ', 'ワケギ',

  // ハーブ
  'バジル', 'basil',
  'パセリ', 'parsley',
  'ミント', 'mint',
  'ローズマリー', 'rosemary',
  'タイム', 'thyme',
  'オレガノ', 'oregano',
  'ディル', 'dill',
  'コリアンダー', 'パクチー', 'cilantro', 'coriander',
  'フェンネル', 'fennel',
  'セージ', 'sage',
  'ラベンダー', 'lavender',
  'レモングラス', 'lemongrass',
  'チャービル', 'chervil',
  'エストラゴン', 'タラゴン', 'tarragon',
  'ボリジ', 'borage',
  'ルー', 'rue',
  'ワサビ', 'わさび', 'wasabi', 'ワサビリーフ',

  // 果菜・果物
  'いちご', 'イチゴ', '苺', 'strawberry',
  'メロン', 'melon',
  'スイカ', 'watermelon',
  'すいか',

  // セロリ・根セロリ
  'セロリ', 'celery', 'セレリアック',

  // その他
  'ラム酒', // ← これは除外対象だが念のため後の否定で処理
];

// ── カテゴリ判定メイン関数 ────────────────────────────────────
/**
 * 品名からカテゴリを自動判定する
 * @param {string} name - 品名・資材名
 * @param {string} [currentCategory] - 現在のカテゴリ（「資材」「その他」以外は上書きしない）
 * @returns {string} カテゴリ名
 */
export const detectCategory = (name, currentCategory) => {
  const n = (name || '').toLowerCase();
  if (!n) return currentCategory || '資材';

  // 種苗 ── 明示キーワード（優先）
  if (/苗|seedling|プラグ苗|ポット苗|果樹苗|苗木|挿し木|さし木/.test(n)) return '種苗';
  if (/種子|たね|タネ|seed/.test(n)) return '種苗';
  if (/\b種\b/.test(n)) return '種苗'; // 単独「種」

  // 種苗 ── 野菜品種名データベース
  if (VEGGIE_KEYWORDS.some(kw => n.includes(kw.toLowerCase()))) return '種苗';

  // 肥料・農薬
  if (/肥料|堆肥|腐葉土|ぼかし|ボカシ|液肥|compost|fertilizer|グアノ|バットグアノ|油粕|骨粉|鶏糞|けいふん|牛糞|ようりん|溶リン|アミノ酸肥|硫酸|塩化|過リン|石灰窒素/.test(n)) return '肥料・農薬';
  if (/農薬|殺虫|殺菌|除草|防除|bt剤|天敵|粘着|トラップ|ボルドー|石灰硫黄|pesticide/.test(n)) return '肥料・農薬';

  return '資材';
};

/**
 * 既存カテゴリが「資材」か「その他」の場合のみ再判定して上書きする
 * @param {Object} material - { name, category, ... }
 * @returns {string} 補正後のカテゴリ
 */
export const fixCategory = (material) => {
  const current = material.category || '資材';
  // 既に具体的なカテゴリが設定済みなら変更しない
  if (current !== '資材' && current !== 'その他' && current !== '') return current;
  return detectCategory(material.name, current);
};
