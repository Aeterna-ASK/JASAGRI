/**
 * Orgaly - インポートデータ削除スクリプト
 * import_ プレフィックスのIDを持つ t_work_record / t_material_receipt を削除し
 * Firestoreに書き戻す
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

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

console.log('Firestoreからデータ取得中...');
const snap = await getDoc(REF);
if (!snap.exists()) {
  console.error('ドキュメントが見つかりません');
  process.exit(1);
}

const data = snap.data();
const records = data.records || {};

const wr_before = (records.t_work_record      || []).length;
const mr_before = (records.t_material_receipt || []).length;

records.t_work_record      = (records.t_work_record      || []).filter(r => !String(r.id || '').startsWith('import_'));
records.t_material_receipt = (records.t_material_receipt || []).filter(r => !String(r.id || '').startsWith('import_'));

const wr_del = wr_before - records.t_work_record.length;
const mr_del = mr_before - records.t_material_receipt.length;

console.log(`削除予定: 作業記録 ${wr_del}件, 資材購入記録 ${mr_del}件`);

if (wr_del === 0 && mr_del === 0) {
  console.log('削除対象のインポートデータは見つかりませんでした。');
  process.exit(0);
}

console.log('Firestoreに書き戻し中...');
await setDoc(REF, { ...data, records }, { merge: false });
console.log(`✅ 完了: 作業記録 ${wr_del}件, 資材購入記録 ${mr_del}件 を削除しました`);
process.exit(0);
