/**
 * pestAlertService.js
 * 鹿児島県病害虫防除所の公式情報を取得・管理するサービス。
 *
 * Firebase Cloud Function (getPestAlerts) 経由でサーバーサイドフェッチ。
 * CORS プロキシ不要・本番ドメインのブロック回避。
 * Cloud Function 失敗時はフォールバックデータを返す。
 */

const PEST_CF_URL = 'https://asia-northeast1-organiclog-2f6c7.cloudfunctions.net/getPestAlerts';

const OFFICIAL_URL = 'https://www.pref.kagoshima.jp/ag13/kiad/boujosho/yosatu.html';
const OFFICIAL_ORIGIN = 'https://www.pref.kagoshima.jp';

/**
 * 令和X年 → 西暦年に変換
 */
const reiwaToAd = (n) => 2018 + Number(n);

/**
 * テキストから表示用日付文字列を抽出する（M/D 形式）
 * 令和X年X月X日 → "X/X" (月/日)
 * 令和X年X月   → "X月"
 */
const extractDisplayDate = (text) => {
  // 令和X年X月X日
  let m = text.match(/令和\d+年(\d+)月(\d+)日/);
  if (m) return `${m[1]}/${m[2]}`;

  // 令和X年X月
  m = text.match(/令和(\d+)年(\d+)月/);
  if (m) return `${reiwaToAd(m[1])}/${m[2]}`;

  // 西暦X年X月X日
  m = text.match(/(\d{4})年(\d+)月(\d+)日/);
  if (m) return `${m[2]}/${m[3]}`;

  // X年X月 (一般)
  m = text.match(/\d+年(\d+)月/);
  if (m) return `${m[1]}月`;

  return '最新';
};

/**
 * href属性からOFFICIAL_ORIGIN基準の完全URLを構築する
 * DOMParserはlocalhost基準でhrefを解決するため、rawAttributeから構築し直す
 */
const resolveHref = (rawHref) => {
  if (!rawHref) return OFFICIAL_URL;
  if (rawHref.startsWith('http')) return rawHref;
  if (rawHref.startsWith('/')) return OFFICIAL_ORIGIN + rawHref;
  return OFFICIAL_URL.replace(/\/[^/]*$/, '/') + rawHref;
};

/**
 * CORSプロキシ経由でHTMLを取得する（フォールバックチェーン付き）
 * @returns {Promise<string>} HTMLテキスト
 */
const fetchViaProxy = async () => {
  for (const buildUrl of PROXY_CHAIN) {
    try {
      const proxyUrl = buildUrl(OFFICIAL_URL);
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;

      const json = await res.json();
      // allorigins.win と corsproxy.io は { contents: "..." } 形式
      // codetabs は直接HTMLを返す
      const html = json.contents ?? (typeof json === 'string' ? json : null);
      if (html && html.length > 500) return html;
    } catch {
      // 次のプロキシへ
    }
  }
  throw new Error('All proxies failed');
};

/**
 * HTMLから発生予察情報リストを抽出する
 */
const parseAlertsFromHtml = (html) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const alerts = [];

  for (const [idx, link] of Array.from(doc.querySelectorAll('a')).entries()) {
    if (alerts.length >= 5) break;

    const text = link.textContent.trim();
    if (
      text.length > 5 &&
      (text.includes('病害虫') || text.includes('防除') || text.includes('発生予察') ||
       /第\d+号/.test(text))
    ) {
      const date = extractDisplayDate(text);
      const rawHref = link.getAttribute('href') || '';
      const url = resolveHref(rawHref);

      alerts.push({
        id: idx,
        title: text.substring(0, 35) + (text.length > 35 ? '...' : ''),
        location: '鹿児島県全域',
        date,
        summary: text,
        url,
      });
    }
  }

  return alerts;
};

/**
 * フォールバック用: 2026年5月時点の実際の予察情報
 * （通信失敗時に使用。ページ構造変化検知時も同様）
 */
const FALLBACK_ALERTS = [
  {
    id: 1,
    title: '第7号 サツマイモの病害虫発生予察情報',
    location: '鹿児島県全域',
    date: '5/15',
    summary: '第7号（令和8年5月15日）サツマイモの病害虫発生予察情報',
    url: 'https://www.pref.kagoshima.jp/ag13/kiad/boujosho/documents/106017_20260515141349-1.pdf',
  },
  {
    id: 2,
    title: '第6号 トマトの病害虫発生予察情報',
    location: '鹿児島県全域',
    date: '5/15',
    summary: '第6号（令和8年5月15日）トマトの病害虫発生予察情報',
    url: 'https://www.pref.kagoshima.jp/ag13/kiad/boujosho/documents/106017_20260515141113-1.pdf',
  },
  {
    id: 3,
    title: '第5号 果樹カメムシの発生予察情報',
    location: '鹿児島県全域',
    date: '5/14',
    summary: '第5号（令和8年5月14日）果樹カメムシの発生予察情報',
    url: 'https://www.pref.kagoshima.jp/ag13/kiad/boujosho/documents/106017_20260514174334-1.pdf',
  },
  {
    id: 4,
    title: '第4号 カンキツの病害虫発生予察情報',
    location: '鹿児島県全域',
    date: '5/8',
    summary: '第4号（令和8年5月8日）カンキツの病害虫発生予察情報',
    url: 'https://www.pref.kagoshima.jp/ag13/kiad/boujosho/documents/106017_20260508111535-1.pdf',
  },
  {
    id: 5,
    title: '第3号 チャの病害虫発生予察情報',
    location: '鹿児島県全域',
    date: '5/1',
    summary: '第3号（令和8年5月1日）チャの病害虫発生予察情報',
    url: 'https://www.pref.kagoshima.jp/ag13/kiad/boujosho/documents/106017_20260501152850-1.pdf',
  },
];

/**
 * 鹿児島県病害虫防除所の最新防除アラートを取得する
 * Cloud Function 経由でサーバーサイドフェッチ。失敗時はフォールバックを返す。
 * @returns {Promise<Array>} アラートの配列
 */
export const fetchPestAlerts = async () => {
  try {
    const res = await fetch(PEST_CF_URL, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`CF error: ${res.status}`);
    const json = await res.json();
    if (json.alerts && json.alerts.length > 0) return json.alerts;
    return FALLBACK_ALERTS;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('防除アラート取得失敗（フォールバックを使用）:', err.message);
    return FALLBACK_ALERTS;
  }
};
