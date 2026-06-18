import { reactive } from 'vue';
import { firestoreService } from '../services/firestoreService';
import { fetchWeather } from '../services/weatherService';
import { fetchPestAlerts } from '../services/pestAlertService';
import { fetchMaffAnnouncements, MAFF_FALLBACK_ANNOUNCEMENTS } from '../services/maffService';
import { JAS_SEED_DATA } from '../services/jasSeedData';
import { fixCategory } from '../utils/categoryDetect.js';
import { addToRiryLink, updateInRiryLink, deleteFromRiryLink } from '../services/riryLinkSync.js';

// 🌟 無限自動クレンジング保存ループを防止するための状態ガードフラグ
let hasAutoHealed = false;
// 🌟 農園名称とユーザー表示名の不整合を1回だけ自動修正するためのフラグ
let hasNameHealed = false;

// --- 初期状態（ユーザー/農園情報は空、天気はAPIで更新） ---
const emptyState = {
  user: { name: '' },
  farmInfo: { name: '', postalCode: '', address: '', representative: '', tel: '', email: '', invoiceNo: '', roundingMode: 'round', taxRate: 8 },
  evidenceVault: { certOrganic: null, markLabel: null, waterTest: null },
  weather: {
    location: '鹿児島県 霧島市',
    date: '読み込み中...',
    summary: '読み込み中...',
    tempHigh: '--',
    tempLow: '--',
    precipitation: [
      { id: 1, time: '06-12', chance: '--' },
      { id: 2, time: '12-18', chance: '--' },
      { id: 3, time: '18-00', chance: '--' },
    ],
    weeklyForecast: [],
  },
  regionalAlerts: [],
  masters: {
    m_field: [], m_crop: [], m_work_type: [], m_material: [],
    m_staff: [], m_partner: [], m_equipment: [], m_process: [],
    m_pest: [], m_mapping: {}, m_solution: [], m_group: []
  },
  records: {
    t_work_record: [], t_material_receipt: [], t_harvest: [], t_delivery_note: [],
    t_receipt_queue: [], // v3.5.2 AI-OCR納品書ストックキュー
    t_inbox_documents: [], // v4.0.0 スキャン受信トレイ
    t_seed_inventory: [], // v3.9.0 種苗棚卸記録（繰越種苗）
    // v3.1.3 Organic JAS Mark Seal Ledger default seed records (Pruned/Blank for production)
    t_jas_seal_record: [],
    // v3.1.3 Audit Corrective Action logs (A21) (Pruned/Blank for production)
    t_corrective_action_record: [],
    // 種苗証明書行データ（配列）
    t_seed_cert_rows: [],
    // 年間生産予定表（年度キー → { rows: [] } のオブジェクト型）
    t_annual_plan: {},
    // 監査日管理（v5.3）: [{ id, date:'YYYY-MM-DD', note:'第X回 有機JAS審査', createdAt }]
    t_audit_dates: [],
  },
  // 監査モード（v5.3）: グローバルフィルター
  auditMode: {
    active: false,
    startDate: null, // 'YYYY-MM-DD'
    endDate: null,   // 'YYYY-MM-DD'
    label: '',       // 表示用: '2024年6月〜2025年6月'
  },
  documents: [
    {
      id: 'cat1',
      title: 'オーガニック管理マニュアル（有機農産物・有機飼料）',
      items: [
        {
          id: 'doc1_1',
          name: '第1章〜第3章：適用範囲・適用法律・用語の定義',
          version: 'v2.0.0',
          date: '2026-05-07',
          size: '0.3 MB',
          status: 'approved',
          approvedBy: '株式会社 AGRI KAKUIDA 代表',
          summary: '有機JAS生産活動の基本方針、霧島市福山大田の事業所住所、OCO・適用規格・関連法規等の定義。',
          text: `【オーガニック管理マニュアル - 第1章〜第3章】

第1. 適用範囲
1.1 一般
(1) 目的
本マニュアルの目的は、有機農産物の日本農林規格及び有機飼料の日本農林規格の生産に関し、JAS法に準拠した生産活動を行った証明を内外に対し明らかにすることである。
(2) 責任
マニュアルの全ての責任は代表者にある。

1.2 適用範囲と除外内容
本マニュアルは、JAS法に基づく有機農産物及び有機飼料の生産に係るすべての生産業務及びその他の管理業務に適用する。但し、緩衝地帯で生産された農産物は除外する。
・名称：株式会社 AGRI KAKUIDA
・住所：鹿児島県霧島市福山町福山大田311-2

第2. 適用法律
2.1 適用規格
・有機農産物の日本農林規格、有機飼料 of 日本農林規格
・有機農産物及び有機飼料（調整又は選別の工程のみを経たものに限る）についての生産行程管理者及び外国生産行程管理者の認証の技術的基準
・有機農産物、有機加工食品、有機飼料及び有機畜産物の生産行程についての検査方法
・飲食料品及び油脂の格付の表示の様式及び表示の方法
・有機飼料の格付の様式及び表示の方法
・生鮮食品品質表示基準
・玄米及び精米品質表示基準
2.2 関連する法規
・食品衛生法
・食品表示法
・景品表示法
・計量法
・肥料取締法（現・肥料の品質の確保等に関する法律）
・農薬取締法
・有機農業の推進に関する法律

第3. 本マニュアルの定義及び用語
・JAS法：日本農林規格等に関する法律
・認証事業者：農林物資の生産行程を管理・把握する個人を含め認証された事業体
・認証書：認証の技術的基準に合格した証（毎年更新）
・マニュアル：オーガニック管理マニュアル（生産行程管理規程、格付規程）
・プロセス：生産の工程
・システム：仕組み
・当該日本農林規格：有機農産物の日本農林規格及び有機飼料の日本農林規格
・当該認証の技術的基準：有機農産物及び有機飼料（調整又は選別の工程のみを経たものに限る）についての生産行程管理者及び外国生産行程管理者の認証 of 技術的基準
・識別：ものの違いを見分ける
・化学合成：化学反応によって化合物を作ること
・年間格付実績：年間格付量（kg）を集計した報告書（毎年6月にOCOに提出）
・有機耕地面積：登録場所の面積（a）を集計した報告書（毎年6月OCOに提出）
・年間計画：当年の予定生産計画（毎年6月にOCOに提出）
・不適合：マニュアルに違反した行為
・変更届：認証事項を変更しようとする前に提出する届出
・年次審査：認証された生産行程管理者等が、認証後に登録認証機関から受ける更新審査（実地審査含む）
・臨時確認審査：認証された生産行程管理者等が認証後、認証事項の変更や第三者からの通報等により行う審査
・OCO：登録認証機関 株式会社オーガニック認定機構
・FAMIC：独立行政法人農林水産消費安全技術センター
・農政局：農林水産省地方農政局
・有機：有機農産物及び有機飼料
・非有機：非有機農産物及び非有機飼料
・生産行程管理責任者（担当者）：生産行程の管理又は把握を担当する者
・格付責任者（担当者）：マニュアル（格付規程）に基づいて格付を行う者
・行程検査：製品がマニュアルに適合しているか、記録に基づき行う検査
・作業手順：当該日本農林規格及び認証の技術的基準に基づく生産の手順
・格付：格付担当者が出荷する荷口を特定し、その荷口の生産方法が「JAS規格」に適合することを確認すること
・格付品：格付での合格品
・不適合品：格付での不合格品
・仕入記録：仕入プロセスの記録
・生産記録：生産プロセスの記録（日付・作業内容・使用資材・使用機械・収穫量など）
・格付記録：JASマーク使用枚数の受払記録
・売上（出荷）記録：格付品の出荷記録
・外注（委託）管理：業務の一部（運送・寄託など）を委託・管理する行為`,
          auditPoints: '【監査員の注目点】申請者名称「株式会社 AGRI KAKUIDA」および住所「鹿児島県霧島市福山町福山大田311-2」が認証書と1字1句一致しているか確認されます。また、緩衝地帯（飛散防止エリア）を明確に定義し、そこから収穫されたものが一般農産物として有機表示から100%除外・識別されているかが現地監査で突合されます。',
          history: [
            { version: 'v2.0.0', date: '2026-05-07', author: '代表取締役', comment: '福山黒酢からAGRI KAKUIDAへの名称変更および最新規定の構造反映による完全改訂。' }
          ]
        },
        {
          id: 'doc1_2',
          name: '第4章〜第5章：マニュアル文書管理・組織及び報告責任',
          version: 'v2.0.0',
          date: '2026-05-07',
          size: '0.2 MB',
          status: 'approved',
          approvedBy: '株式会社 AGRI KAKUIDA 代表',
          summary: 'マニュアル最新版管理、OCOへの変更届提出、生管・格付責任者の任命及び年3大報告（6月提出）の規定。',
          text: `【オーガニック管理マニュアル - 第4章〜第5章】

第4. マニュアル
4.1 マニュアルの概要
当該日本農林規格及び認証の技術的基準の要求事項に従い本マニュアルを確立し、文書化し、実行し、維持し、その有効性を継続的に立証する。
(1) マニュアルの一般要求事項
・必要なプロセスの順序と相互関係を明確にする（システム図の運用）。
・プロセスの運用・管理を確実にするため、必要な判断基準と方法をマニュアルに定め、実行する。
・計画した結果、及び有効性を証明するために必要な活動を実施する。
・プロセスの外部委託（外注）を確実に管理・掌握する。

4.2 文書化
4.2.1 一般
システムは、次に示す体系の文書として構成される。
(a) マニュアル：システムを運用することで目指すべき管理方針（本規程）
(b) 記録：生産及びその他の管理において、登録認証機関（OCO）が要求する裏付記録
4.2.2 文書管理
・マニュアルが機能するために必要となる関連文書（申請書・土地図面等）を定め、維持する。
・マニュアルは最新版管理（改定日表記）を維持する。
・マニュアルの改定を行った場合、OCOに「変更届」と最新版「マニュアル」を速やかに提出する。
・廃止したマニュアルを誤って使用しないよう、適切に廃棄または識別・処分する。
4.2.3 記録管理
マニュアルの効果的運用を証明するため、以下の裏付書類及び記録を「JAS文書一覧（別紙2）」に定めた期間、厳重に保管・維持する。
・種苗証明書及び仕入の記録、農業資材証明書、受入れの記録、生産の記録、洗浄等の記録、格付の記録、JASマークの受払記録、売上（出荷）の記録、その他OCOが指示した記録一式。業務委託・寄託を行う場合も、契約書および同様の記録を要求・保管する。

第5. 組織と報告
5.1 組織及び任命・主要義務
(1) 生産行程管理責任者
OCOが指定するJAS講習会を修了した者を任命する。「マニュアル」に従い計画・立案・推進し、工程に生じた異常・不適合に関する処置または指導を行う。担当者は「JAS講習会修了書」を有効に維持・保管する。
(2) 格付担当者
OCOが指定するJAS講習会を修了した者を任命する。「マニュアル（格付規程）」に従い、製品の適合性を確認し、JASマークの貼付・管理を行う。担当者は「JAS講習会修了書」を有効に維持・保管する。

5.2 年間格付実績の報告
格付担当者（又は責任者）は、「年間格付実績（前年4月〜当年3月まで）」を毎年6月にOCOに提出する。
5.3 有機耕地面積の報告
生産行程管理責任者は、「有機耕地面積（登録場所の面積）」を毎年6月にOCOに提出する。
5.4 年間計画の報告
生産行程管理責任者は、「年間計画（当年4月〜翌年3月の作付け〜出荷の予定）」を毎年6月にOCOに提出する。
5.5 認証事項の変更
登録された認証事項（役員、圃場追加、資材、工程、保管場所など）を変更しようとする場合、生産行程管理責任者は事前にOCOに「変更届」を提出し承認を得る。`,
          auditPoints: '【監査員の注目点】毎年6月に「年間格付実績」「有機耕地面積」「年間計画」の3大報告書がOCOへ遅滞なく届出されているかが厳しくチェックされます。また、生産責任者と格付担当者の「JAS講習修了証」が現物保管されているか、人事異動等による変更の未届がないかが突合されます。',
          history: [
            { version: 'v2.0.0', date: '2026-05-07', author: '代表取締役', comment: 'AGRI KAKUIDAの最新報告スケジュールおよび文書ピラミッド管理構造を完全移植。' }
          ]
        },
        {
          id: 'doc1_3',
          name: '第6章：生産管理・作業手順（圃場・種苗・防除・収穫）',
          version: 'v2.0.0',
          date: '2026-05-07',
          size: '0.4 MB',
          status: 'approved',
          approvedBy: '株式会社 AGRI KAKUIDA 代表',
          summary: '2年・3年の管理期間、非JAS種苗の入手困難理由、許容資材リスト化、防虫防鼠駆除、混同汚染防止、洗浄水管理。',
          text: `【オーガニック管理マニュアル - 第6章】

第6. 作業手順
日本農林規格の原則に従い、自然環境に配慮して、土や自然の力を活かし、化学合成された農薬や化学肥料を使用せず、生産及び採取する。プロセスは「生産単位（ロット）」ごとに確実に追跡・監視する。

6.1 圃場（ほじょう）、採取場又は栽培場
(1) 圃場の有機管理期間
・多年生農産物：最初の収穫前3年以上の間、使用禁止資材が使用されていないこと。
・それ以外の農産物（一年生作物）：播種（はしゅ）又は植付け前2年以上の間、使用禁止資材が使用されていないこと。
・開拓圃場又は耕作放棄地（荒地）：生産開始時点で2年以上使用禁止資材が施用されておらず、多年生は収穫前1年以上、それ以外は播種/定植前1年以上の有機管理を行うこと。
・転換期間中の圃場：転換開始後、最初の収穫前1年以上の有機管理を行う。
・周辺からの使用禁止資材の飛来（ドリフト）や流入がないよう、緩衝地帯や防護壁を設け、用水の流路を確認する。

6.2 種苗（しゅびょう）
(1) 圃場に使用する種子又は苗等
・原則：有機的に管理された種子又は苗等（組換えDNA技術を用いて生産されたものでない）を使用する。
① 上記の有機種苗の入手が困難な場合、使用禁止資材を使用することなく生産されたものを使用する。
② それすら入手困難な場合は、以下に適合する一般種苗を使用できる。
・種子繁殖する品種は「種子」、栄養繁殖する品種は「入手可能な最も若齢な苗」を使用する。
・定植後に圃場で持続的に効果を示す化学合成肥料及び化学合成農薬（有機JAS許容資材を除く）が処理されていないものを使用する（非処理・非消毒証明書等の保管が必要）。

6.3 肥培管理（土壌肥沃度の維持増進）
・有機圃場で生産された農産物の残渣（ざんさ）に由来する堆肥等を施用し、周辺に生息・生育する生物を活用して土地の生産力維持を図る。
・上記で補えない場合に限り、有機JAS規格別表1に定める「肥料及び土壌改良資材」を使用する。
・自家製の農業資材を使用する場合、「自家製農業資材について」を作成し評価の上、リスト登録する。
・外部購入資材を使用する場合、製造メーカーから「有機JAS適合証明書」「成分表」を取得し、事前に「農業資材リスト」に登録してから使用する。

6.5 有害動植物の防除（病害虫・雑草対策）
(1) 防除の原則
耕種的（輪作、抵抗性品種）、物理的（マルチ、防虫ネット、手取り雑草）、生物的（天敵利用）方法、又はこれらを組み合わせた方法で効果的に防除する。
(2) 緊急避難的対応
農産物に重大な損害が生じる危険があり、原則的方法で防除できない場合に限り、有機JAS別表2に定める「許容農薬」を最小限使用する。
(3) 防除資材の使用
・専門業者に委託して施工する場合は、「防虫防鼠駆除に関する同意書」又は契約を締結し、資材の施工場所および適合性評価を行った上で委託する。
・自ら購入・設置（粘着トラップ等）する場合は、「防虫防鼠駆除使用資材自己宣言」を作成し評価の上、使用する。

6.6 一般管理
有機圃場、生産物、育苗土壌、マルチ資材等が、近隣の慣行農業や資材から化学物質・使用禁止資材の汚染（ドリフト・流出）を100%受けない措置を講じる。

6.7 育苗管理
育苗場所は、慣行農業からのドリフトや水の流入を遮断する。育苗用土は、有機圃場の土、または2年以上禁止資材が使用・飛来していない場所から採取された土、および有機JAS別表1に適合する資材のみで構成する（外部培土は要証明書・資材リスト登録）。

6.8 収穫、受入れ、輸送、選別、調製、洗浄、貯蔵、包装その他の工程に係るコンタミ防止
(1) 収穫：同一日に有機と非有機を同時に収穫しない（時間を区分する）。器具・コンテナは使用前に清掃し、有機専用であることをPOP等で識別する。
(2) 受入れ：原材料受入時に「認証書」のコピー、JASマーク及び有機表示の貼付を確認し、「仕入の記録」に記録する。
(3) 輸送：トラック荷台に有機を汚染させる油分や一般農薬、一般農産物の付着がないか出発前に点検・確認する。
(4) 選別・調整：共有機械・施設は使用前に徹底的に清掃し、化学合成成分や非有機残渣を完全に除去する。
(5) 洗浄：収穫後の有機農産物を洗浄する場合は、「飲用適の水（水道水、または水質検査済の水）」のみを使用する。機械・器具を洗浄剤で殺菌・洗浄した場合は、有機品に残留しないよう清水で完全フラッシングする。放射線照射殺菌は一切禁止する。
(6) 貯蔵・保管：専用の保管・貯蔵エリアを設け、非有機の混入やコンタミが起きないようPOP等で区画表示し、事前に清掃を実施する。
(7) 包装：JASマーク付包装資材は、JAS法基準を満たすフォントサイズ（最低8ポイント以上）で手配し、施錠可能な専用保管庫で厳重管理する。
(8) 保管・出荷：出荷まで有機POPで識別管理し、売上伝票や納品書等の名称には「有機」を明記する。

6.9 機械・器具
・トラクター、アタッチメント、刈払機、動噴等の器具は「衛生管理マニュアル」に従い、使用前に残渣や非有機付着物を徹底清掃し「洗浄等の記録」に記録する。
・機械器具置場を燻蒸処理する場合は、移動させるか、燻蒸終了後48時間以上経過してから移動・配置する。

6.10 苦情処理
・顧客（納品先・消費者）からのクレームは速やかに「クレームメモ」に記録し、原因究明と是正処置を的確に行い、OCO監査時にいつでも開示できるように長期保存する。`,
          auditPoints: '【監査員の注目点】一年生作物（定植前2年）と多年生（収穫前3年）の期間整合性、および「有機種苗がない一般種苗を使用した合理的な理由（入手困難証明書）」が監査されます。また、収穫や洗浄に使用した水が「飲用適（直近の水質検査成績書）」であるか、共用機械の「作業前の洗浄記録」が裏付けとなっているかが現地実地調査の生命線です。',
          history: [
            { version: 'v2.0.0', date: '2026-05-07', author: '代表取締役', comment: '霧島大田圃場の多年生・一年生対応、仕入受入におけるJASマーク台帳確認、飲用水検査等、実稼働基準を完全明文化。' }
          ]
        },
        {
          id: 'doc1_4',
          name: '第7章：格付・表示（JASマーク貼付・適合判定・不適合処置）',
          version: 'v2.0.0',
          date: '2026-05-07',
          size: '0.3 MB',
          status: 'approved',
          approvedBy: '株式会社 AGRI KAKUIDA 代表',
          summary: '格付担当者による生産記録検査、8ポイントフォント表示、マークの購入・使用・残数1枚単位の一致管理、出荷後不適合。',
          text: `【オーガニック管理マニュアル - 第7章】

第7. 格付・表示（格付規程）
7.1 格付・表示準備
・収穫から包装までの工程において、生産計画およびJAS要件に従い「生産の記録」などの全帳票が100%未記入なく完成していることを確認する。
・該当する荷口の数量と生産記録が一致していることを確認した上で、速やかに格付担当者に検査を依頼する。

7.2 生産行程検査（格付審査の実施）
(1) 生産方法の検査
格付担当者は、対象荷口に対応する以下の「生産の記録」を直接机上監査する。
・生産者、栽培圃場番号、作物名、播種/定植日、すべての作業内容、使用資材（肥料・農薬が登録適合品のみか）、使用した機械・器具の清掃有無、収穫量、受入チェックの有無。
・上記が本マニュアルに定める「有機栽培基準」に完全に合格しているか確認する。
(2) 収穫〜出荷の検査
・収穫から選別・洗浄・袋詰めまでのすべてのプロセスにおいて、非有機品の混入や化学合成成分に汚染される危険性が100%排除されていたことを、現場清掃記録（洗浄等の記録）によって確認・突合する。

7.3 表示の確認
・袋やカートン、資材等に印刷される「表示（原材料、名称、原産地、事業者情報）」が、有機農産物の日本農林規格第5条、生鮮食品品質表示基準等の様式に100%適合しているか確認する。
・「有機JASマーク」および「有機JAS認定機関名（OCO等）」の表記が適正であり、かつ表示フォントサイズは「最低8ポイント以上の字体」が維持されていることを定規等で目視・測定確認する。

7.4 JASマークの管理
・JASマークは、認証を受けた事業者自身が勝手に（無断で）自宅のプリンター等でデジタル作成・印刷してはならない。必ず認証機関（OCO等）または認定された資材業者から正規購入・納品されたものを使用する。
・JASマーク、およびJASマークがプリプレ印刷された包装袋・段ボールは、「格付担当者」の厳格な責任下において、施錠された専用保管場所に納める。
・「格付の記録（JASマーク受払簿）」に、シールの「入庫（購入）枚数」「作業使用枚数」「貼りミス等による破棄・汚損枚数」「在庫残数」を1枚単位で即時記帳し、理論在庫と現物シール枚数を1枚のズレもなく完全に一致させる。

7.5 格付後の適合品の処理
・生産行程検査、および表示確認のすべてにおいて適合（合格）と判断された製品にのみ、格付（JASマークの貼付、またはプリプレ袋への充填）を決定・執行する。
・格付担当者は、合格数量、使用シール番号、出荷先を「格付の記録」に即時記帳し、有機専用記録保管場所に保管するとともに、生産行程管理責任者へ報告する。
・取引先から認証証明書を要求された場合は、右上に「COPY」と朱書きで表記した認証書の複写を提出する。

7.6 格付後の不適合品の処理
・生産行程検査の過程で、1項目でもマニュアルに不適合（記録漏れ、資材適合の確認不可、非有機の混同懸念など）が検出された荷口は、「不適合（不合格）」と判定する。
・不適合品は、絶対に適合格付品と混同しないよう「不適合品」POP等で明確に区切られた専用エリアへ即座に移動隔離する。
・格付担当者は、直ちに生産行程管理責任者へ状況を報告し、その指示を仰ぐ。
・不適合品を一般品（慣行品）として転売、または廃棄処分する場合は、貼付されたJASマークをカッター等で完全に剥離・抹消（または袋のマーク部分を切り取り処分）し、その処分・転用実績を「格付の記録」に詳細に記帳する。

7.7 出荷後に有機JASに不適合であることが明らかとなった荷口への対応
・出荷完了後に、肥料や資材の誤用、近隣からのドリフト発覚、その他有機JAS適合性に疑義が生じた荷口が発覚した場合、直ちに納品先（卸、小売業者等）に緊急連絡を行い、当該ロットの販売中止を要請する。
・納品先に対し、流通段階にある製品の「格付の表示（JASマーク）」を適切に剥離・抹消（マジックで黒塗り、シール剥がし、または回収廃棄）させるための具体的な措置を執り、回収および是正の顛末をすべて書面で記録しOCOへ報告する。`,
          auditPoints: '【監査員の注目点】格付担当者が「出荷前に実際の生産・清掃記録を見て、規格適合を1枚ずつ検査・判定してからJASマークを貼ったか（机上監査プロセス）」が突合されます。また、JASシールの「購入数 - 使用数 - 廃棄数 = 残在庫数」の1枚単位の現物実数カウント（抜き打ちカウント）が必ず監査で実施され、ズレがあると重大な指摘になります。',
          history: [
            { version: 'v2.0.0', date: '2026-05-07', author: '代表取締役', comment: 'AGRI KAKUIDAの格付シール受払管理簿・不適合品カッター剥離ルール等、実際のOCO指摘対策に完全合致。' }
          ]
        },
        {
          id: 'doc1_5',
          name: '第8章〜第10章：外注管理・検査機関対応・マニュアル見直し',
          version: 'v2.0.0',
          date: '2026-05-07',
          size: '0.2 MB',
          status: 'approved',
          approvedBy: '株式会社 AGRI KAKUIDA 代表',
          summary: '外注業者のコンタミ防止事前契約、OCO/FAMIC調査の7日以内回答、年1回以上の全員周知・見直し。',
          text: `【オーガニック管理マニュアル - 第8章〜第10章】

第8. 業務委託（外注）管理
・運送業務や製品の一時寄託（倉庫保管）など、有機JASに関わる業務の一部を外部業者に委託する場合は、委託先が有機品の「化学合成成分による汚染防止」および「非有機品との混同防止」を完全に実施する能力を有しているか、事前に評価して選定する。
・委託選定後、事前に「運送契約書」「業務委託契約書」「寄託に関する同意書（または自己宣言）」を締結し、コンタミ・汚染防止対策の責任境界を明確に合意・署名捺印した上で業務を開始する。

第9. OCO及びFAMIC・農政局による確認事項の実施
・生産行程管理責任者は、登録認証機関（OCO）、独立行政法人農林水産消費安全技術センター（FAMIC）、地方農政局から有機JAS適合性に関する質問・問い合わせ、または立入確認調査の指示を受けた場合は、遅滞なく現地を調査する。
・連絡や指摘を受けた日から「7日以内」に、詳細な調査結果及びエビデンス（裏付記録）を書面にて関係機関へ報告する。
・調査の現地受審申請があった場合、生産行程管理責任者および代表者は、一切の立入・サンプリングを拒否することなく、速やかに審査（受審）に対応する。

第10. マニュアルの見直し
・本「オーガニック管理マニュアル」は、形骸化を防ぎ、常に最新の法規に準拠させるため、「最低年1回（以上）」定期的な見直しを行う。
・また、以下の状況が発生した場合は、速やかに臨時見直し・改定を実施する。
  ① 登録認証機関（OCO）の審査監査により、管理体制の是正や見直しの指摘（不適合通知）を受けたとき。
  ② 法令（JAS法、各種表示基準、農水省告示等）に改正・運用変更があったとき（JAS法改正情報は認証事業者の自己責任で常時確認・アップデートする）。
  ③ 社内の生産品目、圃場、資材、工程、責任体制などに大きな変更があったとき。
・見直し・改定を実行した場合は、全従業員（役員、常勤、パート・アルバイト等の作業者全員）に対して、改定内容を漏れなく周知するための「教育訓練」を速やかに実施し、受講サイン簿等の証跡を保管する。`,
          auditPoints: '【監査員の注目点】配送の外部委託がある場合、有機JAS要件（コンタミ・汚染防止合意）を盛り込んだ「運送契約書（または覚書）」が事前に有効に締結されているかが監査されます。また、マニュアル改定時に「スタッフ全員に本当に教育が施されたか（日付・サインのある教育記録）」が評価対象になります。',
          history: [
            { version: 'v2.0.0', date: '2026-05-07', author: '代表取締役', comment: '運送・寄託（マイドライブ内資料）の締結要件、OCO/FAMICへの「7日以内」回答期限を明記。' }
          ]
        }
      ]
    },
    {
      id: 'cat2',
      title: '別紙マニュアル・管理規程',
      items: [
        {
          id: 'doc2_1',
          name: '別紙1. 衛生管理マニュアル',
          version: 'v2.0.0',
          date: '2026-05-07',
          size: '0.2 MB',
          status: 'approved',
          approvedBy: '株式会社 AGRI KAKUIDA 代表',
          summary: '食品衛生法準拠、動線CCP予測、5Sの徹底、塩素使用後の清水洗浄、業者駆除計画、機械オイル漏れ点検。',
          text: `【別紙1. 衛生管理マニュアル】

1. 目的
食品衛生法を遵守し、有機JAS製品が、非有機品（慣行栽培品）の混入や化学合成成分に一切汚染されないように、徹底した施設衛生・器具管理を行う。

2. 管理手順
(1) 構造の要件
・施設および作業エリアは、有機品に非有機品の混入が起きず、かつ、化学合成成分（排気ガス、殺虫剤、一般資材など）に汚染されないよう、物理的な間仕切り、または明確な距離を確保した構造・レイアウトとする。
(2) 衛生管理
・施設・倉庫内では、5S（整理、整頓、清掃、清潔、躾）を全スタッフが徹底する。
・「有機JAS取り扱いエリア」であることをPOP・看板で大きく明示し、パートや外部立ち入り者を含む全従業者に有機混同防止を周知・訓練する。
(3) 管理方法（ハサップ・CCPの目線）
・原材料の搬入、機械選別、格付（袋詰め）、出荷の全動線をレイアウト図上で把握する。
・構造・動線上、どの地点で非有機品の混入（コンタミ）や危害が起きやすいか事前に予測し、混入防止対策を講じる。
・日々の現場目視点検（モニタリング）を行い、異常を検出した場合はその結果を記録・是正分析する。
(4) 洗浄・掃除について
・有機の作業行程に使用するすべての機械、コンテナ、器具、集荷用パレットは、作業前に清掃・掃除を必ず実施する。
・特に一般（慣行）農産物の作業に共用した後は、高圧洗浄等で残渣を完全に除去し、「洗浄等の記録（衛生点検簿）」に記録した後にのみ、有機の作業を開始する。
・洗浄殺菌剤、オゾン水、次亜塩素酸などの電解水等を作業場や器具に使用・殺菌した場合は、有機農産物に成分が残留・付着して汚染しないよう、使用後に「清水（飲用適の水）」で徹底的に洗い流し、完全に除去する。
・病害虫駆除、病原菌除去、または食品保存の目的で、有機農産物に対し「放射線照射」を施すことは絶対に禁止する。
(5) 防虫・防鼠（ぼうしゅ）駆除
・ねずみ、ゴキブリ、ハエ等の虫が有機農産物に接触・侵入することを防止する構造（防虫網、シャッター、シートシャッター等）を維持する。
・防虫防鼠に使用する駆除薬剤が、絶対に有機品に接触・汚染させない物理的配置（または作業場外での設置）とする。駆除を実施した場合は、日付・薬剤名・施工場所を詳細に記録する。
・作業場の「外周」の雑草や害虫処理においては、原則として化学合成除草剤や殺虫剤を使用しない。物理的草刈り等で対処する。困難な理由があり緊急に使用する場合は、作業場内への流入・浸入・付着がないよう厳格に窓を閉鎖する等の遮断管理を実施する。
(6) 機械・器具のメンテナンス
・トラクター、アタッチメント、搬送コンベア、包装機などのすべての機械は、エンジンオイル、作動油（ハイドロリックオイル）、機械グリスの漏れや飛散により有機農産物が油汚染されないよう、定期的なオイルパッキン点検、油漏れチェックを実施する。

3. 防虫防鼠駆除業者への委託について（外部委託の基準）
害虫・ねずみの駆除を外部業者へ外注する場合は、以下の条件を遵守させる。
① 有機農産物の汚染防止（有機JASで使用可能な資材以外の非JAS薬剤の不使用、または物理遮断）を、事前同意書にて署名約束させる。
② 「防虫防鼠駆除に関する同意書」を取り交わす。
③ 駆除の年間計画書、ベイトトラップの配置図を提出させる。
④ 使用するすべての薬剤のSDS（安全データシート）および有機適合評価書類を提出させ、保管する。

4. 駆除剤・洗浄剤の使用注意点
・使用する場所、対象機械を限定・特定する。
・使用薬剤名、使用頻度、施工のタイミング（有機製品がすべて出荷され現場が空のとき等）を予め決定する。
・使用上の注意書に厳格に従い、施工後は残留成分がないよう十分に清水洗浄する。
・作業終了後、清掃・洗浄・メンテナンスの実施事実を「衛生管理点検簿」に記帳し、検印を受ける。

5. 教育訓練
・すべてのスタッフ（常勤、非常勤、パート、派遣含む）が本「衛生管理マニュアル」の内容を理解し、慣行栽培品とのコンタミ防止を現場で実演できるよう、年1回以上の教育訓練を実施し、記録を保管する。`,
          auditPoints: '【監査員の注目点】共用機械（選別機やトラクター）の作業前の洗浄プロセスが「洗浄等の記録（衛生管理簿）」に本当に記入されているかが現物突合されます。また、防虫ねずみトラップの設置図面が業者から回収され、使用薬剤が有機適合基準外（別表不適合）の化学物質である場合、それが有機製品へ接触しない「遮断措置」がなされているかの立証を求められます。',
          history: [
            { version: 'v2.0.0', date: '2026-05-07', author: '代表取締役', comment: 'AGRI KAKUIDAの実機メンテナンス要件、オイル漏れ点検、外部防虫駆除業者（同意書等）の要件を別紙1として完全規定。' }
          ]
        },
        {
          id: 'doc2_2',
          name: '別紙2. JAS文書及び記録一覧表',
          version: 'v2.0.0',
          date: '2026-05-07',
          size: '0.1 MB',
          status: 'approved',
          approvedBy: '株式会社 AGRI KAKUIDA 代表',
          summary: 'JAS帳票類の保管責任者（生管責任者/格付担当者）と、一年生2年/多年生3年/賞味期限に基づく保管期間定義。',
          text: `【別紙2. JAS文書及び記録一覧表】

当農園における有機JAS関係書類の保管期限、および保管責任者を以下のように定め、厳格に維持管理する。

■ JAS文書（申請・規定関係）
1. 申請書類：生産行程管理責任者保管 / 期間：認証継続期間中（認証及び臨時確認審査時に作成した申請書類一式）
2. オーガニック管理マニュアル：生産行程管理責任者保管 / 期間：認証継続期間中（最低年1回見直し、改定時は最新版と差替え）
3. 衛生管理マニュアル：生産行程管理責任者保管 / 期間：認証継続期間中（非有機品の混入・化学汚染防止マニュアル）
4. JAS講習会修了書：生産行程管理責任者保管 / 期間：スタッフの雇用期間中（生管責任者・格付担当者に任命している者）
5. 業務委託契約書（関連書類）：生産行程管理責任者保管 / 期間：委託期間中（運送契約、外注、倉庫保管等の契約書類）
6. 年間格付実績/有機耕地面積/年間計画：生産行程管理責任者保管 / 期間：提出から1年間（毎年6月に前年分をOCOへ報告した控え）
7. 審査終了報告書：生産行程管理責任者保管 / 期間：1年間（実地審査結果、不適合是正処置完了の証跡）
8. 変更届：生産行程管理責任者保管 / 期間：認証継続期間中（認証事項変更の前にOCOに提出した書面）
9. クレームメモ：生産行程管理責任者保管 / 期間：認証継続期間中（格付製品に対する苦情および対策の記録）
10. JASマーク不正使用報告書：生産行程管理責任者保管 / 期間：認証継続期間中（マークの不正使用発見時の是正報告）

■ 生産に関する記録（現場台帳）
1. 仕入の記録：生産行程管理責任者保管 / 期間：※1＋※2の期間＋生産期間（原材料・種苗証明書、肥料等資材の納品伝票・請求書）
2. 生産の記録及び関連書類：生産行程管理責任者保管 / 期間：※1＋※2の期間＋生産期間（日々の農作業・施肥・防除記録、作業機清掃記録等）
3. 製品の受払記録（収穫物）：生産行程管理責任者保管 / 期間：※1＋※2の期間＋生産期間（収穫量、調製、有機専用倉庫への入出庫記録）

■ 格付・出荷に関する記録（台帳）
1. 格付の記録・JASマーク受払記録：格付担当者保管 / 期間：※2の期間（JASマークシールの購入数、使用数、汚損破棄数、現物理論在庫管理簿）
2. 売上（出荷）の記録：格付担当者保管 / 期間：※2の期間（販売納品伝票、返品・一般転用の記録、送り状控え）

--------------------------------------------------
【保管期間の算出基準（※1、※2の定義）】

※1 【圃場管理及び有機JASの適合期間（圃場条件を満たすかどうかの確認に必要な記録）】
・多年生作物（黒酢原料等の多年生作物など）：最初の収穫から「3年間」
・一年生作物（一般作物など）：播種/定植から「2年間」

※2 【出荷・賞味（消費）期限に基づく保管期間】
(1) 出荷から賞味期限（消費するまで）が「1年以上」の製品：
・賞味期限があるもの：格付実施日から、その製品の「賞味期限満了日まで」の期間
・賞味期限がないもの：出荷実施日から「3年間」
(2) 出荷から消費・賞味期限が「1年未満」の製品：
・一律、格付実施日から「1年間」保管する。`,
          auditPoints: '【監査員の注目点】「別紙2の規定通りの期間、台帳が実際に残されているか」を、3年前などの過去の日付をランダムに指定され、「仕入伝票とそれに対応する種苗証明書」をその場でバインダーから取り出して見せる突合監査が行われます。紛失や、規定未満での早期廃棄は重大な不適合になります。',
          history: [
            { version: 'v2.0.0', date: '2026-05-07', author: '代表取締役', comment: 'AGRI KAKUIDAの全JAS文書（別紙2）および一年生2年/多年生3年の厳密な保管期限を網羅。' }
          ]
        }
      ]
    }
  ],
  maffJasInfo: {
    lastSynced: '2026-05-07',
    links: [
      { id: 'standard', name: '有機農産物の日本農林規格 (JAS規格)', url: 'https://www.maff.go.jp/j/jas/jas_kikaku/attach/pdf/yuuki-437.pdf', size: '500KB', type: '規格' },
      { id: 'criteria', name: '有機農産物の認証の技術的基準 (生産行程管理)', url: 'https://www.maff.go.jp/j/jas/jas_kikaku/attach/pdf/yuuki-464.pdf', size: '335KB', type: '基準' },
      { id: 'inspection', name: '有機農産物及び有機加工食品の検査方法', url: 'https://www.maff.go.jp/j/jas/jas_kikaku/attach/pdf/yuuki-457.pdf', size: '314KB', type: '検査' },
      { id: 'labeling', name: '有機農産物及び有機加工食品の格付表示の様式・方法', url: 'https://www.maff.go.jp/j/jas/jas_kikaku/attach/pdf/yuuki-467.pdf', size: '248KB', type: '格付' }
    ],
    announcements: MAFF_FALLBACK_ANNOUNCEMENTS
  },
  slipCounter: 1001,
  viewMode: 'mobile',
  activeTab: 'dashboard',
  toast: { show: false, message: '', type: 'success' },
  isCloudConnected: false,
  isInitialLoading: true,
};

export const state = reactive({ ...emptyState });

export const actions = {
  setActiveTab(id) {
    state.activeTab = id;
  },

  // ===== 圃場指定 作業記録削除 =====
  deleteWorkRecordsByField(fieldIds) {
    if (!state.records.t_work_record) return 0;
    const ids = new Set(fieldIds);
    const before = state.records.t_work_record.length;
    state.records.t_work_record = state.records.t_work_record.filter(r => !ids.has(r.fieldId));
    const deleted = before - state.records.t_work_record.length;
    if (deleted > 0) this.syncToCloud();
    return deleted;
  },

  // ===== CSV → 作業記録インポート =====
  parseCSVWorkRecords(csvText, targetFieldId) {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    // ヘッダ行をスキップ
    const rows = lines.slice(1);

    // 年推定: 月が前の行より小さくなったら年を進める
    let year = 2025;
    let prevMonth = 0;
    const parsedRows = rows.map(line => {
      const cols = line.split(',');
      const dateStr = cols[0]?.trim();
      const m = dateStr?.match(/(\d+)月(\d+)日/);
      if (!m) return { _skip: true };
      const month = parseInt(m[1]);
      const day = parseInt(m[2]);
      if (prevMonth > 0 && month < prevMonth) year++;
      prevMonth = month;
      return { _year: year, _month: month, _day: day, cols };
    }).filter(r => !r._skip);

    // サブ日付の年推定（播種日/定植日: 前, 収穫始め/終: 後の可能性）
    const inferYear = (subMonth, mainMonth, mainYear) => {
      if (!subMonth) return mainYear;
      if (subMonth < 4 && mainMonth > 8) return mainYear + 1; // 年をまたぐ収穫
      if (subMonth > 10 && mainMonth < 4) return mainYear - 1; // 前年播種
      return mainYear;
    };
    const parseSubDate = (dateStr, mainMonth, mainYear) => {
      if (!dateStr?.trim()) return '';
      const m = String(dateStr).match(/(\d+)月(\d+)日/);
      if (!m) return '';
      const mo = parseInt(m[1]), dy = parseInt(m[2]);
      const yr = inferYear(mo, mainMonth, mainYear);
      return `${yr}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
    };

    const records = [];
    parsedRows.forEach(({ _year, _month, _day, cols }) => {
      const date = `${_year}-${String(_month).padStart(2,'0')}-${String(_day).padStart(2,'0')}`;
      const cropName   = cols[1]?.trim() || '';
      const workName   = cols[2]?.trim() || '';
      const growTag    = cols[3]?.trim() || '';
      const seedName   = cols[4]?.trim() || '';
      const quantity   = cols[5]?.trim() || '';
      const supplier   = cols[6]?.trim() || '';
      const purchaseDate = (() => {
        const raw = cols[7]?.trim() || '';
        if (/^\d{4}\/\d+\/\d+$/.test(raw)) {
          const [y,mo,d] = raw.split('/');
          return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
        return '';
      })();
      const equipment  = cols[8]?.trim() || '';
      const cleaning   = cols[9]?.trim() || '';
      const sowingDate   = parseSubDate(cols[10], _month, _year);
      const plantingDate = parseSubDate(cols[11], _month, _year);
      const harvestStart = parseSubDate(cols[12], _month, _year);
      const harvestEnd   = parseSubDate(cols[13], _month, _year);
      const memo       = cols[14]?.trim() || '';

      const content = growTag || workName || '作業';
      const note = [
        seedName && `種苗・資材: ${seedName}`,
        quantity && `数量: ${quantity}`,
        memo
      ].filter(Boolean).join(' / ');

      const isHarvestRow = /収穫/.test(growTag);
      const itemName = seedName || (isHarvestRow ? cropName : '');
      const seeds = (itemName || quantity) ? [{
        name: itemName,
        quantity,
        source: supplier,
        purchaseDate
      }] : [];

      records.push({
        id: `import_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        date,
        fieldId: targetFieldId,
        cropName,
        content,
        note,
        workerName: '管理者',
        equipmentNames: equipment,
        cleaningMethod: cleaning,
        seeds,
        materials: [],
        equipmentIds: [],
        sowingDateOverride: sowingDate,
        plantingDateOverride: plantingDate,
        harvestStartOverride: harvestStart,
        harvestEndOverride: harvestEnd,
        createdAt: new Date().toISOString()
      });
    });
    return records;
  },

  importCSVWorkRecords(csvText, targetFieldId) {
    const records = this.parseCSVWorkRecords(csvText, targetFieldId);
    if (!records.length) return 0;
    if (!state.records.t_work_record) state.records.t_work_record = [];
    records.forEach(r => state.records.t_work_record.push(r));
    this.syncToCloud();
    return records.length;
  },

  // ===== Excelインポート（v5.3） =====
  /**
   * strategy: 'overwrite' | 'skip'
   *   overwrite    … 重複行を上書き（新旧IDが同じ date+fieldId+content の最初の20文字で判定）
   *   skip         … 重複行をスキップし、新規のみ追加
   */
  importRecordsFromJson(jsonData, strategy = 'skip') {
    const { workRecords = [], materialReceipts = [] } = jsonData;

    // ── フィールドID解決 ─────────────────────
    const fieldMap = {};
    (state.masters.m_field || []).forEach(f => { fieldMap[f.name] = f.id; });

    // ── 作物ID解決 ───────────────────────────
    const cropMap = {};
    (state.masters.m_crop || []).forEach(c => { cropMap[c.name] = c.id; });

    // ── 機材ID解決（名前マッチング）────────────
    const equipList = state.masters.m_equipment || [];

    // ── 重複キー生成（date + fieldId + content先頭30字 + 作物 + 先頭品名）─
    // 作物名・品名まで含めることで、同一日・同一作業でも作物/品目が異なる記録を
    // 誤って重複扱いしないようにする（例: 同じ日の播種でも作物が違えば別レコード）。
    const _firstItemName = (r) => (r.seeds?.[0]?.name) || (r.materials?.[0]?.name) || '';
    const dupKey = (r) => `${r.date}|${r.fieldId}|${(r.content || '').slice(0, 30)}|${r.cropId || ''}|${_firstItemName(r)}`;

    // ── 作業記録インポート ───────────────────
    const existingWR = state.records.t_work_record || [];
    const existingKeys = new Set(existingWR.map(dupKey));

    let addedWR = 0, overwrittenWR = 0, skippedWR = 0;

    workRecords.forEach(raw => {
      // fieldId / cropId を解決
      const fieldId = fieldMap[raw.fieldName] ?? raw.fieldId;
      const cropId  = cropMap[raw.cropName]   ?? raw.cropId;

      // 機材名 → equipmentIds 解決（部分一致でマッチング）
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

      const resolved = { ...raw, fieldId, cropId, equipmentIds: resolvedEquipIds };
      delete resolved.fieldName;
      delete resolved.cropName;
      delete resolved.equipmentNames;
      delete resolved._importSource;

      // 未マッチの機材名は備考に追記（JAS帳票の機械・器具欄で確認できるよう）
      if (unmatchedEquip.length > 0) {
        const equipNote = `[機材: ${unmatchedEquip.join('・')}]`;
        resolved.note = resolved.note ? `${resolved.note} / ${equipNote}` : equipNote;
      }

      const key = dupKey(resolved);

      if (existingKeys.has(key)) {
        if (strategy === 'overwrite') {
          const idx = existingWR.findIndex(r => dupKey(r) === key);
          if (idx !== -1) {
            existingWR[idx] = { ...resolved, id: existingWR[idx].id };
            overwrittenWR++;
          }
        } else {
          skippedWR++;
        }
      } else {
        existingWR.push(resolved);
        existingKeys.add(key);
        addedWR++;
      }
    });
    state.records.t_work_record = existingWR;

    // ── 資材購入記録インポート ────────────────
    const existingMR = state.records.t_material_receipt || [];
    const existingMRKeys = new Set(existingMR.map(r => `${r.date}|${r.materialName}|${r.supplier || r.partnerName}`));

    let addedMR = 0, skippedMR = 0;

    materialReceipts.forEach(raw => {
      const mrKey = `${raw.date}|${raw.materialName}|${raw.supplier}`;
      const clean = { ...raw };
      delete clean._importSource;

      if (existingMRKeys.has(mrKey)) {
        if (strategy === 'overwrite') {
          const idx = existingMR.findIndex(r => `${r.date}|${r.materialName}|${r.supplier || r.partnerName}` === mrKey);
          if (idx !== -1) { existingMR[idx] = { ...clean, id: existingMR[idx].id }; addedMR++; }
        } else {
          skippedMR++;
        }
      } else {
        existingMR.push(clean);
        existingMRKeys.add(mrKey);
        addedMR++;
      }
    });
    state.records.t_material_receipt = existingMR;

    // クラウド同期
    this.syncToCloud();

    return { addedWR, overwrittenWR, skippedWR, addedMR, skippedMR };
  },

  /** インポートデータを全削除（ID が import_ で始まるレコードを除去） */
  clearImportedRecords() {
    const before_wr = (state.records.t_work_record || []).length;
    const before_mr = (state.records.t_material_receipt || []).length;
    state.records.t_work_record      = (state.records.t_work_record      || []).filter(r => !String(r.id).startsWith('import_'));
    state.records.t_material_receipt = (state.records.t_material_receipt || []).filter(r => !String(r.id).startsWith('import_'));
    const del_wr = before_wr - state.records.t_work_record.length;
    const del_mr = before_mr - state.records.t_material_receipt.length;
    this.syncToCloud();
    return { del_wr, del_mr };
  },

  // ===== 監査モード（v5.3） =====
  setAuditMode(active, startDate = null, endDate = null, label = '') {
    state.auditMode.active = active;
    state.auditMode.startDate = startDate;
    state.auditMode.endDate = endDate;
    state.auditMode.label = label;
  },

  addAuditDate(dateStr, note = '') {
    if (!state.records.t_audit_dates) state.records.t_audit_dates = [];
    state.records.t_audit_dates.push({
      id: 'aud_' + Date.now(),
      date: dateStr,
      note: note,
      createdAt: new Date().toISOString(),
    });
    // 日付順でソート
    state.records.t_audit_dates.sort((a, b) => a.date.localeCompare(b.date));
    this.syncToCloud();
  },

  deleteAuditDate(id) {
    state.records.t_audit_dates = (state.records.t_audit_dates || []).filter(d => d.id !== id);
    this.syncToCloud();
  },

  showToast(message, type = 'success', duration = 3000) {
    state.toast.show = true;
    state.toast.message = message;
    state.toast.type = type;
    setTimeout(() => { state.toast.show = false; }, duration);
  },

  /**
   * 起動時に実行するメイン同期処理。
   * Cloud同期・天気API・防除アラートを並行して取得する。
   */
  async initSync() {
    state.isInitialLoading = true;

    // 既存のFirestoreリスナーがあれば解除（多重subscribeによるリスナー蓄積・メモリリーク防止）
    if (this._unsubscribeCloud) {
      try { this._unsubscribeCloud(); } catch (e) { /* noop */ }
      this._unsubscribeCloud = null;
    }

    // 天気と防除アラートをバックグラウンドで並行取得（Cloud同期と独立）
    fetchWeather()
      .then(weather => { Object.assign(state.weather, weather); })
      .catch(err => {
        if (import.meta.env.DEV) console.warn('天気取得失敗:', err);
        Object.assign(state.weather, { date: '取得失敗', summary: '通信エラー', tempHigh: '--', tempLow: '--' });
      });

    fetchPestAlerts()
      .then(alerts => { state.regionalAlerts = alerts; })
      .catch(err => { if (import.meta.env.DEV) console.warn('防除アラート取得失敗:', err); });

    // 農水省JAS告示をバックグラウンドで自動取得（前回から24時間以上経過した場合のみ）
    const lastSynced = state.maffJasInfo.lastSynced;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (!lastSynced || lastSynced < oneDayAgo) {
      fetchMaffAnnouncements()
        .then(announcements => {
          state.maffJasInfo.announcements = announcements;
          state.maffJasInfo.lastSynced = new Date().toISOString().split('T')[0];
        })
        .catch(err => { if (import.meta.env.DEV) console.warn('農水省告示取得失敗:', err); });
    }

    // Firestore同期：onSnapshotのみ使用（getDocは"client is offline"エラーを起こすため廃止）
    // onSnapshotは内部で自動リトライするため、接続確立後に必ずデータを受け取れる
    this._unsubscribeCloud = firestoreService.subscribe(
      (data, isResolved) => {
        if (data) {
          this.applyData(data, isResolved);
        }
        state.isCloudConnected = true;
        state.isInitialLoading = false;
      },
      (error) => {
        console.warn('Firestore subscription error:', error.code, error.message);
        state.isCloudConnected = false;
        state.isInitialLoading = false;
      }
    );
  },

  /**
   * クラウドから取得したデータをリアクティブなstateに適用する。
   * weatherとregionalAlertsはAPIで管理するためcloudデータからは除外。
   */
  applyData(data, isResolved = false) {
    if (!data) return;
    if (data.user && typeof data.user === 'object') {
      Object.assign(state.user, data.user);
    }
    if (data.farmInfo && typeof data.farmInfo === 'object') {
      Object.assign(state.farmInfo, data.farmInfo);
    }
    
    // マスタデータの同期
    if (data.masters && typeof data.masters === 'object') {
      Object.keys(data.masters).forEach(key => {
        if (state.masters[key] !== undefined) {
          if (Array.isArray(data.masters[key])) {
            state.masters[key] = [...data.masters[key]];
          } else if (typeof data.masters[key] === 'object' && data.masters[key] !== null) {
            state.masters[key] = { ...data.masters[key] };
          }
        }
      });
    }

    // 記録データの同期
    if (data.records && typeof data.records === 'object') {
      Object.keys(data.records).forEach(key => {
        const incoming = data.records[key];
        if (state.records[key] !== undefined) {
          if (Array.isArray(incoming)) {
            // 配列型レコード（通常の記録データ）
            state.records[key] = [...incoming];
          } else if (incoming !== null && typeof incoming === 'object') {
            // オブジェクト型レコード（t_annual_plan等、年度キーを持つ辞書）
            state.records[key] = JSON.parse(JSON.stringify(incoming));
          }
        }
      });
    }

    // ドキュメントマニュアルデータの同期
    if (data.documents && Array.isArray(data.documents)) {
      state.documents = JSON.parse(JSON.stringify(data.documents));
    }

    // 農水省JAS情報の同期
    if (data.maffJasInfo && typeof data.maffJasInfo === 'object') {
      state.maffJasInfo = JSON.parse(JSON.stringify(data.maffJasInfo));
    }

    if (data.slipCounter !== undefined) state.slipCounter = data.slipCounter;

    // 🌟【JASデモデータ一括クレンジング・マイグレーション (v3.1.3)】
    // クラウド側からロードされたデータに、以前の古いシードデータIDが含まれている場合、
    // それらを完全に除外して、真っ新な本番配列にしてクラウドへ自動保存し直します。
    const demoSealIds = ['seal1', 'seal2', 'seal3', 'seal4'];
    const demoCorrIds = ['corr1'];
    let needsCloudCleansing = false;

    if (state.records.t_jas_seal_record && state.records.t_jas_seal_record.some(r => demoSealIds.includes(r.id))) {
      state.records.t_jas_seal_record = state.records.t_jas_seal_record.filter(r => !demoSealIds.includes(r.id));
      needsCloudCleansing = true;
    }

    if (state.records.t_corrective_action_record && state.records.t_corrective_action_record.some(r => demoCorrIds.includes(r.id))) {
      state.records.t_corrective_action_record = state.records.t_corrective_action_record.filter(r => !demoCorrIds.includes(r.id));
      needsCloudCleansing = true;
    }

    // 🌟【自動記入】文言のクレンジング (過去データ修正)
    if (state.records.t_work_record && state.records.t_work_record.some(r => r && r.content && r.content.includes('【自動記入】'))) {
      state.records.t_work_record = state.records.t_work_record.map(r => {
        if (r && r.content && r.content.includes('【自動記入】')) {
          return { ...r, content: r.content.replace(/【自動記入】/g, '') };
        }
        return r;
      });
      needsCloudCleansing = true;
    }

    // 🌟 伝票1件につきJASシール1枚の自動補正クレンジング (v3.1.6)
    if (state.records.t_jas_seal_record && state.records.t_jas_seal_record.some(r => r && r.id && r.id.startsWith('seal_auto_') && Number(r.qty) !== 1)) {
      state.records.t_jas_seal_record = state.records.t_jas_seal_record.map(r => {
        if (r && r.id && r.id.startsWith('seal_auto_') && Number(r.qty) !== 1) {
          return { ...r, qty: 1 };
        }
        return r;
      });
      needsCloudCleansing = true;
    }

    // 🌟【前期持ち越し・育苗のデータ補完 (v4.2.0)】
    if (state.records.t_work_record) {
      const fieldA = state.masters.m_field && state.masters.m_field.find(f => f.name === 'A畑');
      const fieldHouse = state.masters.m_field && state.masters.m_field.find(f => f.name.includes('育苗') || f.name.includes('ハウス'));

      state.records.t_work_record = state.records.t_work_record.map(r => {
        if (!r || !r.content) return r;
        const c = r.content || '';
        const crop = r.crop || '';
        const isCarryover = c.includes('持ち越し') || c.includes('引継ぎ') || c.includes('前期分R6定植');
        const isNursery = c.includes('育苗') || crop.includes('育苗');

        let updated = false;

        if (isNursery && fieldHouse && String(r.fieldId) !== String(fieldHouse.id)) {
          r.fieldId = fieldHouse.id;
          updated = true;
        } else if (isCarryover && !isNursery && fieldA && String(r.fieldId) !== String(fieldA.id)) {
          r.fieldId = fieldA.id;
          updated = true;
        }

        if (isCarryover || isNursery) {
          let sDate = r.sowingDateOverride || null;
          let pDate = r.plantingDateOverride || null;

          // 画像で入力された「種苗入庫日（purchaseDate）」を播種日の代わりとして拾う（UI入力の補完）
          if (!sDate && r.seeds && r.seeds[0] && r.seeds[0].purchaseDate) {
            let pd = r.seeds[0].purchaseDate;
            if (pd.includes('/')) {
              let [m, d] = pd.split('/');
              pd = `2024-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; // 年が不明な場合は2024とする
            }
            sDate = pd;
          }

          const v = (r.seeds && r.seeds[0] ? r.seeds[0].name : '') + ' ' + crop + ' ' + c;

          if (!sDate && (v.includes('イエロー') || v.includes('ダーク'))) { sDate = '2025-04-21'; pDate = '2025-04-30'; }
          else if (!sDate && (v.includes('カボチャ') || v.includes('ブッチーニ'))) { sDate = '2025-03-31'; pDate = '2025-04-29'; }
          else if (!sDate && (v.includes('コリンキー'))) { sDate = '2025-04-21'; pDate = '2025-04-29'; }
          else if (!sDate && (v.includes('コーラルフェザー') || v.includes('わさびリーフ'))) { sDate = '2025-05-07'; }
          else if (!sDate && (v.includes('味こがね'))) { sDate = '2025-03-05'; pDate = '2025-02-11'; }
          else if (!sDate && (v.includes('スナップ') || v.includes('藤娘') || v.includes('つるあり'))) { sDate = '2024-11-30'; pDate = '2025-04-23'; }
          else if (!pDate && (v.includes('ローズマリー'))) { pDate = '2024-11-23'; }
          else if (!sDate && (v.includes('タイム'))) { sDate = '2024-04-22'; pDate = '2024-06-18'; }
          else if (!pDate && (v.includes('レモングラス'))) { pDate = '2024-06-18'; }
          else if (!sDate && (v.includes('ミント'))) { sDate = '2024-03-01'; pDate = '2024-06-18'; }
          else if (!sDate && (v.includes('レッドファイヤー'))) { sDate = '2025-03-31'; pDate = '2025-05-20'; }
          else if (!sDate && (v.includes('味サラダ'))) { sDate = '2025-04-07'; }
          else if (!sDate && (v.includes('インゲン') || v.includes('バイカル'))) { sDate = '2025-03-30'; }
          else if (!sDate && (v.includes('パセリ') && !v.includes('イタリアン'))) { sDate = '2025-02-10'; pDate = '2025-04-07'; }
          else if (!sDate && (v.includes('イタリアンパセリ'))) { sDate = '2025-02-10'; pDate = '2025-04-04'; }
          else if (!pDate && (v.includes('白ゴーヤ'))) { pDate = '2025-04-23'; }
          else if (!pDate && (v.includes('グリーンレイシ'))) { pDate = '2025-04-23'; }
          else if (!sDate && (v.includes('トマト'))) { sDate = '2025-04-19'; }
          else if (!sDate && (v.includes('ナス'))) { sDate = '2025-04-19'; }
          else if (!sDate && (v.includes('バジル'))) { sDate = '2025-03-31'; }
          
          if (sDate && r.sowingDateOverride !== sDate) { r.sowingDateOverride = sDate; updated = true; }
          if (pDate && r.plantingDateOverride !== pDate) { r.plantingDateOverride = pDate; updated = true; }
        }

        if (updated) {
          needsCloudCleansing = true;
        }
        return r;
      });
    }

    // 🌟【みかん作業日報の自動インポート (v4.2.1)】
    if (state.records.t_work_record && state.masters.m_field) {
      const mikanField = state.masters.m_field.find(f => f.name === 'ミカン畑');
      if (mikanField) {
        const mikanImports = [
          { d: '2024-11-20', c: '収穫', q: 118 }, { d: '2024-11-21', c: '収穫', q: 107 }, { d: '2024-11-22', c: '収穫', q: 139 },
          { d: '2024-11-30', c: '収穫', q: 77 },  { d: '2024-12-02', c: '収穫', q: 91 },  { d: '2024-12-06', c: '収穫', q: 200 },
          { d: '2024-12-09', c: '収穫', q: 80 },  { d: '2024-12-11', c: '収穫', q: 86 },  { d: '2024-12-16', c: '収穫', q: 18 },
          { d: '2024-12-19', c: '除草' },         { d: '2024-12-23', c: '除草' },         { d: '2025-01-06', c: '除草' },
          { d: '2025-09-08', c: '収穫', q: 120 }, { d: '2025-09-09', c: '収穫', q: 40 },  { d: '2025-09-12', c: '収穫', q: 100 },
          { d: '2025-10-28', c: '収穫', q: 60 },  { d: '2025-10-31', c: '収穫', q: 84 },  { d: '2025-11-05', c: '収穫', q: 60 },
          { d: '2025-11-08', c: '収穫', q: 100 }, { d: '2025-11-12', c: '収穫', q: 100 }, { d: '2025-11-15', c: '収穫', q: 60 },
          { d: '2025-11-29', c: '収穫', q: 120 }, { d: '2025-12-02', c: '収穫', q: 140 }, { d: '2025-12-05', c: '収穫', q: 100 },
          { d: '2025-12-06', c: '収穫', q: 160 }, { d: '2025-12-13', c: '収穫', q: 300 }, { d: '2025-12-17', c: '収穫', q: 140 },
          { d: '2025-12-19', c: '収穫', q: 120 }, { d: '2025-12-22', c: '収穫', q: 138 }, { d: '2026-01-20', c: '収穫', q: 25 },
          { d: '2026-01-29', c: '収穫', q: 62 },  { d: '2026-02-09', c: '収穫', q: 180 }, { d: '2026-02-12', c: '収穫', q: 120 },
          { d: '2026-02-13', c: '収穫', q: 144.7 }
        ];

        let addedCount = 0;
        let addedNoteCount = 0;

        mikanImports.forEach((item, index) => {
          // 作業記録のインポート
          const expectedId = `auto_mikan_${item.d.replace(/-/g, '')}_${index}`;
          const exists = state.records.t_work_record.some(r => r.id === expectedId);
          if (!exists) {
            state.records.t_work_record.push({
              id: expectedId,
              date: item.d,
              fieldId: mikanField.id,
              cropId: '',
              cropName: 'みかん',
              content: item.c,
              note: item.q ? `収穫量: ${item.q}kg` : '',
              workerName: '管理者',
              createdAt: new Date().toISOString(),
              seeds: [],
              materials: [],
              equipmentIds: []
            });
            addedCount++;
          }

          // 納品書のインポート（収穫量が記録されている場合のみ）
          if (item.q && state.records.t_delivery_note) {
            const expectedNoteId = `auto_mikan_note_${item.d.replace(/-/g, '')}_${index}`;
            const noteExists = state.records.t_delivery_note.some(n => n.id === expectedNoteId);
            
            if (!noteExists) {
              const pName = '福山黒酢株式会社　工場';
              let partner = state.masters.m_partner?.find(p => p.name === pName);
              if (!partner) {
                partner = { id: `partner_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, name: pName, type: '納品先' };
                if (state.masters.m_partner) state.masters.m_partner.push(partner);
              }
              
              const unitPrice = 400;
              const subtotal = item.q * unitPrice;
              const taxRate = state.farmInfo?.taxRate || 8;
              const tax = Math.floor(subtotal * taxRate / 100);

              state.records.t_delivery_note.push({
                id: expectedNoteId,
                date: item.d,
                partnerId: partner.id,
                partnerName: partner.name,
                items: `みかん (${item.q}kg @￥${unitPrice})`,
                itemDetails: [{
                  name: 'みかん',
                  fullName: 'みかん',
                  quantity: item.q,
                  unit: 'kg',
                  unitPrice: unitPrice,
                  isOrganic: false
                }],
                subtotal: subtotal,
                taxRate: taxRate,
                tax: tax,
                amount: subtotal + tax,
                slipNo: `DN-${state.slipCounter++}`,
                createdAt: new Date().toISOString()
              });
              addedNoteCount++;
            }
          }
        });

        if (addedCount > 0 || addedNoteCount > 0) {
          console.log(`[JASAGRI] みかん作業日報 ${addedCount} 件、納品書 ${addedNoteCount} 件を自動インポートしました。`);
          needsCloudCleansing = true;
        }
      }
    }

    // 既に生成済みのDN-AUTO-伝票番号を標準のDN-XXXX形式に上書き修正
    if (state.records.t_delivery_note) {
      state.records.t_delivery_note.forEach(n => {
        if (n.slipNo && n.slipNo.startsWith('DN-AUTO-')) {
          n.slipNo = `DN-${state.slipCounter++}`;
          needsCloudCleansing = true;
        }
      });
    }

    // 🌟【自動マイグレーション・台帳→マスタへの有効期限・画像一括引き継ぎ補完】
    if (!hasAutoHealed && isResolved && state.masters.m_material && state.records.t_material_receipt) {
      const receipts = state.records.t_material_receipt.filter(r => r.docType === '資材・適合証明書');
      let anyUpdated = false;

      state.masters.m_material.forEach(m => {
        // 同じマスタ資材名またはIDに紐付く台帳側の適合証明書を検索（受取日が最新のものを優先）
        const matches = receipts.filter(r => r.materialId === m.id || r.materialName === m.name);
        if (matches.length > 0) {
          // 日付の降順（最新の証明書）でソート
          matches.sort((a, b) => new Date(b.date) - new Date(a.date));
          const latestReceipt = matches[0];
          
          let updated = false;
          const targetExpiry = latestReceipt.expiryDate || '';
          const targetUrl = latestReceipt.certUrl || latestReceipt.photoUrl || null;

          if (m.expiry !== targetExpiry) {
            m.expiry = targetExpiry;
            m.expiryDate = targetExpiry;
            updated = true;
          }
          if (targetUrl && m.certUrl !== targetUrl) {
            m.certUrl = targetUrl;
            m.jasCertUrl = targetUrl;
            updated = true;
          }

          if (updated) {
            anyUpdated = true;
          }
        }
      });

      if (anyUpdated) {
        needsCloudCleansing = true;
      }
      hasAutoHealed = true; // 🌟 完全に添付ファイル解像済みの最初のデータ受信をもって、自動修復を1回だけ試行して完了とします（ループ完全防止！）
    }

    // 資材受入からの作業記録自動マイグレーションは廃止（手動連携に移行）

    // 🌟【農園名称とユーザー表示名の不整合を自動修正（初回完全ロード時1回のみ）】
    // farmInfo.name（農園名称）が設定済みで、user.name（ユーザー表示名）と異なる場合、
    // farmInfo.name を正として user.name を自動修正し、Firestoreに永続保存する。
    // これにより「角田アグリ」等の古い汚染データがFire store側で恒久的に上書きされる。
    if (!hasNameHealed && isResolved) {
      hasNameHealed = true;
      if (state.farmInfo.name && state.user.name !== state.farmInfo.name) {
        console.log('[JASAGRI] 農園名称とユーザー表示名の不整合を自動修正: "' + state.user.name + '" → "' + state.farmInfo.name + '"');
        state.user.name = state.farmInfo.name;
        needsCloudCleansing = true;
      }
    }

    if (needsCloudCleansing) {
      console.log('JASAGRI: クラウド上の同期データ不一致を自動検知。全自動クレンジング・リビルドを実行します...');
      setTimeout(() => {
        this.syncToCloud();
      }, 800);
    }
  },

  /**
   * マスタに新しいアイテムを追加する
   */
  addMasterItem(targetMaster, item) {
    if (!state.masters[targetMaster]) return;
    const newItem = {
      id: `${targetMaster.split('_')[1]}${Date.now()}`,
      ...item
    };
    state.masters[targetMaster].push(newItem);
    this.syncToCloud();
    return newItem;
  },

  deleteMasterItem(targetMaster, id) {
    if (!state.masters[targetMaster]) return;
    state.masters[targetMaster] = state.masters[targetMaster].filter(i => i.id !== id);
    this.syncToCloud();
  },

  addWorkRecord(record) {
    const newRecord = { id: `WR${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, date: new Date().toISOString().split('T')[0], ...record };
    state.records.t_work_record.push(newRecord);
    this.syncToCloud();
    return newRecord;
  },

  updateWorkRecord(record) {
    const index = state.records.t_work_record.findIndex(r => r.id === record.id);
    if (index !== -1) {
      state.records.t_work_record[index] = { ...record };
      this.syncToCloud();
    }
  },

  deleteWorkRecord(id) {
    state.records.t_work_record = state.records.t_work_record.filter(r => r.id !== id);
    this.syncToCloud();
  },

  autoCreateWorkRecordFromReceipt(receipt) {
    if (!receipt || !receipt.materialName) return;
    if (!state.records.t_work_record) state.records.t_work_record = [];

    // 重複作成を防止するため、すでに存在する場合はスキップ
    const exists = state.records.t_work_record.some(r => r.id === `WR_auto_${receipt.id}`);
    if (exists) return;

    const isSeed = receipt.category === '種苗' || receipt.category === '苗・種子';
    const finalContent = isSeed 
      ? `種苗の購入・受入: ${receipt.materialName}` 
      : `資材の購入・受入: ${receipt.materialName}`;

    const newRecord = {
      id: `WR_auto_${receipt.id}`,
      date: receipt.date || new Date().toISOString().split('T')[0],
      fieldId: null, // 特定の圃場に紐づかない
      cropId: null,
      content: finalContent,
      workerName: receipt.workerName || state.user.name || '',
      seeds: isSeed ? [{
        name: receipt.materialName,
        quantity: receipt.quantity || '1',
        taskType: '購入・受入',
        source: receipt.supplier || receipt.partnerName || '未指定',
        purchaseDate: receipt.date || new Date().toISOString().split('T')[0],
        category: '種苗'
      }] : [],
      materials: !isSeed ? [{
        name: receipt.materialName,
        quantity: receipt.quantity || '1',
        category: receipt.category || '資材',
        source: receipt.supplier || receipt.partnerName || '未指定',
        purchaseDate: receipt.date || new Date().toISOString().split('T')[0]
      }] : [],
      equipmentIds: [],
      isWashed: false,
      washMethod: ''
    };

    state.records.t_work_record.push(newRecord);
  },

  bulkMigrateReceiptsToWorkRecords() {
    if (!state.records.t_material_receipt) return 0;
    let migratedCount = 0;
    
    // 証明書以外の、通常の納品書や資材受入を対象とする
    const targetReceipts = state.records.t_material_receipt.filter(r => r.docType !== '資材・適合証明書');

    targetReceipts.forEach(receipt => {
      const exists = (state.records.t_work_record || []).some(w => w.id === `WR_auto_${receipt.id}`);
      if (!exists) {
        this.autoCreateWorkRecordFromReceipt(receipt);
        migratedCount++;
      }
    });

    if (migratedCount > 0) {
      console.log(`JASAGRI: 過去の資材受入レコード ${migratedCount} 件から作業記録を自動作成しました。`);
    }
    return migratedCount;
  },

  migrateMaterialReceiptDocTypes() {
    const STANDARD_DOC = ['資材適合書', '種苗納品書', '肥料・農薬納品書', 'その他'];
    const CATEGORY_MAP = {
      '苗・種子': '種苗',
      '肥料': '肥料・農薬',
      '農薬': '肥料・農薬',
      '機材': '資材',
      '飼料': 'その他',
    };
    let changed = 0;
    (state.records.t_material_receipt || []).forEach(r => {
      if (r.docType && !STANDARD_DOC.includes(r.docType)) {
        r.docType = 'その他';
        changed++;
      }
      if (r.category && CATEGORY_MAP[r.category]) {
        r.category = CATEGORY_MAP[r.category];
        changed++;
      }
    });
    if (changed > 0) this.syncToCloud();
    return changed;
  },

  addMaterialReceipt(record) {
    const STANDARD_DOC = ['資材適合書', '種苗納品書', '肥料・農薬納品書', 'その他'];
    const STANDARD_CAT = ['種苗', '肥料・農薬', '資材', 'その他'];
    const LEGACY_CAT = { '苗・種子': '種苗', '肥料': '肥料・農薬', '農薬': '肥料・農薬', '機材': '資材', '飼料': 'その他' };
    const normalized = { ...record };
    if (!STANDARD_DOC.includes(normalized.docType)) normalized.docType = 'その他';
    if (normalized.category && LEGACY_CAT[normalized.category]) normalized.category = LEGACY_CAT[normalized.category];
    else if (normalized.category && !STANDARD_CAT.includes(normalized.category)) normalized.category = '資材';
    const newRecord = { id: `MR${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, ...normalized };
    state.records.t_material_receipt.push(newRecord);
    this.syncToCloud();
    return newRecord;
  },

  /**
   * 資材受け入れ（購入・納品書）の個別・グループ削除
   */
  deleteMaterialReceipt(id) {
    if (!state.records.t_material_receipt) return;
    state.records.t_material_receipt = state.records.t_material_receipt.filter(r => r.id !== id);
    if (state.records.t_work_record) {
      state.records.t_work_record = state.records.t_work_record.filter(r => r.id !== `WR_auto_${id}`);
    }
    this.syncToCloud();
  },

  addHarvest(record) {
    const newRecord = { id: `H${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, ...record };
    state.records.t_harvest.push(newRecord);
    this.syncToCloud();
    return newRecord;
  },

  addDeliveryNote(record) {
    const slipNo = record.slipNo || `DN-${state.slipCounter++}`;
    const newRecord = { ...record, id: `DN${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, slipNo };
    state.records.t_delivery_note.push(newRecord);

    // 🌟【JAS自動引き当て適合フック】有機品目の出荷伝票が切られた場合、自動でJASシール受払台帳から「1枚」引き当てる！
    const organicCount = (record.itemDetails || []).filter(i => i.isOrganic).length;
    if (organicCount > 0) {
      if (!state.records.t_jas_seal_record) state.records.t_jas_seal_record = [];
      state.records.t_jas_seal_record.push({
        id: `seal_auto_${newRecord.id}`,
        date: newRecord.date || new Date().toISOString().split('T')[0],
        type: 'use',
        qty: 1,
        voucherNo: slipNo,
        remarks: `${record.partnerName || '取引先'}への納品に伴うJASマーク貼付`
      });
    }

    this.syncToCloud();

    // ── Ri-Ry-Link 同期（黒酢の郷 桷志田 宛ての場合のみ）
    addToRiryLink(newRecord).then(riryLinkId => {
      if (riryLinkId) {
        const idx = state.records.t_delivery_note.findIndex(n => n.id === newRecord.id);
        if (idx !== -1) {
          state.records.t_delivery_note[idx] = {
            ...state.records.t_delivery_note[idx],
            riryLinkId,
          };
          this.syncToCloud();
        }
      }
    });

    return newRecord;
  },

  updateDeliveryNote(updated) {
    const idx = state.records.t_delivery_note.findIndex(n => n.id === updated.id);
    if (idx === -1) return;
    // JASシール受払記録の有機品目数を再計算
    const oldOrganicCount = (state.records.t_delivery_note[idx].itemDetails || []).filter(i => i.isOrganic).length;
    const newOrganicCount = (updated.itemDetails || []).filter(i => i.isOrganic).length;
    const diff = newOrganicCount - oldOrganicCount;
    state.records.t_delivery_note[idx] = { ...state.records.t_delivery_note[idx], ...updated };
    if (state.records.t_jas_seal_record) {
      const sealIdx = state.records.t_jas_seal_record.findIndex(s => s.id === `seal_auto_${updated.id}`);
      if (sealIdx !== -1) {
        if (newOrganicCount === 0) {
          state.records.t_jas_seal_record.splice(sealIdx, 1);
        } else {
          state.records.t_jas_seal_record[sealIdx].qty = 1;
        }
      } else if (newOrganicCount > 0) {
        state.records.t_jas_seal_record.push({
          id: `seal_auto_${updated.id}`,
          date: updated.date || new Date().toISOString().split('T')[0],
          type: 'use',
          qty: 1,
          voucherNo: updated.slipNo || `DN-${state.slipCounter}`,
          remarks: `${updated.partnerName || '取引先'}への納品に伴うJASマーク貼付`
        });
      }
    }
    this.syncToCloud();

    // ── Ri-Ry-Link 同期（更新）
    updateInRiryLink(state.records.t_delivery_note[idx]);
  },

  /**
   * 伝票番号未設定の t_delivery_note に日付昇順で自動採番する
   * 既に slipNo がついているレコードは一切変更しない
   */
  bulkAssignSlipNumbers() {
    const notes = state.records.t_delivery_note || [];
    const unassigned = notes
      .filter(n => !n.slipNo)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    if (unassigned.length === 0) {
      this.showToast('採番済みの伝票しか見つかりませんでした', 'info');
      return 0;
    }

    unassigned.forEach(note => {
      const idx = state.records.t_delivery_note.findIndex(n => n.id === note.id);
      if (idx !== -1) {
        state.records.t_delivery_note[idx] = {
          ...state.records.t_delivery_note[idx],
          slipNo: `DN-${state.slipCounter++}`
        };
      }
    });

    this.syncToCloud();
    this.showToast(`${unassigned.length} 件の伝票に伝票番号を採番しました`, 'success');
    return unassigned.length;
  },

  deleteDeliveryNote(id) {
    // ── Ri-Ry-Link 同期（削除）：先に riryLinkId を取得してから配列から除外
    const targetNote = state.records.t_delivery_note.find(n => n.id === id);
    if (targetNote?.riryLinkId) {
      deleteFromRiryLink(targetNote.riryLinkId);
    }

    state.records.t_delivery_note = state.records.t_delivery_note.filter(n => n.id !== id);

    // 🌟【JAS自動引き当て適合フック】伝票が削除されたら、連動していたJASシール受払記録も自動削除・復元！
    if (state.records.t_jas_seal_record) {
      state.records.t_jas_seal_record = state.records.t_jas_seal_record.filter(s => s.id !== `seal_auto_${id}`);
    }

    this.syncToCloud();
  },

  /**
   * マニュアルドキュメントを追加・アップロードする
   */
  uploadDocument(categoryId, docData) {
    const category = state.documents.find(cat => cat.id === categoryId);
    if (!category) return;
    
    const newDoc = {
      id: `doc${Date.now()}`,
      name: docData.name,
      version: 'v1.0.0',
      date: new Date().toISOString().split('T')[0],
      size: docData.size || '0.1 MB',
      status: 'draft',
      approvedBy: '未承認',
      summary: docData.summary || '新しく追加された文書。',
      text: docData.text || '【新規文書】\n\nここに本文を入力、または編集してください。',
      auditPoints: docData.auditPoints || '監査用のチェック項目は未設定です。',
      history: [
        { version: 'v1.0.0', date: new Date().toISOString().split('T')[0], author: state.user.name || '担当者', comment: '新規アップロード。' }
      ]
    };
    
    category.items.push(newDoc);
    this.syncToCloud();
    return newDoc;
  },

  /**
   * マニュアルドキュメントのテキストを更新する (後方互換用)
   */
  updateDocumentContent(categoryId, docId, newText) {
    this.updateDocument(categoryId, docId, { text: newText });
  },

  /**
   * マニュアルドキュメントのメタデータを含む各フィールドを安全に一括更新する
   */
  updateEvidence(key, dataUrl) {
    if (!state.evidenceVault) state.evidenceVault = {};
    state.evidenceVault[key] = dataUrl;
    this.syncToCloud();
  },

  updateDocument(categoryId, docId, fields) {
    const category = state.documents.find(cat => cat.id === categoryId);
    if (!category) return;
    const doc = category.items.find(item => item.id === docId);
    if (!doc) return;

    Object.keys(fields).forEach(key => {
      doc[key] = fields[key];
    });
    doc.date = new Date().toISOString().split('T')[0];
    this.syncToCloud();
  },

  /**
   * 改訂履歴（タイムライン項目）を直接編集・修正する
   */
  updateDocumentHistory(categoryId, docId, historyIndex, historyFields) {
    const category = state.documents.find(cat => cat.id === categoryId);
    if (!category) return;
    const doc = category.items.find(item => item.id === docId);
    if (!doc || !doc.history || !doc.history[historyIndex]) return;

    Object.assign(doc.history[historyIndex], historyFields);
    this.syncToCloud();
  },

  /**
   * すべてのドキュメントの原本改定日・見直し日を一括更新する
   */
  updateAllDocumentsDates(originalRevisionDate, reviewDate) {
    state.documents.forEach(cat => {
      cat.items.forEach(item => {
        item.originalRevisionDate = originalRevisionDate;
        item.reviewDate = reviewDate;
      });
    });
    this.syncToCloud();
  },

  /**
   * ドキュメントの承認ステータスを更新する
   */
  updateDocumentStatus(categoryId, docId, status, approvedBy) {
    const category = state.documents.find(cat => cat.id === categoryId);
    if (!category) return;
    const doc = category.items.find(item => item.id === docId);
    if (!doc) return;

    doc.status = status;
    doc.approvedBy = approvedBy || (status === 'approved' ? state.user.name : '未承認');
    doc.date = new Date().toISOString().split('T')[0];
    this.syncToCloud();
  },

  /**
   * ドキュメントの改訂履歴を追加し、バージョンを上げる
   */
  addDocumentRevision(categoryId, docId, revisionData) {
    const category = state.documents.find(cat => cat.id === categoryId);
    if (!category) return;
    const doc = category.items.find(item => item.id === docId);
    if (!doc) return;

    // バージョンを更新し履歴を追加
    doc.version = revisionData.version;
    doc.date = new Date().toISOString().split('T')[0];
    doc.history.unshift({
      version: revisionData.version,
      date: new Date().toISOString().split('T')[0],
      author: revisionData.author || state.user.name,
      comment: revisionData.comment
    });

    if (revisionData.text) {
      doc.text = revisionData.text;
    }

    this.syncToCloud();
  },

  /**
   * マニュアル規定を福山黒酢（AGRI KAKUIDA）のJAS実地監査仕様マニュアルにリセット・強制同期する
   */
  resetDocumentsToDefault() {
    try {
      state.documents = JSON.parse(JSON.stringify(emptyState.documents));
      this.syncToCloud();
      this.showToast('マニュアルを有機JAS標準仕様にリセットしました！', 'success');
      return true;
    } catch (error) {
      console.error('Manual reset failed:', error);
      this.showToast('マニュアルのリセットに失敗しました。', 'error');
      return false;
    }
  },

  async syncToCloud() {
    // 🛡️ 初期ロード中（Firestoreからのデータ受信前）は絶対に保存しない
    // → 不完全なメモリ状態でクラウドを上書きしてデータを消失させないための安全弁
    if (state.isInitialLoading) {
      if (import.meta.env.DEV) console.warn('syncToCloud: isInitialLoading=true のためスキップしました（データ保護）');
      return;
    }
    try {
      // weatherとregionalAlertsはAPIで取得するため、クラウドに保存しない
      const { weather, regionalAlerts, toast, isCloudConnected, isInitialLoading, activeTab, ...dataToSync } = JSON.parse(JSON.stringify(state));
      await firestoreService.save(dataToSync);
      state.isCloudConnected = true;
      // サイレント保存（操作のたびにトーストが出ると煩わしいため通知なし）
    } catch (error) {
      console.error('Cloud sync failed:', error);
      this.showToast('クラウド保存に失敗しました。接続を確認してください。', 'error');
    }
  },

  updateUser(userData) {
    Object.assign(state.user, userData);
    this.syncToCloud();
  },

  updateFarmInfo(info) {
    Object.assign(state.farmInfo, info);
    // 🌟 農園名称が変更された場合、ユーザー表示名も同期して古いデータを上書き
    // （「管理者：〇〇」表示は農園名称に統一する）
    if (info.name !== undefined) {
      state.user.name = info.name;
    }
    this.syncToCloud();
  },

  setViewMode(mode) {
    state.viewMode = mode;
    // viewModeはUI表示設定のためクラウド保存不要
  },

  refreshMarketData() {
    // 天気と防除アラートを再取得
    fetchWeather()
      .then(weather => { Object.assign(state.weather, weather); })
      .catch(err => { if (import.meta.env.DEV) console.warn('天気再取得失敗:', err); });
    fetchPestAlerts()
      .then(alerts => { state.regionalAlerts = alerts; })
      .catch(err => { if (import.meta.env.DEV) console.warn('防除アラート再取得失敗:', err); });
  },

  /**
   * 農林水産省有機JAS公式ページと同期し、クラウド（Firestore）から最新の告示PDF・法改正ニュースをリアルタイム配信・マージする（本物仕様）
   */
  async syncMaffJasInfo() {
    this.showToast('農林水産省公式HPから最新のJAS告示情報を取得中...', 'info');
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. MAFFサイトから直接スクレイピング（CORSプロキシ経由）
      const announcements = await fetchMaffAnnouncements();
      state.maffJasInfo.announcements = announcements;
      state.maffJasInfo.lastSynced = todayStr;

      // 2. 取得結果をFirestoreにキャッシュとして保存（他端末でも即座に反映）
      try {
        const { db } = await import('../firebase');
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'global_settings', 'maff_jas_info'), {
          announcements,
          links: state.maffJasInfo.links,
          updatedAt: todayStr,
        });
      } catch (err) {
        console.warn('Maff Firestore cache failed:', err);
      }

      this.syncToCloud();

      const isLive = announcements[0]?.id?.startsWith('maff_fallback') === false;
      this.showToast(
        isLive
          ? `農林水産省から${announcements.length}件の最新JAS告示情報を取得しました`
          : '農林水産省HPへの接続に失敗しました。キャッシュデータを表示しています',
        isLive ? 'success' : 'warning'
      );
    } catch (err) {
      console.error('syncMaffJasInfo failed:', err);
      this.showToast('JAS告示情報の取得中にエラーが発生しました', 'error');
    }
  },

  /**
   * 有機JAS防除データベースを初期化する
   */
  async importProfessionalPestDB() {
    const confirmed = window.confirm(
      '有機JAS防除データベースを初期化します。\n\n既存の病害虫・防除マスタ・マッピングデータはすべて上書きされます。\nこの操作は元に戻せません。よろしいですか？'
    );
    if (!confirmed) return;
    try {
      // マスタデータをシードデータで上書き
      Object.keys(JAS_SEED_DATA).forEach(key => {
        state.masters[key] = JAS_SEED_DATA[key];
      });
      
      // クラウドに保存
      await this.syncToCloud();
      this.showToast('防除データベースを初期化しました', 'success');
    } catch (error) {
      console.error('DB初期化失敗:', error);
      this.showToast('データベースの初期化に失敗しました', 'error');
    }
  },

  /**
   * 納品書をバックグラウンドAI解析ストックキューに追加する（非同期）
   */
  addReceiptToQueue(queueItem) {
    if (!state.records.t_receipt_queue) state.records.t_receipt_queue = [];
    
    // 1. まず「解析中」のステータスでストックに追加してクラウド保存（UIは即解放され、次の撮影が可能）
    const item = {
      id: `q_${Date.now()}`,
      status: 'processing',
      photoUrl: queueItem.photoUrl,
      supplier: '解析中...',
      date: new Date().toISOString().split('T')[0],
      items: [],
      createdAt: new Date().toISOString()
    };
    
    state.records.t_receipt_queue.push(item);
    this.syncToCloud();
    this.showToast('納品書をストックに送信しました。バックグラウンドで解析中...', 'success');

    // 2. 完全非同期でGemini 2.5 Flash APIをバックグラウンドで叩く（呼び出し元は待たせない）
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('入力してください')) {
      // APIキーがない場合の疑似スキャン
      setTimeout(() => {
        const foundItem = state.records.t_receipt_queue.find(q => q.id === item.id);
        if (foundItem) {
          foundItem.status = 'ready';
          foundItem.supplier = '';
          foundItem.items = [];
          // デモモードではクラウドへの同期を行わない（ダミーデータをDBに保存しない）
          this.showToast('【デモ】APIキー未設定のため実際のOCR解析は行われませんでした', 'info');
        }
      }, 3000);
      return;
    }

    // 非同期でAPI呼び出しを実行
    (async () => {
      // base64データが存在しない場合は早期終了
      if (!queueItem.base64) {
        const foundItem = state.records.t_receipt_queue.find(q => q.id === item.id);
        if (foundItem) foundItem.status = 'error';
        this.showToast('画像データが不正です。再撮影してください', 'error');
        return;
      }
      try {
        const prompt = `
          有機JASの納品書・領収書画像です。
          画像から「仕入先名（店名・会社名・メーカー名など）」、「日付（YYYY-MM-DD）」、および「記載されている【全ての購入品目・商品名】（品名、数量（単位含む）、カテゴリ：肥料・農薬|種苗|機材のいずれか）」を抽出し、以下のJSONフォーマットのみで厳密に返してください。
          余計なマークダウンや説明は一切含めないでください。
          
          {
            "supplier": "仕入先名",
            "date": "YYYY-MM-DD",
            "items": [
              { "materialName": "商品名", "quantity": "数量（単位含む）", "category": "肥料・農薬|種苗|機材" }
            ]
          }
        `;

        const model = 'gemini-2.5-flash';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: queueItem.mimeType || 'image/jpeg', data: queueItem.base64 } }
              ]
            }]
          })
        });

        if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
        const data = await response.json();
        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          const foundItem = state.records.t_receipt_queue.find(q => q.id === item.id);
          if (foundItem) {
            foundItem.status = 'ready';
            foundItem.supplier = parsed.supplier || '不明な仕入先';
            foundItem.date = parsed.date || new Date().toISOString().split('T')[0];
            foundItem.items = parsed.items || [];
            this.syncToCloud();
            this.showToast(`OCR解析完了：${foundItem.supplier}からの納品書 (${foundItem.items.length}商品) をストックしました！`, 'success');
          }
        } else {
          throw new Error('No JSON match in AI response');
        }
      } catch (error) {
        console.error('Background OCR Error:', error);
        const foundItem = state.records.t_receipt_queue.find(q => q.id === item.id);
        if (foundItem) {
          foundItem.status = 'error';
          foundItem.supplier = '解析エラー';
          this.syncToCloud();
          this.showToast('納品書の自動解析に一部失敗しました。手動で入力できます。', 'warning');
        }
      }
    })();
  },

  /**
   * 納品書ストックキューからアイテムを削除する
   */
  deleteReceiptFromQueue(queueId) {
    if (!state.records.t_receipt_queue) return;
    state.records.t_receipt_queue = state.records.t_receipt_queue.filter(q => q.id !== queueId);
    this.syncToCloud();
  },

  /**
   * 資材・種苗棚卸の一括保存
   */
  saveSeedInventories(inventories) {
    if (!state.records.t_seed_inventory) {
      state.records.t_seed_inventory = [];
    }
    
    // 💡 削除（除外）対応：スマホから送られてきたリストに存在しない過去データを物理削除する
    const incomingNames = new Set(inventories.map(inv => String(inv.materialName)));
    const incomingIds = new Set(inventories.map(inv => String(inv.id)).filter(Boolean));
    state.records.t_seed_inventory = state.records.t_seed_inventory.filter(item =>
      incomingNames.has(String(item.materialName)) || incomingIds.has(String(item.id))
    );
    
    inventories.forEach(inv => {
      const idx = state.records.t_seed_inventory.findIndex(item => 
        String(item.materialName) === String(inv.materialName)
      );
      
      const record = {
        id: inv.id || `inv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        materialName: inv.materialName,
        category: inv.category || '種苗',
        purchaseDate: inv.purchaseDate || '',
        supplier: inv.supplier || '',
        quantityBought: inv.quantityBought || '',
        stockQuantity: inv.stockQuantity, // 手入力された在庫数
        updatedAt: new Date().toISOString().split('T')[0]
      };
      
      if (idx !== -1) {
        state.records.t_seed_inventory[idx] = record;
      } else {
        state.records.t_seed_inventory.push(record);
      }
    });
    
    this.syncToCloud();
    this.showToast('資材・種苗棚卸（繰越在庫）を保存しました！', 'success');
  },

  /**
   * v4.0.0 受信トレイのスキャンドキュメントを実データに振り分ける（承認）
   */
  processInboxDocument(docId, targetType, data) {
    if (!state.records.t_inbox_documents) return;
    
    if (targetType === 'receipt') {
      // 1. 仕入先（パートナー）の自動照合・おもてなし自動作成
      const supplierName = (data.supplier || data.partnerName || '不明').trim();
      let partnerIdVal = '';
      const matchedPartner = state.masters.m_partner.find(p => 
        p.name === supplierName || p.name.includes(supplierName) || supplierName.includes(p.name)
      );
      if (matchedPartner) {
        partnerIdVal = matchedPartner.id;
      } else if (supplierName && supplierName !== '不明') {
        // 新規仕入先としてマスターに自動追加
        const newPartner = this.addMasterItem('m_partner', {
          name: supplierName,
          partnerType: '仕入先',
          category: '仕入先'
        });
        partnerIdVal = newPartner?.id || '';
      }

      // 2. 資材（品名）の自動照合とおもてなし自動作成（複数項目対応）
      const itemsToProcess = data.items && data.items.length > 0 
        ? data.items 
        : [{ materialName: data.materialName, category: data.category, quantity: data.quantity }];

      itemsToProcess.forEach(item => {
        const matName = (item.materialName || '未入力資材').trim();
        let matIdVal = '';
        const matchedMaterial = state.masters.m_material.find(m => 
          m.name === matName || m.name.includes(matName) || matName.includes(m.name)
        );
        if (matchedMaterial) {
          matIdVal = matchedMaterial.id;
        } else if (matName && matName !== '未入力資材') {
          // 新規資材としてマスターに自動追加
          const newMat = this.addMasterItem('m_material', {
            name: matName,
            category: item.category || '資材',
            unit: '袋'
          });
          matIdVal = newMat?.id || '';
        }

        // 納品受入レコードとして登録 (1行ごとにレコードを作成)
        const newReceipt = {
          id: `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          docType: '納品書', // 👈 docTypeを付与してフィルタリングを正常化
          date: data.date || new Date().toISOString().split('T')[0],
          materialId: matIdVal, // 👈 各システムとの完全な紐付けリンク！
          materialName: matName,
          category: item.category || '資材',
          partnerId: partnerIdVal, // 👈 各システムとの完全な紐付けリンク！
          partnerName: supplierName,
          supplier: supplierName,
          quantity: item.quantity || '1',
          certUrl: data.fileUrl,
          photoUrl: data.fileUrl,
          hasCert: false, // 適合証明書は別途マスタに紐付けるため初期値はfalse
          notes: 'スキャナー受信トレイから取り込み'
        };
        if (!state.records.t_material_receipt) state.records.t_material_receipt = [];
        state.records.t_material_receipt.push(newReceipt);
      });
    } 
    else if (targetType === 'master_cert') {
      // 適合証明書は通常単一項目として処理するが、複数ある場合は1つ目を優先するか、全て回す
      const itemsToProcess = data.items && data.items.length > 0 
        ? data.items 
        : [{ materialName: data.materialName, category: data.category }];

      itemsToProcess.forEach(item => {
        if (!item.materialName) return;
        
        const material = state.masters.m_material.find(m => m.name === item.materialName);
        if (material) {
          material.jasCertUrl = data.fileUrl;
          material.certUrl = data.fileUrl;
          material.expiry = data.expiryDate || '';
        } else {
          // 新規マスタとして追加
          this.addMasterItem('m_material', {
            name: item.materialName,
            category: item.category || '資材',
            jasCertUrl: data.fileUrl,
            certUrl: data.fileUrl,
            expiry: data.expiryDate || '',
            status: '確認中',
            jasCertVerified: false
          });
        }

        // 🌟 証明書自体も履歴（台帳の「資材・適合証明書」カテゴリー）に物理レコードとして保存する
        let partnerIdVal = '';
        if (data.partnerName) {
          const pObj = state.masters.m_partner.find(p => p.name === data.partnerName);
          if (pObj) {
            partnerIdVal = pObj.id;
          } else {
            // 取引先がマスタに存在しない場合は自動登録
            const newP = this.addMasterItem('m_partner', { name: data.partnerName, partnerType: '仕入先' });
            partnerIdVal = newP?.id || '';
          }
        }

        const newReceipt = {
          id: `MR${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          date: data.date || new Date().toISOString().split('T')[0],
          expiryDate: data.expiryDate || '',
          docType: '資材・適合証明書', // 👈 これにより「資材購入・証憑台帳」の「資材・適合証明書」フィルターに合致して表示されます！
          materialName: item.materialName,
          category: item.category || '資材',
          partnerId: partnerIdVal,
          partnerName: data.partnerName || '未指定の仕入先',
          supplier: data.partnerName || '未指定の仕入先',
          quantity: '1',
          certUrl: data.fileUrl,
          photoUrl: data.fileUrl,
          hasCert: true,
          notes: 'スキャナー受信トレイから適合証明書として取り込み、マスタへ自動同期'
        };
        if (!state.records.t_material_receipt) state.records.t_material_receipt = [];
        state.records.t_material_receipt.push(newReceipt);
      });
    }
    else if (targetType === 'custom') {
      const docTypeName = (data.customDocTypeName || 'その他').trim();
      const supplierName = (data.supplier || data.partnerName || '').trim();
      let partnerIdVal = '';
      if (supplierName) {
        const matchedPartner = (state.masters.m_partner || []).find(p =>
          p.name === supplierName || p.name.includes(supplierName) || supplierName.includes(p.name)
        );
        partnerIdVal = matchedPartner ? matchedPartner.id : '';
      }
      const newReceipt = {
        id: `EV${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        docType: docTypeName,
        date: data.date || new Date().toISOString().split('T')[0],
        expiryDate: data.expiryDate || '',
        materialName: (data.items && data.items.length > 0 && data.items[0].materialName)
          ? data.items[0].materialName : docTypeName,
        category: 'その他',
        partnerName: supplierName || '未指定',
        supplier: supplierName || '未指定',
        quantity: '1',
        certUrl: data.fileUrl,
        photoUrl: data.fileUrl,
        hasCert: false,
        notes: `スキャナー受信トレイから「${docTypeName}」として取り込み`
      };
      if (!state.records.t_material_receipt) state.records.t_material_receipt = [];
      state.records.t_material_receipt.push(newReceipt);
    }

    // Inboxから削除（内部でsyncToCloudを自動実行するため、ここでクラウド保存されます）
    this.deleteInboxDocument(docId);
    const typeLabel = targetType === 'receipt' ? '納品記録' : targetType === 'master_cert' ? 'マスタ証明書' : (data.customDocTypeName || 'その他書類');
    this.showToast(`書類を「${typeLabel}」として振り分けました！`);
  },

  /**
   * v5.6.0 既存 m_material のカテゴリを一括自動補正
   * 「資材」または「その他」のレコードのみキーワード再判定して更新する
   * @returns {{ updated: number, total: number }}
   */
  bulkFixMaterialCategories() {
    const materials = state.masters.m_material || [];
    let updated = 0;

    for (const mat of materials) {
      const fixed = fixCategory(mat);
      if (fixed !== mat.category) {
        mat.category = fixed;
        updated++;
      }
    }

    if (updated > 0) {
      this.syncToCloud();
      this.showToast(`${updated}件を補正しました。「種子・苗」タブに移動して確認してください`, 'success');
    } else {
      this.showToast('補正対象のレコードはありませんでした', 'info');
    }
    return { updated, total: materials.length };
  },

  /**
   * v5.6.1 既存 t_material_receipt のカテゴリを一括自動補正
   * 「資材」「その他」「種苗」または空のレコードを品名キーワードで再判定する
   * @returns {{ updated: number, total: number }}
   */
  bulkFixReceiptCategories() {
    const receipts = state.records.t_material_receipt || [];
    const STANDARD_CAT = ['種苗', '肥料・農薬', '資材', 'その他'];
    const LEGACY_MAP = { '苗・種子': '種苗', '肥料': '肥料・農薬', '農薬': '肥料・農薬', '機材': '資材', '飼料': 'その他' };
    let updated = 0;

    for (const rec of receipts) {
      const current = rec.category || '資材';
      // 旧カテゴリ名を新名に変換
      if (LEGACY_MAP[current]) {
        rec.category = LEGACY_MAP[current];
        updated++;
        continue;
      }
      // 標準以外（空や不明）は detectCategory で再判定
      if (STANDARD_CAT.includes(current)) continue;
      const fixed = fixCategory({ name: rec.materialName, category: current });
      if (fixed !== current) {
        rec.category = fixed;
        updated++;
      }
    }

    if (updated > 0) {
      this.syncToCloud();
      this.showToast(`納品台帳 ${updated}件のカテゴリを補正しました`, 'success');
    } else {
      this.showToast('補正対象のレコードはありませんでした', 'info');
    }
    return { updated, total: receipts.length };
  },

  /**
   * v5.6.2 マスタに certUrl が存在するのに台帳レコードが消えている場合に復元する
   * 対象: m_material の certUrl / jasCertUrl を持つ資材で、
   *       t_material_receipt に docType:'資材・適合証明書' のレコードが存在しないもの
   * @returns {{ recovered: number }}
   */
  recoverCertificatesFromMaster() {
    const materials = state.masters.m_material || [];
    const receipts  = state.records.t_material_receipt || [];
    let recovered = 0;

    for (const mat of materials) {
      const certUrl = mat.certUrl || mat.jasCertUrl;
      if (!certUrl) continue; // 証明書なし → スキップ

      // 既に同一 materialId / 資材名 で適合証明書レコードが存在するか確認
      const alreadyExists = receipts.some(r =>
        r.docType === '資材・適合証明書' &&
        (r.materialId === mat.id || r.materialName === mat.name)
      );
      if (alreadyExists) continue;

      // 復元レコードを生成
      const newReceipt = {
        id: `MR_recover_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        docType: '資材・適合証明書',
        date: new Date().toISOString().split('T')[0],
        expiryDate: mat.expiry || mat.expiryDate || '',
        materialId: mat.id,
        materialName: mat.name,
        category: mat.category || '資材',
        partnerName: '（復元）',
        supplier: '（復元）',
        quantity: '1',
        certUrl: certUrl,
        photoUrl: certUrl,
        hasCert: true,
        notes: 'マスタの certUrl から自動復元（台帳データが失われた際の回復）'
      };
      if (!state.records.t_material_receipt) state.records.t_material_receipt = [];
      state.records.t_material_receipt.push(newReceipt);
      recovered++;
    }

    if (recovered > 0) {
      this.syncToCloud();
      this.showToast(`${recovered}件の適合証明書を台帳に復元しました。仕入先を「（復元）」→ 正しい取引先名に修正してください`, 'success');
    } else {
      this.showToast('復元対象の証明書レコードはありませんでした', 'info');
    }
    return { recovered };
  },

  /**
   * v5.5.0 複数伝票の一括振り分け（1スキャンに複数の納品書が含まれる場合）
   * @param {string} docId - Inbox ドキュメントID
   * @param {'receipt'} targetType - 現在は 'receipt' のみ対応
   * @param {Array} dataList - 伝票データの配列（各要素に date, partnerName, items, fileUrl）
   */
  processBulkInboxDocuments(docId, targetType, dataList) {
    if (!state.records.t_inbox_documents || !dataList || dataList.length === 0) return;

    let totalRecords = 0;

    for (const data of dataList) {
      if (targetType === 'receipt') {
        const supplierName = (data.supplier || data.partnerName || '不明').trim();
        let partnerIdVal = '';
        const matchedPartner = state.masters.m_partner.find(p =>
          p.name === supplierName || p.name.includes(supplierName) || supplierName.includes(p.name)
        );
        if (matchedPartner) {
          partnerIdVal = matchedPartner.id;
        } else if (supplierName && supplierName !== '不明') {
          const newPartner = this.addMasterItem('m_partner', {
            name: supplierName, partnerType: '仕入先', category: '仕入先'
          });
          partnerIdVal = newPartner?.id || '';
        }

        const itemsToProcess = data.items && data.items.length > 0
          ? data.items
          : [{ materialName: data.materialName, category: data.category, quantity: data.quantity }];

        itemsToProcess.forEach(item => {
          const matName = (item.materialName || '未入力資材').trim();
          let matIdVal = '';
          const matchedMat = state.masters.m_material.find(m =>
            m.name === matName || m.name.includes(matName) || matName.includes(m.name)
          );
          if (matchedMat) {
            matIdVal = matchedMat.id;
          } else if (matName && matName !== '未入力資材') {
            const newMat = this.addMasterItem('m_material', {
              name: matName, category: item.category || '資材', unit: '袋'
            });
            matIdVal = newMat?.id || '';
          }

          const newReceipt = {
            id: `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            docType: '納品書',
            date: data.date || new Date().toISOString().split('T')[0],
            materialId: matIdVal,
            materialName: matName,
            category: item.category || '資材',
            partnerId: partnerIdVal,
            partnerName: supplierName,
            supplier: supplierName,
            quantity: item.quantity || '1',
            certUrl: data.fileUrl,
            photoUrl: data.fileUrl,
            hasCert: false,
            notes: dataList.length > 1
              ? `スキャナー受信トレイから取り込み（${dataList.length}件一括）`
              : 'スキャナー受信トレイから取り込み'
          };
          if (!state.records.t_material_receipt) state.records.t_material_receipt = [];
          state.records.t_material_receipt.push(newReceipt);
          this.autoCreateWorkRecordFromReceipt(newReceipt);
          totalRecords++;
        });
      }
    }

    this.deleteInboxDocument(docId);
    const label = dataList.length > 1
      ? `${dataList.length}枚の伝票を一括登録しました（${totalRecords}件）`
      : '書類を「納品記録」として振り分けました！';
    this.showToast(label);
  },

  /**
   * v4.1.0 受信トレイ（Inbox）へ新しいスキャンドキュメント（証明書や納品書）を直接登録・Firestore同期する（実稼働API）
   */
  addInboxDocument(doc) {
    if (!state.records.t_inbox_documents) state.records.t_inbox_documents = [];
    
    const newDoc = {
      id: doc.id || `inbox_${Date.now()}`,
      fileName: doc.fileName || `mobile_scan_${Date.now().toString().slice(-6)}.jpg`,
      fileUrl: doc.fileUrl, // 実際のBase64データ
      receivedAt: doc.receivedAt || new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: doc.status || 'unread',
      suggestedType: doc.suggestedType || '未識別',
      parsedData: doc.parsedData || {
        date: new Date().toISOString().split('T')[0],
        materialName: '',
        category: '資材',
        partnerName: '',
        quantity: '1'
      }
    };
    
    state.records.t_inbox_documents.push(newDoc);
    this.syncToCloud();
    this.showToast('書類を受信トレイ（Inbox）に転送しました！', 'success');
  },

  /**
   * 受信トレイのドキュメントのフィールドを更新する（再解析などに使用）
   */
  updateInboxDocument(docId, updates) {
    if (!state.records.t_inbox_documents) return;
    const idx = state.records.t_inbox_documents.findIndex(d => d.id === docId);
    if (idx !== -1) {
      state.records.t_inbox_documents[idx] = { ...state.records.t_inbox_documents[idx], ...updates };
      this.syncToCloud();
    }
  },

  /**
   * 受信トレイのドキュメントをゴミ箱（削除）する
   */
  deleteInboxDocument(docId) {
    if (!state.records.t_inbox_documents) return;
    state.records.t_inbox_documents = state.records.t_inbox_documents.filter(d => d.id !== docId);
    this.syncToCloud();
  },

  /**
   * 受信トレイのドキュメントを全件削除する
   */
  clearInboxDocuments() {
    state.records.t_inbox_documents = [];
    this.syncToCloud();
    this.showToast('受信トレイを空にしました', 'success');
  }
};
