/**
 * Orgaly - 作物マスタ（m_crop）一括登録スクリプト
 * import_data.json の cropName のうち未登録のものを Firestore に追加する
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const firebaseConfig = {
  apiKey:            'AIzaSyDtW1Xrpf_jcDKd12IyB88AjiVDRe7e0SE',
  authDomain:        'organiclog-2f6c7.firebaseapp.com',
  projectId:         'organiclog-2f6c7',
  storageBucket:     'organiclog-2f6c7.firebasestorage.app',
  messagingSenderId: '267681135810',
  appId:             '1:267681135810:web:5e62b67eb2d4145a4b8f5b',
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const REF = doc(db, 'farms', 'organiclog_default');

// ── 科名マッピング ─────────────────────────────────
const FAMILY_MAP = {
  // アブラナ科
  'アブラナ科': [
    'カブ','有機カブ',
    'カラシナ','有機カラシナ',
    'カリフラワー','有機カリフラワー',
    'はつか大根','有機はつか大根',
    '大根','有機大根',
    '小松菜','有機小松菜',
    '水菜','有機水菜',
    '菜花','有機菜花',
    '青梗菜','有機青梗菜',
    '紅しぐれ','有機紅しぐれ',
  ],
  // ヒユ科
  'ヒユ科': [
    'ほうれん草','有機ほうれん草',
    'スイスチャード','有機スイスチャード',
    'ビーツ','有機ビーツ',
  ],
  // ウリ科
  'ウリ科': [
    'コリンキー','有機コリンキー',
    'ゴーヤ','白ゴーヤ',
    'ズッキーニ',
    'ミニカボチャ',
  ],
  // ナス科
  'ナス科': [
    'トウガラシ',
    '有機ナス',
    '有機ピーマン',
  ],
  // キク科
  'キク科': [
    'トレビス','有機トレビス',
    'リーフレタス','有機リーフレタス',
  ],
  // シソ科
  'シソ科': [
    'バジル','有機バジル',
    'パセリ','有機パセリ',
    'ローズマリー',
    '有機タイム',
    '有機ミント',
    'イタリアンパセリ','有機イタリアンパセリ',
  ],
  // セリ科
  'セリ科': [
    '人参','有機人参',
  ],
  // マメ科
  'マメ科': [
    'インゲン',
    'スナップエンドウ','有機スナップエンドウ',
  ],
  // アオイ科
  'アオイ科': [
    '有機オクラ',
  ],
  // トケイソウ科
  'トケイソウ科': [
    '有機パッションフルーツ',
  ],
  // イネ科
  'イネ科': [
    '有機レモングラス',
  ],
  // ブドウ科
  'ブドウ科': [
    'ぶどう',
  ],
};

// 逆引きマップ: 作物名 → 科名
const nameToFamily = {};
for (const [family, names] of Object.entries(FAMILY_MAP)) {
  for (const name of names) {
    nameToFamily[name] = family;
  }
}

// 番号付き作物（カラシナ①～⑦等）の科名も解決
function getFamily(name) {
  if (nameToFamily[name]) return nameToFamily[name];
  // 「有機カラシナ　①」→「有機カラシナ」のプレフィックスで検索
  for (const [key, family] of Object.entries(nameToFamily)) {
    if (name.startsWith(key)) return family;
  }
  return '';
}

// ── import_data.json から cropName を収集 ──────────
const jsonPath = resolve(__dirname, '..', 'public', 'import_data.json');
const importData = JSON.parse(readFileSync(jsonPath, 'utf-8'));

const importCrops = new Set();
for (const r of importData.workRecords) {
  if (r.cropName) importCrops.add(r.cropName);
}

// ── Firestore 取得 ─────────────────────────────────
console.log('Firestore からデータ取得中...');
const snap = await getDoc(REF);
const data = snap.data();
const masters = data.masters || {};
const existingCrops = masters.m_crop || [];

const existingNames = new Set(existingCrops.map(c => c.name));
console.log(`既存作物マスタ: ${existingNames.size}件`);

// ── 新規登録対象を特定 ────────────────────────────
const toAdd = [...importCrops]
  .filter(name => !existingNames.has(name))
  .sort();

console.log(`新規登録対象: ${toAdd.length}件`);

if (toAdd.length === 0) {
  console.log('追加対象なし。');
  process.exit(0);
}

// ── 新規マスタ生成 ────────────────────────────────
let counter = Date.now();
const newCrops = toAdd.map(name => ({
  id:     `crop_imp_${counter++}`,
  name,
  family: getFamily(name),
}));

// 確認表示
console.log('\n登録内容:');
newCrops.forEach(c => {
  console.log(`  [${c.id}] ${c.name}  (${c.family || '科名未設定'})`);
});

// ── Firestore 書き込み ────────────────────────────
masters.m_crop = [...existingCrops, ...newCrops];
console.log('\nFirestore に書き込み中...');
await setDoc(REF, { ...data, masters }, { merge: false });
console.log(`✅ 完了: ${newCrops.length}件の作物をマスタに登録しました`);

process.exit(0);
