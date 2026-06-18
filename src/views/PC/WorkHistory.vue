<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { 
  ClipboardList, 
  Search, 
  Filter, 
  Download, 
  ChevronRight, 
  Calendar,
  User,
  MapPin,
  Tractor,
  CheckCircle2,
  Edit3,
  Trash2,
  X,
  Save,
  Info,
  Sprout,
  Plus,
  ArrowRight,
  Printer,
  BookOpen
} from 'lucide-vue-next';
import { state, actions } from '../../store';

const searchQuery    = ref('');
const filterField    = ref('all');
const filterDateFrom = ref('');   // 期間フィルター: 開始日 (YYYY-MM-DD)
const filterDateTo   = ref('');   // 期間フィルター: 終了日 (YYYY-MM-DD)
const displayMode    = ref('list'); // 'list' or 'ledger'
const selectedField = computed(() => state.masters.m_field.find(f => f.id === filterField.value));

// Ledger editable fields
const ledgerCropInfo = ref('');
const ledgerRemarks = ref(
  '※緩衝地帯の作付けは行っていません。\n' +
  '※JAS圃場外での機械、器具の使用はありません。\n' +
  '※播種時使用している土（資材）は自家培土A圃場の土を使用しています。'
);
const rowRemarks = ref({}); // Record ID -> Remark text (手動編集も可能)

// 台帳セル上書き編集用（印刷前の微調整に使用）
const ledgerCellEdit = ref({});
const rowSaveErrors   = ref({}); // recordId → string[]（バリデーションエラーメッセージ）
const rowSavedFlag    = ref({}); // recordId → bool（保存済み5秒フラグ）
const rowRemarksEdited = new Set(); // 備考セルが実際に編集されたrecordIdを追跡（非リアクティブで十分）

const getCellVal = (recordId, field, defaultValue) => {
  const key = `${recordId}__${field}`;
  return key in ledgerCellEdit.value ? ledgerCellEdit.value[key] : (defaultValue ?? '');
};
const setCellVal = (recordId, field, value) => {
  ledgerCellEdit.value[`${recordId}__${field}`] = value;
};
// 洗浄セルの初期表示値: 洗浄方法テキスト（水洗い/泥払い等）を優先、なければ従来の〇
const washDefault = (r, equipVal) => r.washMethod || (r.isWashed && equipVal ? '〇' : '');

// ── 台帳行バリデーション ─────────────────────────────────────────
const validateLedgerRow = (recordId, r) => {
  const errors = [];
  const wasEdited = (field) => `${recordId}__${field}` in ledgerCellEdit.value;
  const editedVal = (field) => ledgerCellEdit.value[`${recordId}__${field}`];

  // 日付: 編集した場合は空でないか
  if (wasEdited('date') && !editedVal('date')) errors.push('日付は必須です');

  // 作業内容: 編集した場合は空でないか
  if (wasEdited('workType') && !editedVal('workType')) errors.push('作業内容は必須です');

  // 数量: 単位付き文字列（「6袋」「100g」等）も許可 → チェックなし

  // 洗浄方法: 機材が空の場合は不可（wasEditedに関わらずチェック）
  const equipVal = getCellVal(recordId, 'equipment', r.equipment);
  const washVal  = getCellVal(recordId, 'wash', washDefault(r, r.equipment));
  if (washVal && !equipVal) errors.push('洗浄方法は機材・器具名が入力されている場合のみ記録できます');

  return errors;
};

// ── 台帳行保存 → Firestore更新 ──────────────────────────────────
const saveLedgerRow = (recordId, r) => {
  const errors = validateLedgerRow(recordId, r);
  rowSaveErrors.value = { ...rowSaveErrors.value, [recordId]: errors };

  if (errors.length > 0) {
    actions.showToast(errors[0], 'warning');
    return;
  }

  const editKeyPrefix = recordId;

  // 元のワークレコードを取得
  let wr = state.records.t_work_record?.find(rec => rec.id === recordId);

  if (!wr) {
    actions.showToast('対象レコードが見つかりません', 'error');
    return;
  }

  const updated = JSON.parse(JSON.stringify(wr));
  const origYear = wr.date ? wr.date.split('-')[0] : String(new Date().getFullYear());

  // ── ヘルパー: セルが実際に編集されたかチェック ──────────────────
  // 注意：recordId は途中で昇格により書き換わる可能性があるため、editKeyPrefix を使用する
  const wasEdited = (field) => `${editKeyPrefix}__${field}` in ledgerCellEdit.value;
  const editedVal = (field) => ledgerCellEdit.value[`${editKeyPrefix}__${field}`];

  const _toPurchaseISO = (str) => {
    if (!str) return str;
    // "6/17" または "6-17" → "YYYY-MM-DD" に変換（表示時に M/D へ戻される）
    if (/^\d{1,2}[\/\-]\d{1,2}$/.test(str)) {
      const [m, d] = str.split(/[\/\-]/);
      return `${origYear}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }
    return str;
  };

  // 播種日/定植日/収穫始め/収穫終わりの日付正規化ヘルパー
  // 対応フォーマット:
  //   "6-18"        → "{origYear}-06-18"
  //   "6/18"        → "{origYear}-06-18"
  //   "2023-6-18"   → "2023-06-18"  (月日ゼロ埋め)
  //   "2023/6/18"   → "2023-06-18"
  //   "2023-06-18"  → "2023-06-18"  (そのまま)
  //   ""            → ""            (空欄クリアを保持)
  const _toStepDateISO = (str) => {
    if (str === '' || str == null) return str ?? '';
    const s = str.trim();
    // M-D / M/D (年なし)
    if (/^\d{1,2}[-/]\d{1,2}$/.test(s)) {
      const [m, d] = s.split(/[-/]/);
      return `${origYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // YYYY-M-D / YYYY/M/D (年あり)
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)) {
      const [y, m, d] = s.split(/[-/]/);
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // その他はそのまま返す
    return s;
  };

  // ── 日付（編集された場合のみ M/D → YYYY-MM-DD に変換）
  if (wasEdited('date')) {
    const dateStr = editedVal('date');
    if (/^\d{1,2}\/\d{1,2}$/.test(dateStr)) {
      const [m, d] = dateStr.split('/');
      updated.date = `${origYear}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    } else if (dateStr) {
      updated.date = dateStr;
    }
  }

  // ── 圃場名（編集された場合のみ → マスタから fieldId を解決）
  if (wasEdited('fieldName')) {
    const fieldNameVal = editedVal('fieldName');
    const matchedField = state.masters.m_field?.find(f => f.name === fieldNameVal);
    if (matchedField) {
      updated.fieldId = matchedField.id;
    }
  }

  // ── 作物名（編集された場合のみ → 両マスタを横断して cropId 解決）
  // cropName は常に保存する（cropId が m_material のIDの場合に m_crop で見つからず表示が戻るバグを防ぐ）
  if (wasEdited('cropName')) {
    const cropNameVal = editedVal('cropName');
    updated.cropName = cropNameVal;
    const matchedCrop = state.masters.m_crop?.find(c => c.name === cropNameVal);
    if (matchedCrop) {
      updated.cropId = matchedCrop.id;
    } else {
      const matchedSeed = masterSeeds.value?.find(m => m.name === cropNameVal);
      if (matchedSeed) { updated.cropId = matchedSeed.id; }
      else { updated.cropId = null; }
    }
  }

  // ── 作業内容（編集された場合のみ → content 上書き）
  // ※ 未編集の場合は「/ 耕運」などの複合作業が失われないよう手を付けない
  if (wasEdited('workType')) {
    const workTypeVal = editedVal('workType');
    if (workTypeVal) updated.content = workTypeVal;
  }

  // ── 種苗/資材（編集されたフィールドが1つでもあれば更新）
  const anyItemEdited = wasEdited('itemName') || wasEdited('qty') || wasEdited('source') || wasEdited('purchaseDate');
  if (anyItemEdited) {
    const itemNameVal     = wasEdited('itemName')     ? editedVal('itemName')     : r.itemName;
    const qtyVal          = wasEdited('qty')          ? editedVal('qty')          : r.qty;
    const sourceVal       = wasEdited('source')       ? editedVal('source')       : r.source;
    const purchaseDateVal = wasEdited('purchaseDate') ? editedVal('purchaseDate') : r.purchaseDate;

    if (updated.seeds?.length > 0) {
      // 既存の種苗エントリを更新
      updated.seeds[0].name         = itemNameVal     ?? updated.seeds[0].name;
      updated.seeds[0].quantity     = qtyVal          ?? updated.seeds[0].quantity;
      updated.seeds[0].source       = sourceVal       ?? updated.seeds[0].source;
      if (purchaseDateVal != null)
        updated.seeds[0].purchaseDate = _toPurchaseISO(purchaseDateVal);
    } else if (updated.materials?.length > 0) {
      // 既存の資材エントリを更新
      updated.materials[0].name         = itemNameVal     ?? updated.materials[0].name;
      updated.materials[0].quantity     = qtyVal          ?? updated.materials[0].quantity;
      updated.materials[0].source       = sourceVal       ?? updated.materials[0].source;
      if (purchaseDateVal != null)
        updated.materials[0].purchaseDate = _toPurchaseISO(purchaseDateVal);
    } else {
      // seeds も materials も空 → 新規エントリを seeds に追加
      if (itemNameVal || qtyVal) {
        if (!updated.seeds) updated.seeds = [];
        updated.seeds.push({
          name:         itemNameVal || '',
          quantity:     qtyVal || '',
          source:       sourceVal || '',
          purchaseDate: _toPurchaseISO(purchaseDateVal) || '',
          taskType:     updated.content || '',
        });
      }
    }
  }

  // ── 機材（編集された場合のみ → 名前→IDで解決、未マッチはnoteへ）
  if (wasEdited('equipment')) {
    const equipVal   = editedVal('equipment');
    const equipNames = equipVal.split(/[、,・/]/).map(n => n.trim()).filter(n => n);
    const equipList  = state.masters.m_equipment || [];
    const resolvedIds = [];
    const unmatched   = [];
    equipNames.forEach(name => {
      const found = equipList.find(e => e.name === name || e.name.includes(name) || name.includes(e.name));
      if (found) resolvedIds.push(found.id);
      else unmatched.push(name);
    });
    updated.equipmentIds = resolvedIds;
    let note = (updated.note || '')
      .replace(/\s*\/\s*\[機材[:：][^\]]*\]/g, '')
      .replace(/^\[機材[:：][^\]]*\]\s*\/?\s*/, '').trim();
    if (unmatched.length > 0) {
      const equipNote = `[機材: ${unmatched.join('・')}]`;
      updated.note = note ? `${note} / ${equipNote}` : equipNote;
    } else {
      updated.note = note;
    }
  }

  // ── 洗浄方法（水洗い/泥払い等のテキスト。空=未洗浄、〇は方法不明の洗浄済み）
  if (wasEdited('wash')) {
    const washVal = (editedVal('wash') || '').trim();
    updated.isWashed = !!washVal;
    if (washVal !== '〇') updated.washMethod = washVal;
  }

  // ── 播種日 / 定植日 / 収穫始め / 収穫終わり
  // ユーザーが直接セルを編集した場合のみ *Override フィールドに保存する。
  // 空文字で上書きされた場合も空文字として保存し、getHistoricalStepDate の
  // 自動計算値が復元しないようにする（undefined なら計算値を使う仕様）。
  [
    { cell: 'sowingDate',   override: 'sowingDateOverride'   },
    { cell: 'plantingDate', override: 'plantingDateOverride' },
    { cell: 'harvestStart', override: 'harvestStartOverride' },
    { cell: 'harvestEnd',   override: 'harvestEndOverride'   },
  ].forEach(({ cell, override }) => {
    if (wasEdited(cell)) {
      // "6-18" や "6/18" → "YYYY-MM-DD" に正規化してから保存
      updated[override] = _toStepDateISO(editedVal(cell) ?? '');
    }
  });

  // ── 備考（ユーザーが備考セルを実際に編集した場合のみ note を再構築）
  // ※ 備考セルを触っていないのに note を上書きすると、他フィールドのデータが
  //    失われたり onSnapshot 後に旧データが復元する原因になる
  if (rowRemarksEdited.has(editKeyPrefix)) {
    const remarkVal = rowRemarks.value[editKeyPrefix] ?? '';
    const noteBase  = updated.note || '';
    // システムタグ（洗浄:/収穫量:/[機材:]）を保持し、ユーザー備考を差し替え
    const sysTags = noteBase.split(' / ').filter(p => {
      const pt = p.trim();
      return pt.startsWith('洗浄:') || pt.startsWith('洗浄：') ||
             pt.startsWith('収穫量:') || pt.startsWith('収穫量：') ||
             pt.startsWith('[機材:') || pt.startsWith('[機材：');
    });
    const allParts = [...sysTags, ...(remarkVal ? [remarkVal] : [])];
    updated.note = allParts.join(' / ');
    rowRemarksEdited.delete(editKeyPrefix); // 保存後はフラグをクリア
  }

  actions.updateWorkRecord(updated);

  // 保存成功 → 編集バッファをクリア（Firestoreの値で再描画）
  const keys = Object.keys(ledgerCellEdit.value).filter(k => k.startsWith(`${editKeyPrefix}__`));
  keys.forEach(k => delete ledgerCellEdit.value[k]);
  rowSaveErrors.value = { ...rowSaveErrors.value, [editKeyPrefix]: [], [recordId]: [] };
  // 保存済みフラグを5秒間表示
  rowSavedFlag.value = { ...rowSavedFlag.value, [editKeyPrefix]: true, [recordId]: true };
  setTimeout(() => {
    rowSavedFlag.value = { ...rowSavedFlag.value, [editKeyPrefix]: false, [recordId]: false };
  }, 5000);

  actions.showToast('保存しました ✓', 'success', 5000);
};

// 💡 メタ情報をその場で手動入力できるようにするためのリアクティブ変数とwatch
const ledgerFieldName = ref('');
const ledgerCropName = ref('');
const ledgerEraYear = ref('');

watch(filterField, (newFieldId) => {
  if (newFieldId === 'all') {
    ledgerFieldName.value = 'すべての圃場';
  } else {
    const name = getFieldName(newFieldId);
    ledgerFieldName.value = name === '未設定' ? '' : name;
  }
  ledgerCropName.value = '';
  ledgerEraYear.value = '';
}, { immediate: true });

// 💡 作業記録の note フィールドを備考欄の初期値として読み込む
// ・「洗浄: xxx」「収穫量: xxx」「[機材: xxx]」などシステム用タグは除外
// ・播種日/定植日/収穫始め/収穫終わり列に値がある場合は対応するキーワードも除外
// ・ユーザーが手動で上書きした値は保持する
const extractDisplayNote = (note, rowDates = {}) => {
  if (!note) return '';
  return note.split(' / ')
    .filter(part => {
      const p = part.trim();
      if (!p) return false;
      if (p.startsWith('洗浄:') || p.startsWith('洗浄：')) return false;
      if (p.startsWith('収穫量:') || p.startsWith('収穫量：')) return false;
      if (p.startsWith('[機材:') || p.startsWith('[機材：')) return false;
      // 播種日列に値がある場合、「播種」から始まる備考は不要
      if (rowDates.sowingDate && /^播種/.test(p)) return false;
      // 定植日列に値がある場合、「定植」から始まる備考は不要
      if (rowDates.plantingDate && /^定植/.test(p)) return false;
      // 収穫始め列に値がある場合、「収穫開始」「収穫始め」から始まる備考は不要
      if (rowDates.harvestStart && /^収穫(開始|始め)/.test(p)) return false;
      // 収穫終わり列に値がある場合、「収穫終了」「収穫終わり」から始まる備考は不要
      if (rowDates.harvestEnd && /^収穫(終了|終わり)/.test(p)) return false;
      return true;
    })
    .join(' / ')
    .trim();
};

// ※ rowRemarks の初期化 watch は ledgerFlatRows 定義後に記述（前方参照エラー回避）

// 💡 令和の和暦年を取得するヘルパー
const getJapaneseEraYear = () => {
  const year = new Date().getFullYear();
  // 2026年は令和8年、2025年は令和7年。令和元年は2019年。
  const reiwaYear = year - 2018;
  return `令和${reiwaYear}年`;
};

// 💡 行の作物名（野菜名）と作業タイプを判定・抽出するヘルパー
const getRowCropAndWorkType = (r) => {
  let cropName = '';
  let workType = '';

  // 1. 作物名の判定（優先順位: cropId > cropName > content > seeds[0].name）
  if (r.cropId) {
    cropName = state.masters.m_crop.find(c => String(c.id) === String(r.cropId))?.name || '';
  }
  if (!cropName && r.cropName) {
    cropName = r.cropName;
  }
  if (!cropName && r.content) {
    const foundCrop = state.masters.m_crop.find(c => r.content.includes(c.name));
    if (foundCrop) cropName = foundCrop.name;
  }
  if (!cropName && r.seeds && r.seeds.length > 0) {
    cropName = r.seeds[0].name.split(' ')[0];
  }

  // B畑はブルーベリー専用なので、作物名が空の場合は自動で「有機ブルーベリー」を補完する
  if (!cropName) {
    const fieldB = state.masters?.m_field?.find(f => f.name === 'B畑');
    if (fieldB && String(r.fieldId) === String(fieldB.id)) {
      cropName = '有機ブルーベリー';
    }
  }

  // 2. 作業タイプの判定
  if (r.content) {
    const c = r.content;
    if (c.includes('播種')) workType = '播種';
    else if (c.includes('定植')) workType = '定植';
    else if (c.includes('収穫終了') || c.includes('収穫終')) workType = '収穫終了';
    else if (c.includes('収穫開始') || c.includes('収穫始')) workType = '収穫開始';
    else if (c.includes('持ち越し') || c.includes('持越')) workType = '前期持ち越し';
    else if (c.includes('除草')) workType = '除草';
    else if (c.includes('耕起') || c.includes('施肥') || c.includes('元肥')) workType = '耕起・施肥';
    else if (c.includes('マルチ')) workType = 'マルチ張り';
    else {
      const foundType = state.masters.m_work_type.find(t => c.includes(t.name));
      workType = foundType ? foundType.name : c.split(',')[0];
    }
  }

  return { cropName, workType };
};

// 💡 作業タイプに応じたバッジCSSクラスを取得するヘルパー
const getWorkTypeBadgeClass = (workType) => {
  if (!workType) return '';
  if (workType === '播種') return 'badge-sowing';
  if (workType === '定植') return 'badge-planting';
  if (workType === '収穫終了') return 'badge-harvest-end';
  if (workType === '収穫開始') return 'badge-harvest-start';
  if (workType.includes('持ち越し')) return 'badge-carry-over';
  return 'badge-other';
};

// 💡 台帳の作業セル色分け（公式Excel様式準拠: 播種=青 / 収穫開始・終了=赤系）
// 重要工程のみ色付けし、除草・耕運などの通常作業は無色のまま
const ledgerWorkClass = (r) => {
  const v = getCellVal(r.recordId, 'workType', r.workType || r.workName) || '';
  if (v.includes('収穫終')) return 'wt-harvest-end';
  if (v.includes('収穫開始') || v.includes('収穫始')) return 'wt-harvest-start';
  if (v.includes('播種')) return 'wt-sowing';
  if (v.includes('定植')) return 'wt-planting';
  return '';
};

// 💡 播種日/定植日/収穫始め/収穫終わりの自動計算を出してよい行か判定する。
// 作物のライフサイクルに関わる作業（播種・定植・収穫・間引き等）の行のみ対象とし、
// 除草・耕運・施肥・堆肥撒きなどの一般作業行には自動の工程日付を出さない
// （公式Excel様式でもこれらの行の特記事項欄は空欄になっている）。
const LIFECYCLE_WORK_RE = /播種|定植|移植|収穫|撤去|間引き|持ち越し|引継ぎ|前期分R6定植/;
const isLifecycleRow = (r) => LIFECYCLE_WORK_RE.test(r.content || '');

// 💡 作物サイクル単位の工程日付マップ（recordId → {sowing, planting, harvestStart, harvestEnd}）
// 同じ圃場・同じ作物の記録を「播種（または定植）→収穫終了」で1サイクルにまとめ、
// そのサイクルの 播種日/定植日/収穫始め/収穫終わり を全行に反映する。
// これにより、播種行からは後の収穫終了まで、収穫終了行からは過去の播種日まで、
// どの行からでも作物の履歴を前後両方向にたどれる（公式Excel様式と同じ）。
const cropCycleDates = computed(() => {
  const map = {};
  const all = (state.records.t_work_record || []).filter(r => !isDocumentRecord(r));

  // 種苗（品種）名 → 作物名 の対応表を、作物名と種苗名を両方持つ記録から自動生成。
  // 播種行（作物名あり）と収穫行（作物名なし・種苗名のみ）を確実に同じ作物へ寄せるための橋渡し。
  const cropNameOf = (r) => (getCropName(r) || '').replace(/^有機/, '').trim();
  const seedNameOf = (r) => (r.seeds && r.seeds[0] && r.seeds[0].name) || '';
  const seedToCrop = {};
  all.forEach(r => {
    const crop = cropNameOf(r);
    const seed = seedNameOf(r);
    if (crop && seed && !seedToCrop[seed]) seedToCrop[seed] = crop;
  });
  // 記録の「正準の作物名」: 作物名があればそれ、無ければ種苗名から作物名を逆引き、最後は種苗名
  const cropKeyOf = (r) => {
    const crop = cropNameOf(r);
    if (crop) return crop;
    const seed = seedNameOf(r);
    return seedToCrop[seed] || seed || '';
  };

  const groups = {};
  all.forEach(r => {
    const cropKey = cropKeyOf(r);
    if (!cropKey) return; // 作物が特定できない行（除草など）はサイクル対象外
    const key = `${r.fieldId}|${cropKey}`;
    (groups[key] = groups[key] || []).push(r);
  });
  const D = (s) => new Date(s).getTime();
  const varietyOf = (r) => (r.seeds && r.seeds[0] && r.seeds[0].name) || '';

  Object.values(groups).forEach(list => {
    list.sort((a, b) => D(a.date) - D(b.date));

    // 作付けロット方式:
    // ・播種ごとに新しいロット（作付け）を生成。同名でも別ロットとして枝分かれさせる。
    // ・品種（種苗名）が分かる収穫は同じ品種の最古の未完了ロットへ、
    //   品種が空の収穫は作物名で最古の未完了ロットへ割り当てる（先に播いた作付けから先に収穫＝FIFO）。
    // ・収穫終了でそのロットを完了。
    const lots = []; // { variety, sowing, planting, harvestStart, harvestEnd, harvesting, closed, ids[] }
    const newLot = (variety) => {
      const lot = { variety, sowing: '', planting: '', harvestStart: '', harvestEnd: '', harvesting: false, closed: false, ids: [] };
      lots.push(lot);
      return lot;
    };
    // 述語 pred を満たす最古ロットを探す。
    // 品種（種苗名）が分かる収穫は必ず同じ品種のロットにのみ割り当てる
    //（例: 味こがねの収穫がサラダカブのロットに紛れ込まないようにする）。
    // 品種が不明（収穫欄に種苗名なし）のときだけ、作物グループ全体から探す。
    const findLot = (variety, pred) => {
      if (variety) return lots.find(l => l.variety === variety && pred(l));
      return lots.find(l => pred(l));
    };

    list.forEach(r => {
      const c = r.content || '';
      const isCarryover = c.includes('持ち越し') || c.includes('引継ぎ') || c.includes('前期分R6定植');
      const isSow = c.includes('播種') || isCarryover;
      const isPlant = c.includes('定植') || c.includes('移植');
      const isHarvest = c.includes('収穫');
      const isHEnd = c.includes('収穫終了') || c.includes('収穫終わり');
      const v = varietyOf(r);

      if (isSow) {
        const lot = newLot(v);
        lot.sowing = r.sowingDateOverride || r.date;
        if (r.plantingDateOverride) lot.planting = r.plantingDateOverride; // 「播種・定植」同一行対応
        lot.ids.push(r.id);
        return;
      }
      if (isPlant) {
        // 定植: 同品種で定植前・未完了の最古ロットへ。無ければ新ロット（育苗ハウス播種など）
        let lot = findLot(v, l => !l.planting && !l.harvesting && !l.closed) || newLot(v);
        lot.planting = r.plantingDateOverride || r.date;
        lot.ids.push(r.id);
        return;
      }
      if (isHarvest) {
        let lot;
        if (isHEnd) {
          lot = findLot(v, l => l.harvesting) || findLot(v, l => !l.closed) || newLot(v);
        } else {
          lot = findLot(v, l => !l.closed && !l.harvesting) || findLot(v, l => !l.closed) || newLot(v);
        }
        lot.ids.push(r.id);
        if (!lot.harvestStart) lot.harvestStart = r.date;
        lot.harvestEnd = r.date;
        lot.harvesting = true;
        if (isHEnd) { lot.closed = true; lot.harvesting = false; }
        return;
      }
      // その他（間引き・除草・撤去・持ち越しなど）: 直近の未完了ロットへ
      const lot = [...lots].reverse().find(l => !l.closed) || lots[lots.length - 1];
      if (lot) lot.ids.push(r.id);
    });

    // 各ロットの工程日付を、そのロットの全行へ反映
    lots.forEach(lot => {
      lot.ids.forEach(id => {
        map[id] = { sowing: lot.sowing, planting: lot.planting, harvestStart: lot.harvestStart, harvestEnd: lot.harvestEnd };
      });
    });
  });
  return map;
});

// 工程日付の解決: 手入力（Override）を最優先、無ければライフサイクル行に限りサイクル値を反映
const resolveStepDate = (r, overrideKey, cycleKey) => {
  if (r[overrideKey]) return r[overrideKey]; // 手入力があれば最優先
  if (!isLifecycleRow(r)) return '';
  return (cropCycleDates.value[r.id] && cropCycleDates.value[r.id][cycleKey]) || '';
};

// 💡 画像の公式様式に合わせて、作業・資材データを1行ずつのフラットな構造に展開する
const ledgerFlatRows = computed(() => {
  const rows = [];
  ledgerRecords.value.forEach(r => {
    const dateStr = r.date || '';
    const mainWorkName = r.content ? r.content.split(',')[0] : '';
    const subWorkName = r.content ? r.content.split(',').slice(1).join(',') : '';

    const { cropName, workType } = getRowCropAndWorkType(r);

    // 圃場名（「すべての圃場」表示時に行ごとの圃場列で使用）
    const fieldName = getFieldName(r.fieldId);

    // 持ち越し判定
    const isCarryOver = workType.includes('持ち越し') || 
                        mainWorkName.includes('持ち越し') || 
                        (r.seeds && r.seeds.some(s => s.name.includes('持ち越し') || s.source?.includes('持ち越し')));

    // 発育不良・発芽不良判定（備考 rowRemarks または作業詳細 content に特定のキーワードが含まれている場合）
    const remarkText = rowRemarks.value[r.id] || '';
    const isDefect = remarkText.includes('発育不良') ||
                     remarkText.includes('生育不良') ||
                     remarkText.includes('発芽不良') ||
                     remarkText.includes('発芽しない') ||
                     remarkText.includes('病気') ||
                     r.content.includes('発育不良') ||
                     r.content.includes('発芽不良') ||
                     r.content.includes('発芽しない');

    // その作業に紐付く種苗と資材をすべて合算
    const items = [
      ...(r.seeds || []).map(s => ({
        name: s.name,
        qty: s.quantity,
        source: s.source || getPurchaseInfo(s.name).source,
        purchaseDate: s.purchaseDate || getPurchaseInfo(s.name).date
      })),
      ...(r.materials || []).map(m => ({
        name: m.name,
        qty: m.quantity,
        source: m.source || getPurchaseInfo(m.name).source,
        purchaseDate: m.purchaseDate || getPurchaseInfo(m.name).date
      }))
    ];

    if (items.length === 0) {
      rows.push({
        id: `${r.id}_none`,
        date: dateStr,
        fieldName: fieldName,
        cropName: cropName,
        workType: workType,
        isCarryOver,
        isDefect,
        workName: mainWorkName,
        subWork: subWorkName,
        itemName: '',
        qty: (() => {
          const note = r.note || '';
          const m1 = note.match(/収穫量[：:]\s*([^\s,/]+)/);
          if (m1) return m1[1];
          const m2 = note.match(/納品書自動連動:\s*([\d.,]+\s*\S*)/);
          return m2 ? m2[1].trim() : '';
        })(),
        source: '',
        purchaseDate: '',
        equipment: (r.equipmentIds || []).map(id => masterEquipments.value.find(e => e.id === id)?.name).join(', '),
        isWashed: r.isWashed,
        washMethod: r.washMethod || '',
        // 播種日/定植日/収穫始め/収穫終わり:
        // 手入力（Override）を最優先。自動計算は作物の工程行のみ（resolveStepDate内で判定）
        sowingDate:   resolveStepDate(r, 'sowingDateOverride',   'sowing'),
        plantingDate: resolveStepDate(r, 'plantingDateOverride', 'planting'),
        harvestStart: resolveStepDate(r, 'harvestStartOverride', 'harvestStart'),
        harvestEnd:   resolveStepDate(r, 'harvestEndOverride',   'harvestEnd'),
        recordId: r.id
      });
    } else {
      items.forEach((item, idx) => {
        rows.push({
          id: `${r.id}_${idx}`,
          date: idx === 0 ? dateStr : '', // 1件目のみ日付を表示
          fieldName: idx === 0 ? fieldName : '', // 1件目のみ圃場名を表示
          cropName: idx === 0 ? cropName : '',
          workType: idx === 0 ? workType : '',
          isCarryOver: idx === 0 ? isCarryOver : false,
          isDefect: idx === 0 ? isDefect : false,
          workName: idx === 0 ? mainWorkName : '', // 1件目のみ作業名を表示
          subWork: idx === 0 ? subWorkName : '',
          itemName: item.name,
          qty: item.qty,
          source: item.source,
          purchaseDate: item.purchaseDate ? item.purchaseDate.split('-').slice(1).map(Number).join('/') : '',
          equipment: idx === 0 ? (r.equipmentIds || []).map(id => masterEquipments.value.find(e => e.id === id)?.name).join(', ') : '',
          isWashed: idx === 0 ? r.isWashed : false,
          washMethod: idx === 0 ? (r.washMethod || '') : '',
          sowingDate:   idx === 0 ? resolveStepDate(r, 'sowingDateOverride',   'sowing') : '',
          plantingDate: idx === 0 ? resolveStepDate(r, 'plantingDateOverride', 'planting') : '',
          harvestStart: idx === 0 ? resolveStepDate(r, 'harvestStartOverride', 'harvestStart') : '',
          harvestEnd:   idx === 0 ? resolveStepDate(r, 'harvestEndOverride',   'harvestEnd') : '',
          recordId: r.id
        });
      });
    }
  });

  return rows;
});

// 💡 rowRemarks 初期化ヘルパー（ledgerFlatRows の値を使って note を加工）
const initRowRemarks = () => {
  const seen = new Set();
  ledgerFlatRows.value.forEach(row => {
    if (seen.has(row.recordId)) return;
    seen.add(row.recordId);
    if (row.recordId in rowRemarks.value) return; // ユーザー編集済みは保持
    const wr = state.records.t_work_record?.find(r => r.id === row.recordId);
    if (!wr?.note) return;
    const display = extractDisplayNote(wr.note, {
      sowingDate:   row.sowingDate,
      plantingDate: row.plantingDate,
      harvestStart: row.harvestStart,
      harvestEnd:   row.harvestEnd,
    });
    if (display) rowRemarks.value[row.recordId] = display;
  });
};

// 圃場切り替え時に再初期化（ユーザー編集済みフラグをリセットしてから）
watch(filterField, () => {
  rowRemarks.value = {};
});

// 作業記録は「種苗・肥料の納品＋農作業」のみを対象とし、
// 証憑スキャン等から自動生成された書類・報告書系レコード
// （水質検査報告書・各種契約書・証明書など）は一覧/台帳から除外する。
// ※レコード自体は削除せず、証憑台帳など他画面では引き続き参照可能（非破壊フィルタ）。
const DOC_EXCLUDE_RE = /水質検査|検査結果|報告書|契約書|成績書|登録証|許可証|計画書|申請書|証明書|購入/;
const isDocumentRecord = (r) => DOC_EXCLUDE_RE.test(r.content || '');

// ── 収穫の集約（JAS運用準拠）─────────────────────────────────────
// 日々の収穫は生産行程記録（台帳）には載せず「収穫始め」と「収穫終了」だけを表示する。
// ・その年度（シーズン）の最初の収穫 = 「収穫始め」
// ・次の収穫まで一定期間（既定2か月）以上空いたら、その直前の収穫 = 「収穫終了」
// ・間の日々の収穫は非表示（エビデンスは納品書で確認）
// ※すでに「収穫開始/収穫終了」と明記された記録は対象外（そのまま表示）。
const HARVEST_SEASON_GAP_DAYS = 60; // 約2か月
const isGenericHarvest = (r) => {
  const c = r.content || '';
  return c.includes('収穫') && !/(収穫開始|収穫始め|収穫終了|収穫終わり)/.test(c);
};
const collapseHarvestRecords = (records) => {
  const harvests = [];
  const others = [];
  records.forEach(r => (isGenericHarvest(r) ? harvests : others).push(r));
  if (harvests.length === 0) return records;

  // 圃場 × 作物 ごとにシーズンを判定
  const groups = {};
  harvests.forEach(r => {
    // IDで登録されたものと名前で登録されたものを同一視するため、名前を最優先で取得する
    const cropKey = getCropName(r) || r.cropName || r.cropId || '';
    const key = `${r.fieldId}|${cropKey}`;
    (groups[key] = groups[key] || []).push(r);
  });

  const result = [...others];
  Object.values(groups).forEach(list => {
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    let season = [];
    const flush = () => {
      if (season.length === 0) return;
      const first = season[0];
      const last = season[season.length - 1];
      // 元のレコードから作物名を退避しておく（content上書きで消えてしまうため）
      const preservedCrop = getRowCropAndWorkType(first).cropName || getCropName(first) || '';

      // 収穫始め行・収穫終了行とも、収穫始め〜終わりの全期間を特記事項に表示する
      result.push({ ...first, content: '収穫始め', cropName: preservedCrop, harvestStartOverride: first.date, harvestEndOverride: last.date });
      // 収穫終了（複数日にわたるシーズンのみ。単発収穫は始めのみ）
      if (last.date !== first.date) {
        result.push({ ...last, content: '収穫終了', cropName: preservedCrop, harvestStartOverride: first.date, harvestEndOverride: last.date });
      }
      season = [];
    };
    for (let i = 0; i < list.length; i++) {
      if (season.length === 0) { season.push(list[i]); continue; }
      const prev = season[season.length - 1];
      const gapDays = (new Date(list[i].date) - new Date(prev.date)) / 86400000;
      if (gapDays >= HARVEST_SEASON_GAP_DAYS) { flush(); }
      season.push(list[i]);
    }
    flush();
  });
  return result;
};

// 書類除外 ＋ 収穫集約を適用した、台帳/一覧共通のベース記録
const baseRecords = computed(() => {
  const works = (state.records.t_work_record || []).filter(r => !isDocumentRecord(r));
  return collapseHarvestRecords(works);
});

const filteredRecords = computed(() => {
  let records = [...baseRecords.value];
  records.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (filterField.value !== 'all') {
    records = records.filter(r => r.fieldId === filterField.value);
  }

  // 監査モード中は監査期間を優先、それ以外は手動フィルターを使用
  const dateFrom = (state.auditMode.active && state.auditMode.startDate) ? state.auditMode.startDate : filterDateFrom.value;
  const dateTo   = (state.auditMode.active && state.auditMode.endDate)   ? state.auditMode.endDate   : filterDateTo.value;

  if (dateFrom) records = records.filter(r => r.date >= dateFrom);
  if (dateTo)   records = records.filter(r => r.date <= dateTo);

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    records = records.filter(r =>
      (r.content || '').toLowerCase().includes(q) ||
      (r.workerName || '').toLowerCase().includes(q) ||
      getFieldName(r.fieldId).toLowerCase().includes(q)
    );
  }
  return records;
});

const getFieldName = (id) => {
  if (!id) return '';
  const field = state.masters.m_field?.find(f => f.id === id);
  return field ? field.name : '';
};

// 作物名の取得（cropId → 両マスタを横断して解決、未解決は cropName フィールドを使用）
const getCropName = (r) => {
  if (r.cropId) {
    const fromCrop = state.masters.m_crop?.find(c => String(c.id) === String(r.cropId))?.name;
    if (fromCrop) return fromCrop;
    const fromMat = state.masters.m_material?.find(m => String(m.id) === String(r.cropId))?.name;
    if (fromMat) return fromMat;
  }
  return r.cropName || '';
};

// Ledger Data Generation
const ledgerRecords = computed(() => {
  // Sort ascending for ledger
  // 書類除外＋収穫集約済みの baseRecords を使用（収穫は始め/終了のみ表示）
  // 「すべての圃場」選択時は全圃場の記録を対象にする（圃場フィルタを掛けない）
  let raw = [...baseRecords.value];
  if (filterField.value !== 'all') {
    raw = raw.filter(r => r.fieldId === filterField.value);
  }
  const ledgerFrom = (state.auditMode.active && state.auditMode.startDate) ? state.auditMode.startDate : filterDateFrom.value;
  const ledgerTo   = (state.auditMode.active && state.auditMode.endDate)   ? state.auditMode.endDate   : filterDateTo.value;
  if (ledgerFrom) raw = raw.filter(r => r.date >= ledgerFrom);
  if (ledgerTo)   raw = raw.filter(r => r.date <= ledgerTo);

  // 単一圃場: 日付昇順。
  // すべての圃場: 圃場ごとにまとめて表示 → 圃場名（昇順）→ 日付（昇順）。
  // これにより各圃場の記録がひとかたまりで並び、探しやすくなる。
  if (filterField.value === 'all') {
    return raw.sort((a, b) => {
      const fa = getFieldName(a.fieldId) || '';
      const fb = getFieldName(b.fieldId) || '';
      if (fa !== fb) return fa.localeCompare(fb, 'ja');
      return new Date(a.date) - new Date(b.date);
    });
  }
  return raw.sort((a, b) => new Date(a.date) - new Date(b.date));
});

const getPurchaseInfo = (materialName) => {
  // Find latest purchase record for this material (Fix: supplier refers to partnerName in state)
  const record = (state.records.t_material_receipt || []).find(r => r.materialName === materialName);
  return record ? { source: record.supplier || record.partnerName || '', date: record.date } : { source: '', date: '' };
};

const suggestedStepsForField = computed(() => {
  const field = selectedField.value;
  if (!field) return [];
  const process = (state.masters.m_process || []).find(p => p.name === field.crop);
  return process ? process.steps : [];
});

const isStepCompleted = (stepName) => {
  return ledgerRecords.value.some(r => r.content.includes(stepName) || (r.seeds || []).some(s => s.taskType.includes(stepName)));
};

// 台帳の特定行において、過去の重要な工程（播種など）の日付を遡って取得する
const getHistoricalStepDate = (currentRecord, stepName) => {
  const targetFieldId = String(currentRecord.fieldId);
  const targetCropId = currentRecord.cropId ? String(currentRecord.cropId) : null;
  const crop = state.masters.m_crop.find(c => String(c.id) === targetCropId) || 
               state.masters.m_crop.find(c => currentRecord.content.includes(c.name));
  
  if (!crop && !targetCropId) return '';

  // 同じ圃場の記録から、現在の記録以前のものを探す
  const pastRecords = state.records.t_work_record
    .filter(r => {
      if (String(r.fieldId) !== targetFieldId) return false;
      if (r.date > currentRecord.date) return false;
      
      // 品目一致チェック
      if (r.cropId && targetCropId && String(r.cropId) === targetCropId) return true;
      if (crop && (!r.cropId || !targetCropId)) {
        return (r.seeds || []).some(s => s.name.includes(crop.name)) || (r.content || '').includes(crop.name);
      }
      return false;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  
  const target = pastRecords.find(r => 
    (r.content || '').includes(stepName) || 
    (r.seeds || []).some(s => s.taskType === stepName || s.taskType.includes(stepName))
  );
  
  return target ? target.date : '';
};

const topWorkTypes = computed(() => 
  state.masters.m_work_type.filter(w => !['播種', '定植', '収穫'].includes(w.name))
);
const masterEquipments = computed(() => state.masters.m_equipment);

const exportCSV = () => {
  const headers = ['日付', '圃場', '作業内容', '担当者', '使用機材', '機材洗浄', '使用種苗', '使用資材'];
  const rows = filteredRecords.value.map(r => [
    r.date, getFieldName(r.fieldId), r.content, r.workerName,
    (r.equipmentIds || []).map(id => masterEquipments.value.find(e => e.id === id)?.name).join('; '),
    r.isWashed ? '済' : '未',
    (r.seeds || []).map(s => `${s.taskType}:${s.name}(${s.quantity})`).join('; '),
    (r.materials || []).map(m => `${m.name}(${m.quantity})`).join('; ')
  ]);

  const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const csvUrl = URL.createObjectURL(blob);
  link.href = csvUrl;
  link.download = `栽培管理記録台帳_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(csvUrl), 1000);
};

// Edit / Delete Logic
const isModalOpen = ref(false);
const editingRecord = ref(null);
const masterMaterials = computed(() => state.masters.m_material);
const SEED_CATEGORIES = ['種苗', '苗・種子'];
const masterSeeds = computed(() => masterMaterials.value.filter(m => SEED_CATEGORIES.includes(m.category)));
const masterOtherMaterials = computed(() => masterMaterials.value.filter(m => !SEED_CATEGORIES.includes(m.category)));

// 対象品目の統合選択肢：種苗マスタ（m_material）を主軸に、
// m_crop（既存 cropId 保存データの後方互換）を同名重複なしで末尾に追加する。
const cropOptions = computed(() => {
  const seedNames = new Set(masterSeeds.value.map(m => m.name));
  const legacyCrops = (state.masters.m_crop || []).filter(c => !seedNames.has(c.name));
  return [
    ...masterSeeds.value.map(m => ({ id: m.id, name: m.name })),
    ...legacyCrops.map(c => ({ id: c.id, name: c.name })),
  ];
});

const newSeed = ref({ name: '', taskType: '播種', quantity: '', source: '', purchaseDate: '' });
const newMaterial = ref({ name: '', quantity: '', category: '肥料' });

const selectSeedMaster = (m) => {
  newSeed.value.name = m.name;
  const receipt = (state.records.t_material_receipt || []).find(r => r.materialName === m.name);
  if (receipt) {
    newSeed.value.source = receipt.supplier || receipt.partnerName || '';
    newSeed.value.purchaseDate = receipt.date;
  }
};

const selectMaterialMaster = (m) => {
  newMaterial.value.name = m.name;
  newMaterial.value.category = m.category;
  // 自動取得：最新の購入履歴から仕入先と購入日をセット
  const receipt = state.records.t_material_receipt.find(r => r.materialName === m.name);
  if (receipt) {
    newMaterial.value.source = receipt.supplier || receipt.partnerName || '';
    newMaterial.value.purchaseDate = receipt.date;
  }
};

const addSeedToEdit = () => {
  if (!newSeed.value.name) return;
  editingRecord.value.seeds.push({ ...newSeed.value });
  newSeed.value = { name: '', taskType: '播種', quantity: '', source: '', purchaseDate: '' };
};

const addMaterialToEdit = () => {
  if (!newMaterial.value.name) return;
  editingRecord.value.materials.push({ ...newMaterial.value });
  newMaterial.value = { name: '', quantity: '', category: '肥料', source: '', purchaseDate: '' };
};

// PC版編集モーダル用のガイダンス表示（型不一致に強く、検索感度を上げた強化版）
const lastStepInfoForEdit = computed(() => {
  if (!editingRecord.value || !editingRecord.value.fieldId || !editingRecord.value.cropId) return null;
  const targetFieldId = editingRecord.value.fieldId;
  const targetCropId = editingRecord.value.cropId;
  const crop = state.masters.m_crop.find(c => String(c.id) === String(targetCropId));
  if (!crop) return null;

  const records = [...state.records.t_work_record]
    .filter(r => {
      if (r.id === editingRecord.value.id) return false;
      // 圃場の一致チェック（型に依存しない）
      if (String(r.fieldId) !== String(targetFieldId)) return false;

      // 品目の一致チェック
      if (r.cropId && String(r.cropId) === String(targetCropId)) return true;
      
      // cropIdがない場合の曖昧検索
      if (!r.cropId) {
        const seedMatch = (r.seeds || []).some(s => s.name.includes(crop.name));
        const contentMatch = r.content.includes(crop.name);
        return seedMatch || contentMatch;
      }
      return false;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (records.length === 0) return { message: `${crop.name} の過去の記録はありません` };

  const last = records[0];
  const lastTask = (last.content || '').split(',')[0] || '作業';
  return { 
    message: `履歴判別: ${last.date} に ${lastTask} を実施済みです`
  };
});

const toggleWorkItem = (name) => {
  if (!editingRecord.value.content) editingRecord.value.content = '';
  const items = editingRecord.value.content.split(',').map(s => s.trim()).filter(s => s);
  const idx = items.indexOf(name);
  if (idx === -1) items.push(name);
  else items.splice(idx, 1);
  editingRecord.value.content = items.join(', ');
};

const toggleEquipment = (id) => {
  const idx = editingRecord.value.equipmentIds.indexOf(id);
  if (idx === -1) editingRecord.value.equipmentIds.push(id);
  else editingRecord.value.equipmentIds.splice(idx, 1);
};

const openAddModal = () => {
  editingRecord.value = {
    id: '',
    date: new Date().toISOString().split('T')[0],
    fieldId: '',
    content: '',
    seeds: [],
    materials: [],
    equipmentIds: [],
    workerName: state.user.name || '',
    isWashed: false,
    washMethod: ''
  };
  isModalOpen.value = true;
};

const openEditModal = (record) => {
  editingRecord.value = JSON.parse(JSON.stringify(record));
  if (!editingRecord.value.seeds) editingRecord.value.seeds = [];
  if (!editingRecord.value.materials) editingRecord.value.materials = [];
  if (!editingRecord.value.equipmentIds) editingRecord.value.equipmentIds = [];
  isModalOpen.value = true;
};

const handleSave = () => {
  if (!editingRecord.value.fieldId) {
    actions.showToast('圃場を選択してください', 'warning');
    return;
  }
  if (!editingRecord.value.content && editingRecord.value.seeds.length === 0 && editingRecord.value.materials.length === 0 && editingRecord.value.equipmentIds.length === 0) {
    actions.showToast('作業内容または機材等を入力してください', 'warning');
    return;
  }

  if (editingRecord.value.id) {
    actions.updateWorkRecord(editingRecord.value);
    actions.showToast('作業記録を更新しました', 'success');
  } else {
    actions.addWorkRecord(editingRecord.value);
    actions.showToast('新しい作業記録を追加しました', 'success');
  }
  isModalOpen.value = false;
};

const handleDelete = (id) => {
  if (confirm('この作業記録を削除してよろしいですか？')) {
    actions.deleteWorkRecord(id);
  }
};


const handlePrint = () => {
  document.body.classList.add('jas-ledger-print-active');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
};

const handleAfterPrint = () => {
  document.body.classList.remove('jas-ledger-print-active');
};

onMounted(() => {
  window.addEventListener('afterprint', handleAfterPrint);
  // 全computedが確定した後に rowRemarks を初期化
  initRowRemarks();
});

// ledgerFlatRows（圃場・フィルタ変化）に応じて rowRemarks を再初期化
watch(ledgerFlatRows, () => {
  initRowRemarks();
});

onUnmounted(() => {
  window.removeEventListener('afterprint', handleAfterPrint);
});

// ===== Excelインポート / CSVインポート =====
const showImportModal  = ref(false);
const importStep       = ref('select'); // 'select' | 'preview' | 'done'
const importData       = ref(null);     // パース済みJSON
const importStrategy   = ref('skip');  // 'skip' | 'overwrite'
const importResult     = ref(null);    // { addedWR, overwrittenWR, skippedWR, addedMR, skippedMR }
const importFileRef    = ref(null);
const importMode       = ref('json');   // 'json' | 'csv'
const csvTargetFieldId = ref('');       // CSVインポート先圃場ID
const csvPreviewRows   = ref([]);       // CSVプレビュー行（先頭5件）
const resetFieldIds    = ref([]);       // リセット対象圃場ID

// 重複数を事前カウント（fieldId・cropId解決済み、作物/品名まで含めた厳密キー）
const importDuplicates = computed(() => {
  if (!importData.value || importMode.value === 'csv') return 0;
  const existingWR = state.records.t_work_record || [];
  const fieldMap = Object.fromEntries((state.masters.m_field || []).map(f => [f.name, f.id]));
  const cropMap  = Object.fromEntries((state.masters.m_crop  || []).map(c => [c.name, c.id]));
  const firstItem = (r) => (r.seeds?.[0]?.name) || (r.materials?.[0]?.name) || '';
  const dupKey = (r) => `${r.date}|${r.fieldId}|${(r.content || '').slice(0, 30)}|${r.cropId || ''}|${firstItem(r)}`;
  const existingKeys = new Set(existingWR.map(dupKey));
  return (importData.value.workRecords || []).filter(raw => {
    const fieldId = fieldMap[raw.fieldName] ?? raw.fieldId;
    const cropId  = cropMap[raw.cropName]   ?? raw.cropId;
    return existingKeys.has(`${raw.date}|${fieldId}|${(raw.content || '').slice(0, 30)}|${cropId || ''}|${firstItem(raw)}`);
  }).length;
});

function runFieldReset() {
  if (resetFieldIds.value.length === 0) return;
  const names = resetFieldIds.value.map(id => (state.masters.m_field || []).find(f => f.id === id)?.name || id).join('、');
  if (!confirm(`【${names}】の作業記録をすべて削除します。\nこの操作は取り消せません。よろしいですか？`)) return;
  const deleted = actions.deleteWorkRecordsByField(resetFieldIds.value);
  resetFieldIds.value = [];
  actions.showToast(`${names} の作業記録を ${deleted} 件削除しました`, 'success');
}

function openImportModal() {
  showImportModal.value = true;
  importStep.value = 'select';
  importData.value = null;
  importStrategy.value = 'skip';
  importResult.value = null;
  importMode.value = 'json';
  const aField = (state.masters.m_field || []).find(f => f.name === 'A畑');
  csvTargetFieldId.value = aField?.id || '';
  csvPreviewRows.value = [];
  resetFieldIds.value = [];
}

function closeImportModal() {
  showImportModal.value = false;
  if (importFileRef.value) importFileRef.value.value = '';
}

function onFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;

  // CSV判定（.csv または Shift-JIS テキスト）
  if (file.name.toLowerCase().endsWith('.csv')) {
    importMode.value = 'csv';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const csvText = ev.target.result;
      if (!csvTargetFieldId.value) {
        // 圃場未選択ならA畑をデフォルト
        const aField = (state.masters.m_field || []).find(f => f.name === 'A畑');
        csvTargetFieldId.value = aField?.id || (state.masters.m_field?.[0]?.id || '');
      }
      const preview = actions.parseCSVWorkRecords(csvText, csvTargetFieldId.value);
      csvPreviewRows.value = preview.slice(0, 5);
      importData.value = { _csvText: csvText, _totalRows: preview.length };
      importStep.value = 'preview';
    };
    reader.readAsText(file, 'Shift_JIS');
    return;
  }

  // JSON形式
  importMode.value = 'json';
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const json = JSON.parse(ev.target.result);
      if (!json.workRecords || !Array.isArray(json.workRecords)) {
        actions.showToast('インポート形式が正しくありません', 'error');
        return;
      }
      importData.value = json;
      importStep.value = 'preview';
    } catch {
      actions.showToast('JSONの読み込みに失敗しました', 'error');
    }
  };
  reader.readAsText(file, 'utf-8');
}

function runImport() {
  if (!importData.value) return;
  if (importMode.value === 'csv') {
    if (!csvTargetFieldId.value) {
      actions.showToast('インポート先の圃場を選択してください', 'warning');
      return;
    }
    const count = actions.importCSVWorkRecords(importData.value._csvText, csvTargetFieldId.value);
    importResult.value = { addedWR: count, skippedWR: 0, addedMR: 0 };
    importStep.value = 'done';
    return;
  }
  const result = actions.importRecordsFromJson(importData.value, importStrategy.value);
  importResult.value = result;
  importStep.value = 'done';
}

function cancelImport() {
  if (!confirm('インポートしたデータを全て削除しますか？\n（import_ で始まるIDのレコードが削除されます）')) return;
  const { del_wr, del_mr } = actions.clearImportedRecords();
  actions.showToast(`インポートデータを削除しました（作業記録 ${del_wr}件、資材購入 ${del_mr}件）`, 'success');
  closeImportModal();
}
</script>

<template>
  <div class="work-history-pro animate-slide-up">
    <!-- Pro Header -->
    <div class="header glass shadow-sm">
      <div class="title-group">
        <ClipboardList size="28" class="text-primary" />
        <div>
          <h2>現場活動履歴 <small>v.Pro</small></h2>
          <p>全ての農作業・資材投入を記録し、トレーサビリティを確保</p>
        </div>
      </div>
      <div class="header-actions">
        <!-- 💡 表示モード切り替えトグル -->
        <div class="toggle-container glass mr-4">
          <button @click="displayMode = 'list'" :class="{ active: displayMode === 'list' }" class="toggle-btn">
            <ClipboardList size="16" /> リスト形式
          </button>
          <button @click="displayMode = 'ledger'" :class="{ active: displayMode === 'ledger' }" class="toggle-btn">
            <BookOpen size="16" /> JAS台帳形式
          </button>
        </div>
        <div class="btn-group">
          <button @click="openAddModal" class="btn-primary" style="background: #16a34a; border-color: #16a34a; margin-right: 0.5rem;">
            <Plus size="18" /> 新規記録
          </button>
          <button v-if="displayMode === 'ledger'" @click="handlePrint" class="btn-primary btn-print-direct">
            <Printer size="18" /> 印刷・PDF保存
          </button>
          <button @click="exportCSV" class="btn-secondary">
            <Download size="18" /> CSV出力
          </button>
          <button @click="openImportModal" class="btn-secondary btn-import">
            <ArrowRight size="18" /> Excelインポート
          </button>
        </div>
      </div>
    </div>

    <!-- 監査モードバナー -->
    <div v-if="state.auditMode.active" class="audit-mode-banner">
      🔍 監査モード中：<strong>{{ state.auditMode.label }}</strong> の期間データのみ表示しています
      <span class="audit-lock-note">（日付フィルターは監査期間に固定）</span>
    </div>

    <!-- Smart Filters -->
    <div class="filter-bar glass mb-4">
      <div class="search-box">
        <Search size="16" class="text-muted" />
        <input v-model="searchQuery" placeholder="作業内容・担当者・圃場で検索..." />
      </div>

      <!-- 期間フィルター -->
      <div class="filter-item">
        <Calendar size="14" class="text-muted" />
        <input v-model="filterDateFrom" type="date" class="glass date-range-input" title="期間：開始日" />
        <span class="date-range-sep">〜</span>
        <input v-model="filterDateTo" type="date" class="glass date-range-input" title="期間：終了日" />
        <button
          v-if="filterDateFrom || filterDateTo"
          @click="filterDateFrom = ''; filterDateTo = ''"
          class="btn-clear-date"
          title="期間クリア"
        >✕</button>
      </div>

      <div class="filter-item ml-auto">
        <MapPin size="14" class="text-muted" />
        <select v-model="filterField" class="glass">
          <option value="all">すべての圃場</option>
          <option v-for="f in state.masters.m_field" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <p v-if="filterField === 'all' && displayMode === 'ledger'" class="hint-text">※全圃場の記録を1枚にまとめて表示しています</p>
      </div>
    </div>

    <!-- History Table (List Mode) -->
    <div v-if="displayMode === 'list'" class="table-container glass shadow-sm">
      <table class="pro-table">
        <thead>
          <tr>
            <th width="140">日付</th>
            <th width="200">圃場</th>
            <th>作業内容 / 使用資材・機材</th>
            <th width="140">担当者</th>
            <th width="100">ステータス</th>
            <th width="160" class="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredRecords" :key="r.id" class="pro-row">
            <td class="date-col">{{ r.date }}</td>
            <td class="field-col">
              <div class="field-info"><MapPin size="14" class="text-muted" /><strong>{{ getFieldName(r.fieldId) }}</strong></div>
            </td>
            <td class="content-col">
              <!-- 作物名チップ -->
              <div v-if="getCropName(r)" class="crop-chip">{{ getCropName(r) }}</div>
              <div class="main-content">{{ r.content }}</div>
              <div class="sub-details">
                <div v-if="r.seeds?.length || r.materials?.length" class="assets">
                  <Sprout v-if="r.seeds?.length" size="14" class="text-primary" />
                  <!-- 種苗名を直接表示（最大3件）、4件以上は「+X件」 -->
                  <span v-if="r.seeds?.length">
                    {{ r.seeds.slice(0, 3).map(s => s.name).join('・') }}
                    <em v-if="r.seeds.length > 3" class="more-badge">+{{ r.seeds.length - 3 }}件</em>
                  </span>
                  <Plus v-if="r.materials?.length" size="14" class="text-blue" />
                  <!-- 資材名を直接表示（最大2件） -->
                  <span v-if="r.materials?.length">
                    {{ r.materials.slice(0, 2).map(m => m.name).join('・') }}
                    <em v-if="r.materials.length > 2" class="more-badge">+{{ r.materials.length - 2 }}件</em>
                  </span>
                </div>
                <div v-if="r.equipmentIds?.length" class="equipments">
                  <Tractor size="14" class="text-muted" />
                  <span>機材: {{ r.equipmentIds.length }}基</span>
                  <span v-if="r.isWashed" class="washed-badge">洗浄済</span>
                </div>
                <!-- noteに収穫量が記録されている場合に表示 -->
                <div v-if="r.note && r.note.includes('収穫量')" class="harvest-note">
                  🌾 {{ r.note.match(/収穫量:\s*[^\s/]+/)?.[0] || '' }}
                </div>
              </div>
            </td>
            <td><div class="worker-info"><User size="14" class="text-muted" /><span>{{ r.workerName }}</span></div></td>
            <td><span class="status-pill complete">完了</span></td>
            <td class="actions">
              <button @click="openEditModal(r)" class="btn-action view">編集</button>
              <button @click="handleDelete(r.id)" class="btn-action delete">削除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="filteredRecords.length === 0" class="empty-placeholder">
        <ClipboardList size="48" class="text-muted mb-4" />
        <p>該当する作業記録が見つかりません</p>
      </div>
    </div>

    <!-- JAS Ledger View (Ledger Mode) -->
    <div v-else class="ledger-view-container">
      <div class="jas-document-wrapper glass shadow-sm">
        <!-- 💡 タイムラインを印刷エリア外（書類の外）に配置してレイアウト干渉を完全に防ぐ -->
        <div class="process-timeline-box mb-4 no-print" v-if="displayMode === 'ledger' && filterField !== 'all'">
          <div class="timeline-label">生産工程スケジュール状況</div>
          <div class="timeline-track">
            <div 
              v-for="(step, idx) in suggestedStepsForField" 
              :key="idx"
              class="timeline-step"
              :class="{ completed: isStepCompleted(step) }"
            >
              <div class="step-dot"></div>
              <div class="step-name">{{ step }}</div>
            </div>
          </div>
        </div>

        <!-- 💡 印刷時のブラウザ設定の案内メッセージ -->
        <div class="print-guidance-banner glass mb-4 no-print animate-slide-up">
          <Info size="18" class="text-primary" />
          <div class="banner-content">
            <strong>【印刷・PDF出力時のお願い】</strong>
            <span>印刷画面が表示されたら、設定項目（表示されない場合は「詳細設定」を展開）の<strong>「レイアウト」を「横」</strong>に変更してください。</span>
          </div>
        </div>

        <div id="jas-ledger-document" class="jas-document">
          <!-- 💡 タイトル、生産者、承認情報を画像通り横並びに配置 -->
          <div class="jas-top-bar">
            <h1 class="jas-title">生産行程管理記録</h1>
            <div class="jas-producer">生産者：(株)AGRI KAKUIDA</div>
            <div class="jas-meta">
              <div>様式No：C-31</div>
              <div>承認日：13.06.24</div>
            </div>
          </div>

          <!-- 💡 添付画像と同一の見出し・メタ情報テーブル（インプット化） -->
          <table class="jas-meta-table">
            <tbody>
              <tr>
                <td class="meta-label" width="12%">圃場：</td>
                <td class="meta-value p-0" width="21%">
                  <input v-model="ledgerFieldName" class="meta-input" placeholder="" />
                </td>
                <td class="meta-label" width="12%">農産物名：</td>
                <td class="meta-value p-0" width="21%">
                  <input v-model="ledgerCropName" class="meta-input" placeholder="" />
                </td>
                <td class="meta-label" width="12%">年度：</td>
                <td class="meta-value p-0" width="22%">
                  <input v-model="ledgerEraYear" class="meta-input" placeholder="" />
                </td>
              </tr>
            </tbody>
          </table>

          <!-- 💡 パーセンテージ幅を適用し、印字の伸縮に完全対応したメインテーブル -->
          <table class="jas-main-table">
            <thead>
              <tr>
                <th rowspan="2" width="6%">日付</th>
                <th v-if="filterField === 'all'" rowspan="2" width="6%">圃場</th>
                <th rowspan="2" width="14%">作業</th>
                <th rowspan="2" width="14%">種苗及び資材名</th>
                <th rowspan="2" width="5%">数量</th>
                <th colspan="2" width="17%">入手先・入手日</th>
                <th colspan="2" width="13%">機械・器具</th>
                <th colspan="5" width="29%">特記事項</th>
                <th rowspan="2" class="no-print save-col-th" width="7%" style="min-width: 90px;">保存</th>
              </tr>
              <tr>
                <!-- 入手先・入手日の下 -->
                <th width="10%">入手先</th>
                <th width="7%">入手日</th>
                <!-- 機械・器具の下 -->
                <th width="10%">機械・器具名</th>
                <th width="3%">洗浄記録</th>
                <!-- 特記事項の下 -->
                <th width="7%">播種日</th>
                <th width="7%">定植日</th>
                <th width="7%">収穫始め</th>
                <th width="7%">収穫終わり</th>
                <th width="5%">備考</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="r in ledgerFlatRows" 
                :key="r.id" 
                class="work-row"
                :class="{ 'carry-over': r.isCarryOver, 'defect': r.isDefect }"
              >
                <!-- 日付 -->
                <td class="p-0"><input class="cell-input text-center" :value="getCellVal(r.recordId,'date',r.date)" @input="setCellVal(r.recordId,'date',$event.target.value)" /></td>
                <!-- 圃場（すべての圃場表示時のみ） -->
                <td v-if="filterField === 'all'" class="p-0 col-field text-center">
                  <input class="cell-input text-center" :value="getCellVal(r.recordId,'fieldName',r.fieldName)" @input="setCellVal(r.recordId,'fieldName',$event.target.value)" />
                </td>
                <!-- 作業（作物名 + 作業内容）: 2行インライン編集 -->
                <td class="p-0">
                  <div class="work-cell-stack">
                    <input class="cell-input cell-crop" :value="getCellVal(r.recordId,'cropName',r.cropName)" @input="setCellVal(r.recordId,'cropName',$event.target.value)" />
                    <input :class="['cell-input', 'cell-work', ledgerWorkClass(r)]" :value="getCellVal(r.recordId,'workType',r.workType || r.workName)" @input="setCellVal(r.recordId,'workType',$event.target.value)" />
                  </div>
                </td>
                <!-- 種苗及び資材名 -->
                <td class="p-0"><input class="cell-input" :value="getCellVal(r.recordId,'itemName',r.itemName)" @input="setCellVal(r.recordId,'itemName',$event.target.value)" /></td>
                <!-- 数量 -->
                <td class="p-0"><input class="cell-input text-center" :value="getCellVal(r.recordId,'qty',r.qty)" @input="setCellVal(r.recordId,'qty',$event.target.value)" /></td>
                <!-- 入手先 -->
                <td class="p-0"><input class="cell-input" :value="getCellVal(r.recordId,'source',r.source)" @input="setCellVal(r.recordId,'source',$event.target.value)" /></td>
                <!-- 入手日 -->
                <td class="p-0"><input class="cell-input text-center" :value="getCellVal(r.recordId,'purchaseDate',r.purchaseDate)" @input="setCellVal(r.recordId,'purchaseDate',$event.target.value)" /></td>
                <!-- 機械・器具名 -->
                <td class="p-0"><input class="cell-input" :value="getCellVal(r.recordId,'equipment',r.equipment)" @input="setCellVal(r.recordId,'equipment',$event.target.value)" /></td>
                <!-- 洗浄方法: 水洗い/泥払い等を文字で記録（公式Excel様式準拠） -->
                <td class="p-0 col-wash">
                  <input class="cell-input text-center"
                         :value="getCellVal(r.recordId,'wash', washDefault(r, getCellVal(r.recordId,'equipment',r.equipment)))"
                         @input="setCellVal(r.recordId,'wash',$event.target.value)" />
                </td>
                <!-- 播種日 -->
                <td class="p-0"><input class="cell-input text-center" :value="getCellVal(r.recordId,'sowingDate',r.sowingDate)" @input="setCellVal(r.recordId,'sowingDate',$event.target.value)" /></td>
                <!-- 定植日 -->
                <td class="p-0"><input class="cell-input text-center" :value="getCellVal(r.recordId,'plantingDate',r.plantingDate)" @input="setCellVal(r.recordId,'plantingDate',$event.target.value)" /></td>
                <!-- 収穫始め -->
                <td class="p-0"><input class="cell-input text-center" :value="getCellVal(r.recordId,'harvestStart',r.harvestStart)" @input="setCellVal(r.recordId,'harvestStart',$event.target.value)" /></td>
                <!-- 収穫終わり -->
                <td class="p-0"><input class="cell-input text-center" :value="getCellVal(r.recordId,'harvestEnd',r.harvestEnd)" @input="setCellVal(r.recordId,'harvestEnd',$event.target.value)" /></td>
                <!-- 備考（純粋な備考のみ） -->
                <td class="p-0"><input v-model="rowRemarks[r.recordId]" class="cell-input" placeholder="" @input="rowRemarksEdited.add(r.recordId)" /></td>
                <!-- 保存ボタン（印刷時非表示） -->
                <td class="no-print save-cell"
                    :class="{
                      'has-error':  rowSaveErrors[r.recordId]?.length > 0,
                      'is-saved':   rowSavedFlag[r.recordId]
                    }">
                  <div style="display: flex; gap: 4px; justify-content: center; align-items: center; width: 100%; height: 100%;">
                    <button
                      class="btn-row-save"
                      :class="{ 'saved': rowSavedFlag[r.recordId] }"
                      :title="rowSaveErrors[r.recordId]?.length > 0 ? rowSaveErrors[r.recordId].join('\n') : 'この行の変更を保存する'"
                      @click="saveLedgerRow(r.recordId, r)"
                    >
                      <Save size="13" />
                      <span class="btn-row-save-label">
                        {{ rowSaveErrors[r.recordId]?.length > 0 ? 'エラー' : rowSavedFlag[r.recordId] ? '済✓' : '保存' }}
                      </span>
                    </button>
                    <!-- 削除ボタン（仮想レコードも削除可能に） -->
                    <button
                      @click="handleDelete(r.recordId)"
                      title="この作業記録を削除"
                      style="display: flex; align-items: center; justify-content: center; width: 42px; height: 40px; border: 1px solid #fca5a5; background: #fee2e2; color: #dc2626; border-radius: 6px; cursor: pointer; padding: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.2s;"
                      onmouseover="this.style.background='#f87171'; this.style.color='white'"
                      onmouseout="this.style.background='#fee2e2'; this.style.color='#dc2626'"
                    >
                      <Trash2 size="18" />
                    </button>
                  </div>
                  <div v-if="rowSaveErrors[r.recordId]?.length > 0" class="row-error-tooltip">
                    <span v-for="(e, i) in rowSaveErrors[r.recordId]" :key="i">{{ e }}</span>
                  </div>
                </td>
              </tr>
              
              <!-- 残りの空行を画像のように描画してA4のレイアウト高さを保つ（13列） -->
              <tr v-for="i in Math.max(0, 20 - ledgerFlatRows.length)" :key="'empty'+i" class="empty-row">
                <td>&nbsp;</td>
                <td v-if="filterField === 'all'"></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div class="jas-footer-grid">
            <div class="footer-box">
              <div class="box-label">野菜に関する情報（発育不良・理由など）</div>
              <div class="box-content">
                <textarea v-model="ledgerCropInfo" class="jas-textarea"></textarea>
              </div>
            </div>
            <div class="footer-box">
              <div class="box-label">備考</div>
              <div class="box-content">
                <textarea v-model="ledgerRemarks" class="jas-textarea"></textarea>
              </div>
            </div>
          </div>

          <!-- 💡 肥料目安部分を画像と全く同じ2列・2段のグリッドレイアウトへ -->
          <div class="jas-guideline">
            <div class="guideline-title">肥料目安 10a(100m x 100m)あたり</div>
            <div class="guideline-items">
              <div class="guideline-item">カキライム 100kg~200kg</div>
              <div class="guideline-item">骨粉 60kg~100kg</div>
              <div class="guideline-item">鶏糞 300kg~500kg</div>
              <div class="guideline-item">油かす100kg~200kg</div>
              <div class="guideline-item">味まる4号 200kg~350kg</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <!-- Edit Modal -->
    <Transition name="fade">
      <div v-if="isModalOpen" class="overlay glass-heavy">
        <div class="modal card glass scale-up">
          <div class="modal-header">
            <div class="title-wrap"><ClipboardList size="24" class="text-primary" /><h3>{{ editingRecord.id ? '作業記録の詳細・編集' : '作業記録の新規追加' }}</h3></div>
            <button @click="isModalOpen = false" class="btn-close"><X size="20" /></button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group"><label>実施日</label><input v-model="editingRecord.date" type="date" /></div>
              <div class="form-group"><label>実施圃場</label>
                <select v-model="editingRecord.fieldId">
                  <option v-for="f in state.masters.m_field" :key="f.id" :value="f.id">{{ f.name }}</option>
                </select>
              </div>
              <div class="form-group" v-if="editingRecord.fieldId"><label>対象品目</label>
                <select v-model="editingRecord.cropId">
                  <option value="">-- 品目を選択 --</option>
                  <option v-for="c in cropOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <!-- Guidance for PC -->
                <div v-if="lastStepInfoForEdit" class="guidance-box-pc animate-slide-up mt-2">
                  <Info size="14" />
                  <span>{{ lastStepInfoForEdit.message }}</span>
                </div>
              </div>
              <div class="form-group full"><label>作業項目の選択</label>
                <div class="chip-container">
                  <button v-for="w in topWorkTypes" :key="w.id" @click="toggleWorkItem(w.name)" :class="{ active: (editingRecord.content || '').includes(w.name) }" class="chip-btn">{{ w.name }}</button>
                </div>
                <label class="mt-2">作業内容の詳細</label><textarea v-model="editingRecord.content" rows="2"></textarea>
              </div>
              <div class="form-group full"><label>使用機材</label>
                <div class="chip-container mb-2">
                  <button v-for="e in masterEquipments" :key="e.id" @click="toggleEquipment(e.id)" :class="{ active: editingRecord.equipmentIds.includes(e.id) }" class="chip-btn eq">{{ e.name }}</button>
                </div>
                <div class="wash-method-select">
                  <label class="clean-check"><input type="checkbox" v-model="editingRecord.isWashed" /> 洗浄・清掃済み</label>
                  <div v-if="editingRecord.isWashed" class="chip-container mini ml-4">
                    <button @click="editingRecord.washMethod = '水洗い'" :class="{ active: editingRecord.washMethod === '水洗い' }" class="chip-btn mini">水洗い</button>
                    <button @click="editingRecord.washMethod = '泥落とし'" :class="{ active: editingRecord.washMethod === '泥落とし' }" class="chip-btn mini">泥落とし</button>
                  </div>
                </div>
              </div>

              <!-- Section A: Seeds (Restored & Improved) -->
              <div class="form-group full border-top-dash pt-3">
                <div class="sub-header"><Sprout size="16" /> 種苗の登録</div>
                <div class="chip-container mb-2">
                  <button v-for="m in masterSeeds" :key="m.id" @click="selectSeedMaster(m)" class="chip-btn mini" type="button">{{ m.name }}</button>
                </div>
                <div class="data-row-list mb-2">
                  <div v-for="(s, idx) in editingRecord.seeds" :key="idx" class="item-tag">
                    <span>{{ s.taskType }}: {{ s.name }} ({{ s.quantity }})</span>
                    <button @click="editingRecord.seeds.splice(idx, 1)"><X size="14" /></button>
                  </div>
                </div>
                <div class="entry-form">
                  <input v-model="newSeed.name" placeholder="種苗名" />
                  <select v-model="newSeed.taskType">
                    <option v-for="t in ['播種', '定植', '収穫開始', '収穫終了']" :key="t" :value="t">{{ t }}</option>
                  </select>
                  <input v-model="newSeed.quantity" placeholder="数量" />
                </div>
                <div class="entry-form mt-1 bg-info-light">
                  <span class="form-label-mini">入手先・日:</span>
                  <input v-model="newSeed.source" placeholder="入手先" class="small-input" />
                  <input v-model="newSeed.purchaseDate" type="date" class="small-input" />
                  <button @click="addSeedToEdit" class="btn-add-item" type="button">追加</button>
                </div>
              </div>

              <div class="form-group full border-top-dash pt-3"><div class="sub-header"><Plus size="16" /> 資材の使用</div>
                <div class="chip-container mb-2">
                  <button v-for="m in masterOtherMaterials" :key="m.id" @click="selectMaterialMaster(m)" class="chip-btn mini" type="button">{{ m.name }}</button>
                </div>
                <div class="data-row-list mb-2"><div v-for="(m, idx) in editingRecord.materials" :key="idx" class="item-tag blue"><span>{{ m.name }} ({{ m.quantity }})</span><button @click="editingRecord.materials.splice(idx, 1)"><X size="14" /></button></div></div>
                <div class="entry-form">
                  <input v-model="newMaterial.name" placeholder="肥料・農薬名" />
                  <input v-model="newMaterial.quantity" placeholder="数量" />
                </div>
                <div class="entry-form mt-1 bg-info-light">
                  <span class="form-label-mini">入手先・日:</span>
                  <input v-model="newMaterial.source" placeholder="入手先" class="small-input" />
                  <input v-model="newMaterial.purchaseDate" type="date" class="small-input" />
                  <button @click="addMaterialToEdit" class="btn-add-item" type="button">追加</button>
                </div>
              </div>
              <div class="form-group"><label>担当者</label><input v-model="editingRecord.workerName" /></div>
            </div>
          </div>
          <div class="modal-footer"><button @click="isModalOpen = false" class="btn-secondary">キャンセル</button><button @click="handleSave" class="btn-primary"><Save size="18" /> 保存する</button></div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ===== Excelインポートモーダル ===== -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showImportModal" class="modal-overlay" @click.self="closeImportModal"></div>
    </Transition>
    <Transition name="slide-up">
      <div v-if="showImportModal" class="import-modal">

        <!-- ヘッダー -->
        <div class="import-modal-header">
          <div class="import-modal-title">
            <ArrowRight size="20" class="import-icon" />
            <h3>Excelデータ インポート</h3>
          </div>
          <button @click="closeImportModal" class="btn-close-modal"><X size="20" /></button>
        </div>

        <!-- ── STEP 1: ファイル選択 ── -->
        <div v-if="importStep === 'select'" class="import-body">
          <div class="import-info-box">
            <p>CSVファイル（Shift-JIS）またはJSON形式のインポートデータを選択してください。</p>
            <p class="import-info-sub">CSV列順: 日付, 種苗名, 作業名, 育成タグ, 種苗及び資材名, 数量, 入手先, 購入日, 機械器具, 洗浄方法, 播種日, 定植日, 収穫始め, 収穫終わり, 備考</p>
          </div>
          <label class="file-pick-area">
            <input ref="importFileRef" type="file" accept=".json,.csv" @change="onFileChange" class="hidden-file-input" />
            <div class="file-pick-inner">
              <ArrowRight size="32" class="text-muted" />
              <span>CSVまたはJSONファイルを選択</span>
              <small>Shift-JIS CSV / import_data.json</small>
            </div>
          </label>

          <!-- 圃場作業記録リセット -->
          <div class="import-reset-section">
            <div class="import-reset-title">圃場の作業記録リセット（インポート前準備）</div>
            <p class="import-reset-desc">特定の圃場の作業記録を全削除します。他の圃場・資材購入記録等は影響を受けません。</p>
            <div class="reset-field-list">
              <label v-for="f in state.masters.m_field" :key="f.id" class="reset-field-item">
                <input type="checkbox" v-model="resetFieldIds" :value="f.id" />
                {{ f.name }}
              </label>
            </div>
            <button
              v-if="resetFieldIds.length > 0"
              class="btn-reset-field"
              @click="runFieldReset"
            >
              選択した圃場の作業記録を削除（{{ resetFieldIds.length }}圃場）
            </button>
          </div>
        </div>

        <!-- ── STEP 2: プレビュー & 選択 ── -->
        <div v-else-if="importStep === 'preview'" class="import-body">

          <!-- CSV モード -->
          <template v-if="importMode === 'csv'">
            <div class="preview-stats">
              <div class="stat-chip">
                <span class="chip-label">作業記録</span>
                <span class="chip-val">{{ importData._totalRows }}件</span>
              </div>
            </div>
            <div class="form-group mt-2" style="display:flex;align-items:center;gap:0.75rem;">
              <label style="font-weight:700;white-space:nowrap;">インポート先の圃場</label>
              <select v-model="csvTargetFieldId" class="glass" style="flex:1">
                <option value="">-- 選択してください --</option>
                <option v-for="f in state.masters.m_field" :key="f.id" :value="f.id">{{ f.name }}</option>
              </select>
            </div>
            <div class="csv-preview-table mt-2">
              <p style="font-size:0.8rem;color:#64748b;margin-bottom:0.5rem;">先頭5件プレビュー：</p>
              <table style="width:100%;font-size:0.75rem;border-collapse:collapse;">
                <thead><tr style="background:#f1f5f9;">
                  <th style="padding:4px 6px;text-align:left;">日付</th>
                  <th style="padding:4px 6px;text-align:left;">種苗名</th>
                  <th style="padding:4px 6px;text-align:left;">作業</th>
                  <th style="padding:4px 6px;text-align:left;">播種日</th>
                  <th style="padding:4px 6px;text-align:left;">収穫始め</th>
                </tr></thead>
                <tbody>
                  <tr v-for="(r, i) in csvPreviewRows" :key="i" style="border-top:1px solid #e2e8f0;">
                    <td style="padding:4px 6px;">{{ r.date }}</td>
                    <td style="padding:4px 6px;">{{ r.cropName }}</td>
                    <td style="padding:4px 6px;">{{ r.content }}</td>
                    <td style="padding:4px 6px;">{{ r.sowingDateOverride }}</td>
                    <td style="padding:4px 6px;">{{ r.harvestStartOverride }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="import-footer-btns mt-3">
              <button @click="importStep = 'select'" class="btn-secondary">← 戻る</button>
              <button @click="runImport" class="btn-import-run" :disabled="!csvTargetFieldId">
                {{ csvTargetFieldId ? `${importData._totalRows}件を${(state.masters.m_field||[]).find(f=>f.id===csvTargetFieldId)?.name||''}にインポート` : '圃場を選択してください' }}
              </button>
            </div>
          </template>

          <!-- JSON モード（既存） -->
          <template v-else>
            <div class="preview-stats">
              <div class="stat-chip">
                <span class="chip-label">作業記録</span>
                <span class="chip-val">{{ importData.workRecords.length }}件</span>
              </div>
              <div class="stat-chip">
                <span class="chip-label">資材購入記録</span>
                <span class="chip-val">{{ importData.materialReceipts.length }}件</span>
              </div>
              <div class="stat-chip">
                <span class="chip-label">ソース</span>
                <span class="chip-val">{{ importData.source }}</span>
              </div>
            </div>
            <div v-if="importDuplicates > 0" class="dup-warning">
              <div class="dup-warning-title">⚠️ 重複データが {{ importDuplicates }}件 検出されました</div>
              <p class="dup-warning-desc">既存の作業記録と日付・圃場・作業内容が一致するデータが見つかりました。<br>取り込み方法を選択してください。</p>
              <div class="strategy-options">
                <label class="strategy-option" :class="{ selected: importStrategy === 'skip' }">
                  <input type="radio" v-model="importStrategy" value="skip" />
                  <div class="strategy-text"><strong>新規データのみ追加（推奨）</strong><small>重複する{{ importDuplicates }}件はスキップし、新しいデータのみ追加します</small></div>
                </label>
                <label class="strategy-option" :class="{ selected: importStrategy === 'overwrite' }">
                  <input type="radio" v-model="importStrategy" value="overwrite" />
                  <div class="strategy-text"><strong>重複データを上書き</strong><small>既存の{{ importDuplicates }}件をExcelのデータで上書きします（元に戻せません）</small></div>
                </label>
              </div>
            </div>
            <div v-else class="no-dup-notice">✅ 重複データはありません。全件新規追加されます。</div>
            <div class="import-footer-btns">
              <button @click="importStep = 'select'" class="btn-secondary">← 戻る</button>
              <button @click="runImport" class="btn-import-run">インポート実行</button>
            </div>
          </template>

        </div>

        <!-- ── STEP 3: 完了 ── -->
        <div v-else-if="importStep === 'done'" class="import-body">
          <div class="import-done-icon">✅</div>
          <h4 class="import-done-title">インポート完了</h4>
          <div class="done-stats">
            <div class="done-row"><span>作業記録 追加</span><strong>{{ importResult.addedWR }}件</strong></div>
            <div class="done-row" v-if="importResult.overwrittenWR"><span>作業記録 上書き</span><strong>{{ importResult.overwrittenWR }}件</strong></div>
            <div class="done-row" v-if="importResult.skippedWR"><span>作業記録 スキップ</span><strong>{{ importResult.skippedWR }}件</strong></div>
            <div class="done-row"><span>資材購入記録 追加</span><strong>{{ importResult.addedMR }}件</strong></div>
            <div class="done-row" v-if="importResult.skippedMR"><span>資材購入記録 スキップ</span><strong>{{ importResult.skippedMR }}件</strong></div>
          </div>
          <p class="done-note">データはクラウドに自動保存されました。</p>
          <div style="display:flex; gap:8px; margin-top:1rem;">
            <button @click="closeImportModal" class="btn-primary" style="flex:1">閉じる</button>
            <button @click="cancelImport" class="btn-cancel-import">このインポートを取り消す</button>
          </div>
        </div>

      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.work-history-pro { padding: 1.5rem; width: 100%; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding: 1.25rem 2rem; border-radius: 16px; background: white; border: 1px solid #e2e8f0; }
.title-group { display: flex; gap: 1rem; align-items: center; }
.title-group h2 { font-size: 1.5rem; font-weight: 900; margin: 0; }
.title-group p { color: #64748b; font-size: 0.85rem; margin: 0; }

.filter-bar { padding: 0.75rem 1.25rem; border-radius: 12px; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; background: white; border: 1px solid #e2e8f0; }
.search-box { display: flex; align-items: center; gap: 0.5rem; background: #f1f5f9; padding: 0.5rem 1.25rem; border-radius: 999px; width: 350px; }
.search-box input { background: transparent; border: none; font-size: 0.9rem; flex: 1; outline: none; }
.filter-item { display: flex; align-items: center; gap: 0.4rem; }
.date-range-input { width: 130px; padding: 0.35rem 0.6rem; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 0.85rem; background: #f8fafc; }
.date-range-sep { color: #94a3b8; font-size: 0.85rem; }
.btn-clear-date { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 0.9rem; padding: 0 0.2rem; line-height: 1; }
.btn-clear-date:hover { color: #ef4444; }
.ml-auto { margin-left: auto; display: flex; align-items: center; gap: 1rem; }

.table-container { border-radius: 16px; overflow: hidden; background: white; border: 1px solid #e2e8f0; }

.pro-table { width: 100%; border-collapse: collapse; text-align: left; }
.pro-table th { background: #f8fafc; padding: 1rem 1.5rem; font-weight: 800; color: #64748b; font-size: 0.75rem; text-transform: uppercase; border-bottom: 2px solid #f1f5f9; }
.pro-table td { padding: 1.25rem 1.5rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.pro-row:hover { background: #f8fafc; }

.crop-chip { display: inline-block; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 999px; padding: 0.1rem 0.65rem; font-size: 0.72rem; font-weight: 800; margin-bottom: 0.3rem; }
.main-content { font-weight: 800; color: #1e293b; font-size: 1.05rem; margin-bottom: 0.5rem; }
.sub-details { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
.assets, .equipments { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; font-weight: 700; color: #64748b; }
.washed-badge { background: #dcfce7; color: #166534; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.65rem; }
.more-badge { font-style: normal; background: #f1f5f9; color: #64748b; padding: 0 0.3rem; border-radius: 4px; font-size: 0.65rem; margin-left: 0.2rem; }
.harvest-note { display: flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; font-weight: 700; color: #92400e; background: #fef3c7; padding: 0.1rem 0.5rem; border-radius: 4px; }

.status-pill { padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.7rem; font-weight: 900; }
.status-pill.complete { background: #f0fdf4; color: #16a34a; }

.actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
.btn-action { padding: 0.4rem 1rem; border-radius: 8px; font-size: 0.85rem; font-weight: 800; border: 1px solid #e2e8f0; cursor: pointer; transition: 0.2s; }
.btn-action.view { background: #f1f5f9; color: #475569; }
.btn-action.delete { background: #fff1f2; color: #e11d48; }

.hint-text { font-size: 0.7rem; color: #ef4444; font-weight: 700; }

.header-actions { display: flex; align-items: center; gap: 1rem; }
.toggle-container { display: flex; padding: 0.25rem; background: #f1f5f9; border-radius: 999px; border: 1px solid #e2e8f0; }
.toggle-btn { display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 1rem; font-size: 0.8rem; font-weight: 700; border-radius: 999px; background: transparent; border: none; color: #64748b; cursor: pointer; transition: 0.2s; }
.toggle-btn.active { background: white; color: #1e293b; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.mr-4 { margin-right: 1rem; }

.btn-print-direct { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.25rem; font-size: 0.85rem; font-weight: 800; border-radius: 8px; cursor: pointer; background: #16a34a; color: white; border: none; }
.btn-print-direct:hover { background: #15803d; }

.ledger-view-container { margin-top: 1rem; }
.ledger-placeholder { background: white; padding: 6rem 2rem; border-radius: 16px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ledger-placeholder h4 { font-size: 1.25rem; font-weight: 900; color: #1e293b; margin-top: 1rem; }
.ledger-placeholder p { font-size: 0.9rem; color: #64748b; }

.jas-document-wrapper { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow-x: auto; padding: 1.5rem; }

.jas-document {
  flex: 1;
  padding: 1.5cm;
  overflow-y: auto;
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
  color: #1e293b;
  background: #fafafa;
  border-radius: 12px;
  box-shadow: 0 10px 30px -5px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.02);
  border: 1px solid #e2e8f0;
  transition: all 0.3s ease;
}

.jas-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 1.25rem;
  padding: 0 0.25rem;
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
  color: #0f172a;
}

.jas-title { font-size: 2.1rem; font-weight: 800; margin: 0; letter-spacing: 2px; color: #0f172a; }
.jas-producer { font-size: 1.55rem; font-weight: 800; margin: 0; color: #0f172a; }
.jas-meta { text-align: right; font-size: 0.85rem; font-weight: 800; line-height: 1.45; color: #0f172a; }

.jas-meta-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.75rem;
  border: 2.5px solid #1e293b;
  table-layout: fixed;
  background: #fff;
  transition: border-color 0.3s;
}
.jas-meta-table td {
  border: 1px solid #cbd5e1;
  padding: 8px 12px;
  font-size: 0.95rem;
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
  font-weight: 800;
  color: #1e293b;
}
.jas-meta-table .meta-label {
  text-align: center;
  background: #f4f8f6;
  border-right: 1px solid #cbd5e1;
  color: #1e293b;
}
.jas-meta-table .meta-value { text-align: center; font-size: 1.05rem; }

.jas-main-table {
  width: 100%;
  border-collapse: collapse;
  border: 2.5px solid #1e293b;
  table-layout: fixed;
  background: #fff;
}
.jas-main-table th, .jas-main-table td {
  border: 1px solid #cbd5e1;
  padding: 8px 6px;
  font-size: 0.85rem;
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
  line-height: 1.4;
  color: #1e293b;
  transition: background-color 0.25s, border-color 0.3s;
}
.jas-main-table th {
  background: #f4f8f6;
  font-weight: bold;
  text-align: center;
  border-bottom: 2px solid #1e293b;
  color: #0f172a;
}
.jas-main-table td { background: #fff; height: 44px; }
.jas-main-table th.sub-th-empty { border-top: none; }

.work-row:hover, .empty-row:hover { background-color: rgba(22, 163, 74, 0.025) !important; }
.work-row:hover td, .empty-row:hover td { background-color: rgba(22, 163, 74, 0.025) !important; }

/* 💡 新しい作業セルのレイアウトスタイル */
.work-cell {
  padding: 0 8px !important;
  vertical-align: middle !important;
}
.work-flex {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  gap: 8px;
}
.crop-name-left {
  text-align: left;
  font-weight: bold;
  color: #1e293b;
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
}

/* 💡 新しい作業タイプのバッジデザイン */
.work-type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  font-size: 0.75rem;
  font-weight: 800;
  border-radius: 4px;
  line-height: 1.2;
  white-space: nowrap;
  text-align: right;
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
  border: 1px solid transparent;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* 💡 作業バッジの色付け（淡いパステルカラー） */
.badge-sowing {
  background-color: #e0f2fe; /* 播種: 薄い青 */
  color: #0369a1;
  border-color: #bae6fd;
}
.badge-planting {
  background-color: #ffedd5; /* 定植: 薄いオレンジ */
  color: #c2410c;
  border-color: #fed7aa;
}
.badge-harvest-end {
  background-color: #fee2e2; /* 収穫終了: 薄い赤 */
  color: #b91c1c;
  border-color: #fecaca;
}
.badge-harvest-start {
  background-color: #f3e8ff; /* 収穫開始: 薄い紫 */
  color: #6b21a8;
  border-color: #e9d5ff;
}
.badge-carry-over {
  background-color: #fef9c3; /* 持ち越し: 薄い黄/アンバー */
  color: #854d0e;
  border-color: #fef08a;
}
.badge-other {
  background-color: #f1f5f9; /* その他: 薄いグレー */
  color: #475569;
  border-color: #e2e8f0;
}

/* 💡 持ち越し分・発育不良行の強調（公式Excel様式準拠） */
/* 前期持ち越し: Excelと同じく赤文字で表示 */
.work-row.carry-over td {
  background-color: #fffefb !important;
}
.work-row.carry-over .cell-input,
.work-row.carry-over td {
  color: #dc2626 !important;
}
.work-row.defect td {
  background-color: #e5e7eb !important; /* 発芽不良・発育不良: Excelと同じ薄いグレー網掛け */
}
.work-row.defect:hover td {
  background-color: #d1d5db !important;
}

/* 💡 台帳の作業セル色分け（公式Excel様式準拠） */
.cell-input.wt-sowing        { background-color: #dbeafe !important; color: #1d4ed8 !important; } /* 播種: 水色 */
.cell-input.wt-planting      { background-color: #dcfce7 !important; color: #15803d !important; } /* 定植: 薄緑 */
.cell-input.wt-harvest-start { background-color: #fce7f3 !important; color: #be185d !important; } /* 収穫開始: 薄ピンク */
.cell-input.wt-harvest-end   { background-color: #fecaca !important; color: #b91c1c !important; } /* 収穫終了: ピンク */

.item-name-cell { text-align: left; padding-left: 8px !important; font-weight: bold; }
.source-cell { text-align: left; padding-left: 8px !important; font-weight: bold; color: #1e293b; }
.eq-name-cell { text-align: left; padding-left: 6px !important; }

.meta-input {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
  font-size: 1.05rem;
  font-weight: 800;
  text-align: center;
  padding: 10px 12px;
  outline: none;
  color: #0f172a;
  box-sizing: border-box;
  transition: all 0.25s ease;
}
.meta-input:focus {
  background: #f0fdf4 !important;
  box-shadow: inset 0 0 0 2px rgba(22, 163, 74, 0.15);
}

.row-remark-input {
  width: 100%;
  height: 100%;
  min-height: 34px;
  border: none;
  background: transparent;
  font-size: 0.85rem;
  padding: 6px 8px;
  outline: none;
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
  font-weight: bold;
  color: #1e293b;
  box-sizing: border-box;
  transition: all 0.25s ease;
}
.row-remark-input:focus {
  background: #f0fdf4 !important;
  box-shadow: inset 0 0 0 2px rgba(22, 163, 74, 0.15);
}

/* 台帳セル汎用インライン編集 */
.cell-input {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 32px;
  border: none;
  background: transparent;
  font-size: 0.82rem;
  padding: 4px 5px;
  outline: none;
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
  font-weight: bold;
  color: #1e293b;
  box-sizing: border-box;
}
.cell-input:focus {
  background: #f0fdf4 !important;
  box-shadow: inset 0 0 0 2px rgba(22, 163, 74, 0.15);
}
/* 作業セル: フレックスで縦に2段 */
.work-cell-stack {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 34px;
}
.work-cell-stack .cell-input {
  flex: 1;
  min-height: 0;
  height: 50%;
}
/* 上段: 作物名 */
.cell-crop {
  font-size: 0.85rem;
  font-weight: 900;
  color: #1e293b;
  border-bottom: 1px dashed #e2e8f0 !important;
}
/* 下段: 作業内容（右詰） */
.cell-work {
  font-size: 0.78rem;
  color: #475569;
  text-align: right;
}
/* 洗浄記録: クリック可能 */
.wash-toggle {
  cursor: pointer;
  user-select: none;
  font-size: 1rem;
  font-weight: 900;
}
.wash-toggle:hover {
  background: #f0fdf4 !important;
}
.p-0 { padding: 0 !important; }

/* ── 台帳行の保存ボタン列 ── */
.save-col-th {
  background: #f4f8f6 !important;
  border-left: 2px dashed #cbd5e1 !important;
}
.save-cell {
  position: relative;
  text-align: center;
  vertical-align: middle;
  padding: 2px !important;
  border-left: 2px dashed #cbd5e1 !important;
  background: #fafafa !important;
}
.save-cell.has-error {
  background: #fff1f2 !important;
  border-left-color: #fca5a5 !important;
}
.btn-row-save {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 38px;
  height: 36px;
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  padding: 2px;
}
.btn-row-save:hover {
  background: #16a34a;
  color: #fff;
  border-color: #16a34a;
}
.btn-row-save-label {
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
}
.has-error .btn-row-save {
  background: #fff1f2;
  color: #dc2626;
  border-color: #fca5a5;
}
.has-error .btn-row-save:hover {
  background: #dc2626;
  color: #fff;
  border-color: #dc2626;
}
/* 保存済み状態（5秒間） */
.is-saved {
  background: #f0fdf4 !important;
}
.btn-row-save.saved {
  background: #16a34a;
  color: #fff;
  border-color: #15803d;
}
.btn-row-save.saved:hover {
  background: #15803d;
}
/* エラーツールチップ（行下に表示） */
.row-error-tooltip {
  position: absolute;
  top: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.72rem;
  color: #991b1b;
  white-space: nowrap;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 2px 8px rgba(220,38,38,0.12);
}

.jas-footer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 2.5px solid #1e293b;
  border-top: none;
  background: #fff;
}
.footer-box { border-right: 2px solid #cbd5e1; }
.footer-box:last-child { border-right: none; }
.box-label {
  background: #f4f8f6;
  border-bottom: 2px solid #1e293b;
  padding: 8px;
  font-size: 0.9rem;
  font-weight: bold;
  text-align: center;
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
  color: #0f172a;
}
.box-content { padding: 8px; min-height: 120px; font-size: 0.95rem; display: flex; }
.jas-textarea {
  flex: 1;
  width: 100%;
  border: none;
  /* 公式Excel様式と同じく1行ごとに罫線を引く（行の高さ=line-height 28px に同期） */
  background: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent 27px,
    #94a3b8 27px,
    #94a3b8 28px
  );
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
  font-size: 1rem;
  font-weight: bold;
  resize: none;
  min-height: 112px;
  outline: none;
  line-height: 28px;
  color: #1e293b;
  transition: all 0.25s ease;
  padding: 0 8px;
  border-radius: 0;
}
.jas-textarea:focus {
  background: #f0fdf4 !important;
  box-shadow: inset 0 0 0 2px rgba(22, 163, 74, 0.15);
}

.jas-guideline {
  margin-top: 1.25rem;
  display: flex;
  align-items: center;
  font-family: "MS Mincho", "Hiragino Mincho ProN", serif;
  font-weight: bold;
  padding-left: 0.5rem;
  color: #1e293b;
}
.guideline-title { font-size: 1.2rem; margin-right: 4rem; color: #0f172a; }
.guideline-items {
  display: grid;
  grid-template-columns: 240px 240px;
  row-gap: 6px;
  column-gap: 2rem;
  font-size: 0.95rem;
}

@media print {
  .no-print, .header, .filter-bar, .process-timeline-box { display: none !important; }
  #jas-ledger-document { display: block !important; width: 100% !important; box-sizing: border-box !important; height: auto !important; padding: 5mm 15mm !important; margin: 0 auto !important; border: none !important; overflow: visible !important; background: #fff !important; box-shadow: none !important; border-radius: 0 !important; color: #000 !important; }
  .jas-meta-table, .jas-main-table, .jas-footer-grid { border: 2.5px solid #000 !important; background: #fff !important; }
  .jas-meta-table td, .jas-main-table th, .jas-main-table td, .footer-box, .box-label { border: 1px solid #000 !important; background: #fff !important; color: #000 !important; }
  .jas-meta-table .meta-label, .jas-main-table th, .box-label { background: #fff !important; border-bottom: 2px solid #000 !important; }
  .meta-input, .row-remark-input, .jas-textarea { color: #000 !important; background: transparent !important; box-shadow: none !important; }
  .jas-main-table { page-break-inside: auto; width: 100% !important; }
  .jas-main-table tr { page-break-inside: avoid !important; break-inside: avoid !important; }
  .jas-main-table thead { display: table-header-group !important; }
  .jas-footer-grid { page-break-inside: avoid !important; break-inside: avoid !important; }
  .jas-guideline { display: none !important; }
  .jas-textarea { border: none !important; overflow: visible !important; height: auto !important; min-height: auto !important; }

  /* 💡 1ページに収めるための極限のコンパクト化調整 */
  #jas-ledger-document {
    zoom: 0.93; /* Chrome向け縮小 */
  }
  .jas-main-table td {
    height: 25px !important;
    padding: 2px 4px !important;
    font-size: 0.8rem !important;
  }
  .work-cell {
    padding: 0 4px !important;
  }
  .jas-meta-table td {
    padding: 4px 8px !important;
    font-size: 0.85rem !important;
  }
  .box-content {
    min-height: 80px !important;
    padding: 4px !important;
  }
  .jas-textarea {
    min-height: 70px !important;
    font-size: 0.85rem !important;
  }
  .jas-title { font-size: 1.8rem !important; margin-bottom: 4px !important; }
  .jas-producer { font-size: 1.3rem !important; }
  
  /* 💡 印刷時もExcel様式の色分けを維持（カラー印刷準拠） */
  .work-row.carry-over td {
    background-color: #fff !important;
    border: 1px solid #000000 !important;
    color: #dc2626 !important; /* 前期持ち越し: 赤文字 */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .work-row.carry-over .cell-input {
    color: #dc2626 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .work-row.defect td {
    background-color: #e5e7eb !important; /* 発芽不良: 薄グレー網掛け */
    border: 1px solid #000000 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* 作業セルの色分け（播種=青/収穫=赤系）を印刷でも保持 */
  .cell-input.wt-sowing,
  .cell-input.wt-planting,
  .cell-input.wt-harvest-start,
  .cell-input.wt-harvest-end {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* 野菜に関する情報・備考の罫線を印刷でも表示 */
  .jas-textarea {
    background: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 27px,
      #000 27px,
      #000 28px
    ) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .work-type-badge {
    background: transparent !important;
    border: 1px solid #000000 !important;
    color: #000000 !important;
    box-shadow: none !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .crop-name-left {
    color: #000000 !important;
  }
  .work-cell {
    border: 1px solid #000000 !important;
  }
}

/* 💡 印刷案内メッセージのプレミアムデザイン */
.print-guidance-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  color: #166534;
  font-family: "MS Mincho", "Hiragino Mincho ProN", sans-serif;
  font-size: 0.9rem;
  line-height: 1.5;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}
.print-guidance-banner strong {
  font-weight: 800;
  color: #15803d;
}

/* 💡 テーブルの文字潰れ・改行を防ぐ極小ノーラップクラス */
.col-date {
  white-space: nowrap !important;
  text-align: center !important;
  font-size: 0.8rem !important;
}
.col-qty {
  white-space: nowrap !important;
  text-align: center !important;
  font-size: 0.8rem !important;
  font-weight: bold !important;
}
.col-wash {
  white-space: nowrap !important;
  text-align: center !important;
  font-size: 0.8rem !important;
}

/* 圃場列（すべての圃場まとめ表示時） */
.col-field {
  font-size: 0.78rem !important;
  font-weight: 600;
  color: #166534;
  padding: 2px 4px !important;
  line-height: 1.2;
  word-break: break-all;
}

.overlay { position: fixed; inset: 0; z-index: 5000; background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; }
.modal { width: 800px; height: 90vh; background: white; border-radius: 24px; display: flex; flex-direction: column; overflow: hidden; }
.modal-header { padding: 1.5rem 2rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
.modal-body { flex: 1; overflow-y: auto; padding: 2rem; }
.modal-footer { padding: 1.25rem 2rem; background: #f8fafc; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 1rem; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
.form-group.full { grid-column: span 2; }
.form-group label { display: block; font-size: 0.8rem; font-weight: 900; margin-bottom: 0.5rem; color: #64748b; }
.form-group input, .form-group select, .form-group textarea { width: 100%; padding: 0.75rem; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 0.95rem; }
.chip-container { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.chip-btn { padding: 0.4rem 1rem; border-radius: 999px; background: #f1f5f9; border: 1px solid #e2e8f0; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
.chip-btn.active { background: #16a34a; color: white; border-color: #16a34a; }
.chip-btn.mini { padding: 0.2rem 0.6rem; font-size: 0.7rem; }
.chip-btn.eq.active { background: #3b82f6; border-color: #3b82f6; }

.wash-method-select { display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem; }
.ml-4 { margin-left: 1rem; }

.clean-check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; font-weight: 800; color: #16a34a; cursor: pointer; }
.clean-check input { width: 18px; height: 18px; }
.sub-header { display: flex; align-items: center; gap: 0.5rem; font-weight: 900; color: #16a34a; margin-bottom: 1rem; }
.border-top-dash { border-top: 1px dashed #e2e8f0; }
.item-tag { display: flex; align-items: center; gap: 0.5rem; background: #f0fdf4; color: #166534; padding: 0.4rem 0.75rem; border-radius: 8px; font-size: 0.8rem; width: fit-content; }
.item-tag.blue { background: #eff6ff; color: #1e40af; }
.entry-form { display: flex; gap: 0.5rem; background: #f8fafc; padding: 0.75rem; border-radius: 12px; }
.entry-form input, .entry-form select { flex: 1; padding: 0.5rem; font-size: 0.85rem; }
.btn-add-item { background: #1e293b; color: white; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 800; font-size: 0.8rem; }

.bg-info-light { background: #f0f9ff !important; border: 1px solid #bae6fd !important; }
.form-label-mini { font-size: 0.65rem; font-weight: 800; color: #0369a1; min-width: 60px; }
.small-input { font-size: 0.8rem !important; padding: 0.3rem 0.5rem !important; }
.mt-1 { margin-top: 0.25rem; }
.mt-2 { margin-top: 0.5rem; }

.guidance-box-pc { background: #fffbeb; border: 2px solid #fcd34d; border-radius: 8px; padding: 0.5rem 0.75rem; display: flex; align-items: center; gap: 0.5rem; color: #92400e; font-size: 0.8rem; font-weight: 800; }

.process-timeline-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; }
.timeline-label { font-size: 0.7rem; font-weight: bold; color: #64748b; margin-bottom: 1rem; text-transform: uppercase; }
.timeline-track { display: flex; justify-content: space-between; position: relative; padding: 0 1rem; }
.timeline-track::before { content: ''; position: absolute; top: 10px; left: 2rem; right: 2rem; height: 2px; background: #e2e8f0; }
.timeline-step { position: relative; display: flex; flex-direction: column; align-items: center; z-index: 1; flex: 1; }
.step-dot { width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 2px solid #e2e8f0; margin-bottom: 0.5rem; transition: all 0.3s; }
.step-name { font-size: 0.65rem; font-weight: 800; color: #94a3b8; }
.timeline-step.completed .step-dot { background: #16a34a; border-color: #16a34a; box-shadow: 0 0 10px rgba(22, 163, 74, 0.3); }
.timeline-step.completed .step-name { color: #16a34a; }

/* ===== Excelインポート ===== */
.btn-import {
  border: 1.5px dashed #16a34a !important;
  color: #16a34a !important;
  background: #f0fdf4 !important;
}
.btn-import:hover { background: #dcfce7 !important; }

.import-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, 95vw);
  max-height: 85vh;
  overflow-y: auto;
  background: white;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
  z-index: 2100;
  display: flex;
  flex-direction: column;
}

.import-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}
.import-modal-title { display: flex; align-items: center; gap: 0.6rem; }
.import-modal-title h3 { font-size: 1rem; font-weight: 900; margin: 0; }
.import-icon { color: #16a34a; }
.btn-close-modal {
  background: #f1f5f9; border: none; border-radius: 50%;
  width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}

.import-body { padding: 1.5rem; }

.import-info-box {
  background: #f0fdf4; border: 1px solid #86efac;
  border-radius: 10px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.82rem;
}
.import-info-sub { color: #555; margin-top: 4px; }
.import-info-box code { background: #e0f2fe; padding: 1px 5px; border-radius: 4px; font-size: 0.78rem; }

.file-pick-area {
  display: block; cursor: pointer;
  border: 2px dashed #94a3b8; border-radius: 12px;
  transition: border-color 0.2s;
}
.file-pick-area:hover { border-color: #16a34a; }
.file-pick-inner {
  display: flex; flex-direction: column; align-items: center;
  gap: 8px; padding: 2rem; color: #94a3b8;
  font-size: 0.9rem; font-weight: 700;
}
.file-pick-inner small { font-size: 0.72rem; font-weight: 400; }
.hidden-file-input { display: none; }

.preview-stats {
  display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 1rem;
}
.stat-chip {
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 8px; padding: 8px 14px; display: flex; flex-direction: column; gap: 2px;
}
.chip-label { font-size: 0.68rem; color: #94a3b8; font-weight: 700; }
.chip-val { font-size: 0.9rem; font-weight: 900; }

.dup-warning {
  background: #fffbeb; border: 1.5px solid #fde68a;
  border-radius: 12px; padding: 1rem; margin-bottom: 1rem;
}
.dup-warning-title { font-size: 0.9rem; font-weight: 800; margin-bottom: 6px; }
.dup-warning-desc { font-size: 0.78rem; color: #555; margin-bottom: 0.75rem; line-height: 1.5; }
.strategy-options { display: flex; flex-direction: column; gap: 8px; }
.strategy-option {
  display: flex; align-items: flex-start; gap: 10px;
  background: white; border: 1.5px solid #e2e8f0;
  border-radius: 10px; padding: 10px 12px; cursor: pointer;
}
.strategy-option.selected { border-color: #16a34a; background: #f0fdf4; }
.strategy-option input { margin-top: 3px; accent-color: #16a34a; }
.strategy-text strong { display: block; font-size: 0.82rem; font-weight: 800; }
.strategy-text small { font-size: 0.72rem; color: #666; }

.no-dup-notice {
  background: #f0fdf4; border: 1px solid #86efac;
  border-radius: 10px; padding: 0.75rem 1rem;
  font-size: 0.85rem; font-weight: 700; color: #15803d;
  margin-bottom: 1rem;
}

.import-footer-btns { display: flex; gap: 10px; justify-content: flex-end; margin-top: 1rem; }
.btn-import-run {
  background: #16a34a; color: white; border: none;
  border-radius: 8px; padding: 9px 22px;
  font-size: 0.85rem; font-weight: 700; cursor: pointer;
}
.btn-import-run:hover { background: #15803d; }
.btn-import-run:disabled { background: #94a3b8; cursor: not-allowed; }

.import-reset-section {
  margin-top: 1.25rem;
  padding: 1rem;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 10px;
}
.import-reset-title { font-weight: 700; color: #b91c1c; font-size: 0.85rem; margin-bottom: 0.35rem; }
.import-reset-desc { font-size: 0.78rem; color: #6b7280; margin-bottom: 0.75rem; }
.reset-field-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
.reset-field-item {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 4px 10px; background: white; border: 1px solid #fca5a5;
  border-radius: 20px; font-size: 0.82rem; cursor: pointer;
}
.reset-field-item input { accent-color: #dc2626; }
.btn-reset-field {
  background: #dc2626; color: white; border: none;
  border-radius: 8px; padding: 7px 16px;
  font-size: 0.82rem; font-weight: 700; cursor: pointer;
}
.btn-reset-field:hover { background: #b91c1c; }

.mt-2 { margin-top: 0.75rem; }
.mt-3 { margin-top: 1.25rem; }
.csv-preview-table table thead th { font-weight: 600; color: #374151; }
.csv-preview-table table tbody tr:hover { background: #f8fafc; }

.import-done-icon { font-size: 2.5rem; text-align: center; margin-bottom: 0.5rem; }
.import-done-title { font-size: 1rem; font-weight: 900; text-align: center; margin-bottom: 1rem; }
.done-stats { background: #f8fafc; border-radius: 10px; overflow: hidden; margin-bottom: 0.75rem; }
.done-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 14px; border-bottom: 1px solid #e2e8f0; font-size: 0.82rem;
}
.done-row:last-child { border-bottom: none; }
.done-row strong { color: #16a34a; font-size: 0.9rem; }
.done-note { font-size: 0.75rem; color: #94a3b8; text-align: center; }
.btn-cancel-import {
  flex: 1; background: #fef2f2; color: #ef4444;
  border: 1.5px solid #fca5a5; border-radius: 8px;
  padding: 9px 12px; font-size: 0.78rem; font-weight: 700; cursor: pointer;
}
.btn-cancel-import:hover { background: #fee2e2; }
</style>

<style>
/* 💡 グローバル印刷スタイル（Vueのスコープ属性を除外して確実にブラウザに適用する） */
@media print {
  @page {
    margin: auto; /* ブラウザ依存を避け、内側のpaddingで余白を制御する */
  }
  
  /* グローバルUI要素の非表示（ヘッダー、フッター、サイドバー等） */
  .pc-header, .pc-footer, .header-mobile-v2, .pc-layout, .sidebar, header, footer, .sidebar-overlay, .global-toast { display: none !important; }
  
  /* グローバルHTML/Body要素の強制初期化 */
  html, body {
    background: #ffffff !important;
    color: #000000 !important;
    width: 100% !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Vueの親コンテナやレイアウト枠の幅制限を解除 */
  #app, 
  .app-container, 
  .main-content, 
  .jas-document-wrapper, 
  .work-history-pro {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
    height: auto !important;
    overflow: visible !important;
    display: block !important;
  }
}
</style>
