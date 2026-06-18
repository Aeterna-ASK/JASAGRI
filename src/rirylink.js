/**
 * rirylink.js
 * Ri-Ry-Link (kosut-4ba58) への Firebase 第2接続
 * Orgaly とは別プロジェクトのため、独立した app インスタンスを使用する
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const RIRYLINK_APP_NAME = 'rirylink';

const riryLinkConfig = {
  apiKey:            'AIzaSyCjDhMBhZp56VCHPxV7zw0M_21JNRXMLTA',
  authDomain:        'kosut-4ba58.firebaseapp.com',
  projectId:         'kosut-4ba58',
  storageBucket:     'kosut-4ba58.firebasestorage.app',
  messagingSenderId: '993576886235',
  appId:             '1:993576886235:web:59eda6dde44cd2c02691fe',
};

// HMR 時の二重初期化を防止
const rlApp = getApps().find(a => a.name === RIRYLINK_APP_NAME)
  ?? initializeApp(riryLinkConfig, RIRYLINK_APP_NAME);

export const rlDb   = getFirestore(rlApp);
export const rlAuth = getAuth(rlApp);

// 同期専用アカウントで自動ログイン（Orgaly 起動時に一度だけ実行）
let _loginPromise = null;
export const ensureRlLogin = () => {
  if (_loginPromise) return _loginPromise;
  _loginPromise = signInWithEmailAndPassword(
    rlAuth,
    'orgaly-sync@agri-kakuida.com',
    'orgalykakuida962'
  ).then(() => {
    console.log('[RiryLink] 同期アカウント ログイン成功');
  }).catch(err => {
    console.error('[RiryLink] ログイン失敗:', err.message);
    _loginPromise = null; // 次回リトライを許可
  });
  return _loginPromise;
};
