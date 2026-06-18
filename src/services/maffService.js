/**
 * maffService.js
 * 農林水産省の有機JAS告示・更新情報をCORSプロキシ経由で取得する。
 *
 * 取得対象: https://www.maff.go.jp/j/jas/jas_kikaku/yuuki.html
 * 公式サイトはCORSポリシーにより直接fetchできないため allorigins.win 経由でHTMLを取得し、
 * 更新情報リストをパースする。失敗時はフォールバックデータを返す。
 */

const MAFF_JAS_URL = 'https://www.maff.go.jp/j/jas/jas_kikaku/yuuki.html';
const MAFF_ORIGIN = 'https://www.maff.go.jp';
const CORS_PROXY = `https://api.allorigins.win/get?url=${encodeURIComponent(MAFF_JAS_URL)}`;

/**
 * 令和X年 → 西暦に変換
 */
const reiwaToAd = (reiwaYear) => 2018 + Number(reiwaYear);

/**
 * 各種日付フォーマットを YYYY-MM-DD に正規化する
 * 対応: 2026.04.01 / 2026/04/01 / 令和8年4月1日 / 2026年4月1日
 */
const normalizeDate = (text) => {
  let m;

  m = text.match(/(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = text.match(/令和(\d+)年(\d+)月(\d+)日/);
  if (m) return `${reiwaToAd(m[1])}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = text.match(/(\d{4})年(\d+)月(\d+)日/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // 年月のみ（日なし）: 月末日として扱う
  m = text.match(/令和(\d+)年(\d+)月/);
  if (m) return `${reiwaToAd(m[1])}-${m[2].padStart(2, '0')}-01`;

  m = text.match(/(\d{4})年(\d+)月/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;

  return null;
};

/**
 * href属性からMAFF完全URLを構築する
 * DOMParserはlocalhost基準でhrefを解決するため、rawAttributeから構築し直す
 */
const resolveHref = (rawHref) => {
  if (!rawHref) return MAFF_JAS_URL;
  if (rawHref.startsWith('http')) return rawHref;
  if (rawHref.startsWith('/')) return MAFF_ORIGIN + rawHref;
  return MAFF_JAS_URL.replace(/\/[^/]*$/, '/') + rawHref;
};

/**
 * MAFFの有機JASページHTMLから更新情報リストを抽出する
 */
const parseAnnouncementsFromHtml = (html) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const results = [];

  // MAFFページの典型的な更新情報パターン:
  // <li> または <p> の中に「日付テキスト + リンク」が含まれる
  const candidates = doc.querySelectorAll('li, dt, p');

  for (const el of candidates) {
    if (results.length >= 8) break;

    const fullText = el.textContent || '';
    const date = normalizeDate(fullText);
    if (!date) continue;

    // この要素内のリンクを探す
    const anchor = el.querySelector('a');
    // リンクがなければ次の兄弟要素のリンクを探す（dt+dd パターン）
    const siblingAnchor = !anchor && el.nextElementSibling
      ? el.nextElementSibling.querySelector('a')
      : null;
    const link = anchor || siblingAnchor;

    const rawHref = link ? link.getAttribute('href') : '';
    const url = resolveHref(rawHref);

    // タイトル: リンクテキスト優先、なければ日付を除いた要素テキスト
    let title = link ? link.textContent.trim() : fullText.replace(/\d{4}[./年]\d+[./月]\d*日?/g, '').trim();
    title = title.substring(0, 60) + (title.length > 60 ? '...' : '');

    if (!title) continue;

    results.push({
      id: `maff_${date}_${results.length}`,
      date,
      title,
      desc: fullText.trim().substring(0, 120),
      url,
    });
  }

  // 日付降順にソート
  results.sort((a, b) => b.date.localeCompare(a.date));
  return results;
};

/**
 * フォールバック用: 現在確認済みの最新JAS改正情報
 * 通信失敗時に使用。定期的な手動更新が望ましい。
 */
export const MAFF_FALLBACK_ANNOUNCEMENTS = [
  {
    id: 'maff_fallback_1',
    date: '2026-04-01',
    title: '日本と英国の有機同等性に関する条件改定について',
    desc: '令和8年4月1日以降の同等性を利用した英国への有機JAS製品輸出入の最新ルール変更。証明書様式と記載要領の最新仮訳が公表されました。',
    url: 'https://www.maff.go.jp/j/jas/jas_kikaku/attach/pdf/yuuki-554.pdf',
  },
  {
    id: 'maff_fallback_2',
    date: '2025-10-01',
    title: 'グループ認証における「ほ場のサンプリング調査」導入',
    desc: '信頼性を確保しつつ事業者の負担を軽減するため、一定条件を満たすことで全ほ場への現地調査を免除し、抽出サンプリング調査による適合確認が可能になりました。',
    url: 'https://www.maff.go.jp/j/jas/jas_kikaku/attach/pdf/yuuki-348.pdf',
  },
  {
    id: 'maff_fallback_3',
    date: '2025-10-01',
    title: '有機JAS実地調査への「リモート調査（オンライン）」の導入',
    desc: '2回目以降の実地調査について、過去の審査実績を考慮し訪問調査が不要と判断される場合、ビデオ通話などを利用したリモート実地検査が認可されます。',
    url: 'https://www.maff.go.jp/j/jas/jas_kikaku/attach/pdf/yuuki-349.pdf',
  },
  {
    id: 'maff_fallback_4',
    date: '2025-10-01',
    title: '有機JASで使用可能な資材の一元的な公表と運用改善',
    desc: '農林水産省がHPにて適合資材（肥料・農薬など）を一元的に公表。公表資材を使用する限り、認証機関への個別確認が不要になりました。',
    url: 'https://www.maff.go.jp/j/jas/jas_kikaku/yuuki_shizai.html',
  },
];

/**
 * 農林水産省の有機JAS更新情報を取得する
 * allorigins.win が本番ドメインでCORSブロックされるため、フォールバックデータを返す。
 * データは定期的に手動更新が必要。
 * @returns {Promise<Array>} 更新情報の配列
 */
export const fetchMaffAnnouncements = async () => {
  return MAFF_FALLBACK_ANNOUNCEMENTS;
};
