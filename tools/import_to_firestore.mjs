/**
 * Orgaly - import_data.json → Firestore 直接インポートスクリプト
 *
 * 実行: node tools/import_to_firestore.mjs
 *
 * 処理内容:
 *   1. public/import_data.json を読み込む
 *   2. Firestore から現在のデータを取得
 *   3. fieldName → fieldId、cropName → cropId、equipmentNames → equipmentIds を解決
 *   4. 重複チェック（date + fieldId + content先頭30字）でスキップ
 *   5. Firestore に書き戻す
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Firebase 設定 ──────────────────────────────────
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

// ── import_data.json 読み込み ──────────────────────
const jsonPath = resolve(__dirname, '..', 'public', 'import_data.json');
const importData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const { workRecords = [], materialReceipts = [] } = importData;

console.log(`📂 インポートファイル: ${jsonPath}`);
console.log(`   作業記録: ${workRecords.length}件`);
console.log(`   資材購入: ${materialReceipts.length}件`);
console.log();

// ── Firestore 取得 ─────────────────────────────────
console.log('Firestore からデータ取得中...');
const snap = await getDoc(REF);
if (!snap.exists()) {
  console.error('ドキュメントが見つかりません');
  process.exit(1);
}

const data    = snap.data();
const masters = data.masters  || {};
const records = data.records  || {};

// ── マスタマップ構築 ───────────────────────────────
const fieldMap = {};
(masters.m_field || []).forEach(f => { fieldMap[f.name] = f.id; });

const cropMap = {};
(masters.m_crop || []).forEach(c => { cropMap[c.name] = c.id; });

const equipList = masters.m_equipment || [];

console.log(`マスタ: 圃場 ${Object.keys(fieldMap).length}件, 作物 ${Object.keys(cropMap).length}件, 機材 ${equipList.length}件`);
console.log(`圃場一覧: ${Object.keys(fieldMap).join(', ')}`);
console.log(`作物一覧（先頭10件）: ${Object.keys(cropMap).slice(0, 10).join(', ')}...`);
console.log();

// ── 重複キー生成 ───────────────────────────────────
// cropId が null の場合は cropName を使って作物ごとに別キーにする
const dupKey = (r) => `${r.date}|${r.fieldId || ''}|${r.cropId || r.cropName || ''}|${(r.content || '').slice(0, 30)}`;

// ── 作業記録インポート ─────────────────────────────
const existingWR  = records.t_work_record || [];
const existingKeys = new Set(existingWR.map(dupKey));

let addedWR = 0, skippedWR = 0, unmatchedFields = new Set(), unmatchedCrops = new Set();

workRecords.forEach(raw => {
  const fieldId = fieldMap[raw.fieldName] ?? raw.fieldId ?? null;
  const cropId  = cropMap[raw.cropName]   ?? raw.cropId  ?? null;

  if (raw.fieldName && !fieldMap[raw.fieldName]) unmatchedFields.add(raw.fieldName);
  if (raw.cropName  && !cropMap[raw.cropName])   unmatchedCrops.add(raw.cropName);

  // 機材名 → equipmentIds 解決
  const equipNames = raw.equipmentNames || [];
  const resolvedEquipIds = [];
  const unmatchedEquip   = [];

  equipNames.forEach(name => {
    const found = equipList.find(e =>
      e.name === name ||
      e.name.includes(name) ||
      name.includes(e.name)
    );
    if (found) {
      if (!resolvedEquipIds.includes(found.id)) resolvedEquipIds.push(found.id);
    } else {
      unmatchedEquip.push(name);
    }
  });

  const resolved = {
    ...raw,
    fieldId,
    cropId,
    equipmentIds: resolvedEquipIds,
    // cropName を保持 → cropId=null でも作物名を参照可能・重複キーにも使用
  };
  delete resolved.fieldName;
  delete resolved.equipmentNames;
  delete resolved._importSource;
  // cropName: cropId が解決できた場合は削除、null の場合は残す（表示・重複検出用）
  if (cropId) delete resolved.cropName;

  // 未マッチの機材名は備考に追記
  if (unmatchedEquip.length > 0) {
    const equipNote = `[機材: ${unmatchedEquip.join('・')}]`;
    resolved.note = resolved.note ? `${resolved.note} / ${equipNote}` : equipNote;
  }

  const key = dupKey(resolved);
  if (existingKeys.has(key)) {
    skippedWR++;
  } else {
    existingWR.push(resolved);
    existingKeys.add(key);
    addedWR++;
  }
});

// ── 資材購入記録インポート ─────────────────────────
const existingMR   = records.t_material_receipt || [];
const existingMRKeys = new Set(
  existingMR.map(r => `${r.date}|${r.materialName}|${r.supplier || r.partnerName || ''}`)
);

let addedMR = 0, skippedMR = 0;

materialReceipts.forEach(raw => {
  const mrKey = `${raw.date}|${raw.materialName}|${raw.supplier || ''}`;
  const clean = { ...raw };
  delete clean._importSource;

  if (existingMRKeys.has(mrKey)) {
    skippedMR++;
  } else {
    existingMR.push(clean);
    existingMRKeys.add(mrKey);
    addedMR++;
  }
});

// ── 結果表示 ──────────────────────────────────────
console.log('=== インポート結果 ===');
console.log(`作業記録:   追加 ${addedWR}件 / スキップ ${skippedWR}件`);
console.log(`資材購入:   追加 ${addedMR}件 / スキップ ${skippedMR}件`);

if (unmatchedFields.size > 0) {
  console.log(`⚠️  圃場名未マッチ（fieldId=null になります）: ${[...unmatchedFields].join(', ')}`);
}
if (unmatchedCrops.size > 0) {
  console.log(`⚠️  作物名未マッチ（cropId=null になります、${unmatchedCrops.size}種類）`);
  console.log(`   先頭10件: ${[...unmatchedCrops].slice(0, 10).join(', ')}`);
}

if (addedWR === 0 && addedMR === 0) {
  console.log('\n追加するデータがありません（すべて重複または空）。');
  process.exit(0);
}

// ── Firestore 書き戻し ────────────────────────────
records.t_work_record      = existingWR;
records.t_material_receipt = existingMR;

console.log('\nFirestore に書き戻し中...');
await setDoc(REF, { ...data, records }, { merge: false });
console.log(`✅ 完了: 作業記録 ${addedWR}件、資材購入 ${addedMR}件 を追加しました`);

process.exit(0);
