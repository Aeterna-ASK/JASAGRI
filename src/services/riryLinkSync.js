/**
 * riryLinkSync.js
 * Orgaly の納品書を Ri-Ry-Link (kosut-4ba58) へ同期するサービス
 *
 * 同期条件: partnerName === '黒酢の郷 桷志田' の納品書のみ
 * 農園名  : 'AGRI KAKUIDA'（Ri-Ry-Link上のvendor名）
 */
import {
  collection, doc, addDoc, setDoc, deleteDoc,
  getDocs, query, where
} from 'firebase/firestore';
import { rlDb, ensureRlLogin } from '../rirylink.js';

/** 同期対象の納品先名 */
const TARGET_PARTNER = '黒酢の郷 桷志田';

/** Ri-Ry-Link 上での農園 vendor 名 */
const VENDOR_NAME = 'AGRI KAKUIDA';

/** Ri-Ry-Link のコレクション名 */
const COL_VENDORS    = 'vendors';
const COL_DELIVERIES = 'deliveries';

// ─────────────────────────────────────────
// ヘルパー: vendors コレクションで AGRI KAKUIDA を検索 or 作成
// ─────────────────────────────────────────
async function getOrCreateVendorId() {
  const vendorsRef = collection(rlDb, COL_VENDORS);
  const q = query(vendorsRef, where('name', '==', VENDOR_NAME));
  const snap = await getDocs(q);

  if (!snap.empty) {
    return snap.docs[0].id;
  }

  // 存在しなければ作成
  const newDoc = await addDoc(vendorsRef, {
    name:           VENDOR_NAME,
    category:       '食材',
    defaultTaxRate: 8,
    updatedAt:      new Date().toISOString(),
  });
  console.log('[RiryLink] vendor 自動作成:', newDoc.id);
  return newDoc.id;
}

// ─────────────────────────────────────────
// ヘルパー: Orgaly の itemDetails → Ri-Ry-Link の items に変換
// ─────────────────────────────────────────
function mapItems(itemDetails = []) {
  return itemDetails.map(i => {
    // fullName（「有機〇〇」形式）を優先。
    // ない場合は isOrganic フラグを見て「有機」プレフィックスを付与する。
    const baseName = i.name || '名称未設定';
    const displayName = i.fullName
      || (i.isOrganic ? `有機${baseName}` : baseName);

    return {
      name:    displayName,
      price:   Number(i.unitPrice  || 0),
      amount:  Number(i.quantity   || 0),
      unit:    i.unit    || '',
      taxRate: i.taxRate != null ? Number(i.taxRate) : 8,
    };
  });
}

// ─────────────────────────────────────────
// 公開API: 納品書を Ri-Ry-Link へ追加
// 戻り値: Ri-Ry-Link のドキュメント ID（riryLinkId として保存する）
// ─────────────────────────────────────────
export async function addToRiryLink(note) {
  if (note.partnerName !== TARGET_PARTNER) return null;

  try {
    await ensureRlLogin();
    const vendorId = await getOrCreateVendorId();

    // Orgaly の合計フィールドは "amount"（税込）。totalAmount は存在しないので注意
    const total = Number(note.amount || note.totalAmount || 0);

    const deliveryData = {
      vendorId,
      vendorName:  VENDOR_NAME,
      date:        note.date        || '',
      items:       mapItems(note.itemDetails),
      totalAmount: total,
      updatedAt:   new Date().toISOString(),
      source:      'orgaly',        // Orgaly 発信の識別タグ
      orgalyId:    note.id,         // Orgaly 側 ID（逆引き用）
      slipNo:      note.slipNo || '',
    };

    const docRef = await addDoc(collection(rlDb, COL_DELIVERIES), deliveryData);
    console.log('[RiryLink] 納品書を同期:', docRef.id);
    return docRef.id;

  } catch (err) {
    console.error('[RiryLink] 追加エラー:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────
// 公開API: 納品書を Ri-Ry-Link で更新
// ─────────────────────────────────────────
export async function updateInRiryLink(note) {
  if (!note.riryLinkId) return;
  if (note.partnerName !== TARGET_PARTNER) return;

  try {
    await ensureRlLogin();

    const total = Number(note.amount || note.totalAmount || 0);
    // vendorId/vendorName も必ず含める。
    // Ri-Ry-Link 側でレコードが手動削除された後に update が走ると
    // setDoc(merge:true) が新規作成になり、これらがないと業者名が消えるため。
    const vendorId = await getOrCreateVendorId();

    const deliveryData = {
      vendorId,
      vendorName:  VENDOR_NAME,
      date:        note.date        || '',
      items:       mapItems(note.itemDetails),
      totalAmount: total,
      updatedAt:   new Date().toISOString(),
      slipNo:      note.slipNo || '',
      source:      'orgaly',
      orgalyId:    note.id,
    };

    await setDoc(
      doc(rlDb, COL_DELIVERIES, note.riryLinkId),
      deliveryData,
      { merge: true }
    );
    console.log('[RiryLink] 納品書を更新:', note.riryLinkId);

  } catch (err) {
    console.error('[RiryLink] 更新エラー:', err.message);
  }
}

// ─────────────────────────────────────────
// 公開API: 納品書を Ri-Ry-Link から削除
// ─────────────────────────────────────────
export async function deleteFromRiryLink(riryLinkId) {
  if (!riryLinkId) return;

  try {
    await ensureRlLogin();
    await deleteDoc(doc(rlDb, COL_DELIVERIES, riryLinkId));
    console.log('[RiryLink] 納品書を削除:', riryLinkId);

  } catch (err) {
    console.error('[RiryLink] 削除エラー:', err.message);
  }
}
