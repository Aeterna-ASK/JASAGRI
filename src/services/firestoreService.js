import { db } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

const attachmentCache = {};

/**
 * db:// 形式の参照URLを空文字（エラー防止用）に置換する
 */
function replaceDbRefs(obj, replacement = '') {
  if (!obj || typeof obj !== 'object') return;
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      if (item && typeof item === 'object') {
        replaceDbRefs(item, replacement);
      } else if (typeof item === 'string' && item.startsWith('db://attachments/')) {
        obj[index] = replacement;
      }
    });
  } else {
    Object.keys(obj).forEach(key => {
      const val = obj[key];
      if (val && typeof val === 'object') {
        replaceDbRefs(val, replacement);
      } else if (typeof val === 'string' && val.startsWith('db://attachments/')) {
        obj[key] = replacement;
      }
    });
  }
}

/**
 * db:// 形式の参照URLをクラウド（attachmentsコレクション）から非同期ロードして実データに書き戻す
 */
async function resolveDbRefs(obj) {
  if (!obj || typeof obj !== 'object') return;
  const cache = attachmentCache

  const resolveValue = async (fileRef) => {
    if (cache[fileRef]) return cache[fileRef];
    const fileId = fileRef.replace('db://attachments/', '');
    try {
      const fileUrl = await firestoreService.getAttachment(fileId);
      if (fileUrl) {
        cache[fileRef] = fileUrl;
        return fileUrl;
      }
    } catch (e) {
      console.error("Failed to resolve db ref:", fileId, e);
    }
    return '';
  };

  const tasks = [];

  const traverse = (item, parent, key) => {
    if (!item) return;
    if (typeof item === 'object') {
      if (Array.isArray(item)) {
        item.forEach((sub, idx) => {
          if (sub && typeof sub === 'object') {
            traverse(sub, item, idx);
          } else if (typeof sub === 'string' && sub.startsWith('db://attachments/')) {
            tasks.push((async () => {
              item[idx] = await resolveValue(sub);
            })());
          }
        });
      } else {
        Object.keys(item).forEach(k => {
          const val = item[k];
          if (val && typeof val === 'object') {
            traverse(val, item, k);
          } else if (typeof val === 'string' && val.startsWith('db://attachments/')) {
            tasks.push((async () => {
              item[k] = await resolveValue(val);
            })());
          }
        });
      }
    }
  };

  traverse(obj);
  await Promise.all(tasks);
}

/**
 * Firestoreとの同期を管理するサービス v.5.2.0 (添付ファイル自動別館保存・1MB制限回避仕様)
 */
const FIRESTORE_DOC_PATH = ['farms', 'organiclog_default'];

export const firestoreService = {
  /**
   * クラウドからデータを1回取得する
   */
  async fetchOnce() {
    const docRef = doc(db, ...FIRESTORE_DOC_PATH);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      await resolveDbRefs(data);
      return data;
    }
    return null;
  },

  /**
   * 添付ファイルの個別ドキュメントを取得する
   */
  async getAttachment(fileId) {
    const attachRef = doc(db, 'farms', 'organiclog_default', 'attachments', fileId);
    const snapshot = await getDoc(attachRef);
    if (snapshot.exists()) {
      return snapshot.data().fileUrl;
    }
    return null;
  },

  /**
   * クラウドにデータを保存する。重たいBase64は自動で別室に退避してドキュメント容量制限を回避する。
   * @param {Object} data - 保存するデータオブジェクト
   */
  async save(data) {
    const docRef = doc(db, ...FIRESTORE_DOC_PATH);
    
    // メインのデータをディープコピー
    const dataToSave = JSON.parse(JSON.stringify(data));
    const attachmentsToWrite = [];
    const cache = attachmentCache

    const traverseAndExtract = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          if (item && typeof item === 'object') {
            traverseAndExtract(item);
          } else if (typeof item === 'string' && item.startsWith('data:') && item.includes(';base64,')) {
            // キャッシュから既存の割当IDを逆引きして二重保存を防止
            let fileId = Object.keys(cache).find(k => cache[k] === item)?.replace('db://attachments/', '');
            if (!fileId) {
              // 新規ファイルのみクラウドに書き込む（既存ファイルの毎回再アップロードを防止）
              fileId = `file_${crypto.randomUUID().replace(/-/g, '')}`;
              cache[`db://attachments/${fileId}`] = item;
              attachmentsToWrite.push({ fileId, fileUrl: item });
            }
            obj[index] = `db://attachments/${fileId}`;
          }
        });
      } else {
        Object.keys(obj).forEach(key => {
          const val = obj[key];
          if (val && typeof val === 'object') {
            traverseAndExtract(val);
          } else if (typeof val === 'string' && val.startsWith('data:') && val.includes(';base64,')) {
            let fileId = Object.keys(cache).find(k => cache[k] === val)?.replace('db://attachments/', '');
            if (!fileId) {
              // 新規ファイルのみクラウドに書き込む（既存ファイルの毎回再アップロードを防止）
              fileId = `file_${crypto.randomUUID().replace(/-/g, '')}`;
              cache[`db://attachments/${fileId}`] = val;
              attachmentsToWrite.push({ fileId, fileUrl: val });
            }
            obj[key] = `db://attachments/${fileId}`;
          }
        });
      }
    };

    traverseAndExtract(dataToSave);

    // 新たに抽出された重たいファイルを1枚ずつ非同期に attachments サブコレクションに保存
    for (const attach of attachmentsToWrite) {
      const attachRef = doc(db, 'farms', 'organiclog_default', 'attachments', attach.fileId);
      await setDoc(attachRef, { fileUrl: attach.fileUrl }, { merge: true });
    }

    const dataToSaveWithMeta = {
      ...dataToSave,
      updatedAt: new Date().toISOString(),
      version: '5.2.0',
    };
    await setDoc(docRef, dataToSaveWithMeta, { merge: true });
    return dataToSaveWithMeta.updatedAt;
  },

  /**
   * リアルタイム同期の購読
   * @param {Function} onSuccess - データ受信時のコールバック
   * @param {Function} onError - エラー時のコールバック
   */
  subscribe(onSuccess, onError) {
    const docRef = doc(db, ...FIRESTORE_DOC_PATH);
    // 🛡️ レースコンディション防止: スナップショットのシーケンス番号を追跡する。
    // 古いスナップショットの resolveDbRefs (添付ファイル解決) が遅延して完了した場合に
    // 新しいスナップショットのデータを上書きしないようにする。
    let latestSeq = 0;

    return onSnapshot(
      docRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          onSuccess(null);
          return;
        }

        const mySeq = ++latestSeq;  // このスナップショットのシーケンス番号を記録
        const rawData = snapshot.data();

        // 1. まずはdb://参照を空にして即時表示（画像ロードエラー net::ERR_UNKNOWN_URL_SCHEME を完全防止！）
        const initialData = JSON.parse(JSON.stringify(rawData));
        replaceDbRefs(initialData, '');
        onSuccess(initialData, false);

        // 2. 次に、バックグラウンドで添付ファイルをロードし、完了次第プログレッシブに流し込んで再表示！
        await resolveDbRefs(rawData);

        // 🛡️ 新しいスナップショットが到着していた場合はこの古い結果を捨てる
        // （resolveDbRefs の待機中に新しい onSnapshot が来てデータを上書きしてしまうのを防止）
        if (mySeq !== latestSeq) {
          console.log('[Firestore] 古いスナップショット(seq=' + mySeq + ')をスキップ（最新: ' + latestSeq + '）');
          return;
        }

        onSuccess(rawData, true);
      },
      (error) => {
        console.error('Firestore subscription error:', error.code, error.message);
        if (onError) onError(error);
      }
    );
  },
};
