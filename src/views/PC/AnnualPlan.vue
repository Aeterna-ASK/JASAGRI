<script setup>
import { ref, computed } from 'vue';
import { Printer, Plus, Trash2, ExternalLink, X, Check } from 'lucide-vue-next';
import { state, actions } from '../../store';

// ===== 列インデックス =====
// 農業年: 9月=0, 10月=1, 11月=2, 12月=3, 1月=4, 2月=5, 3月=6, 4月=7, 5月=8, 6月=9, 7月=10, 8月=11
// col = monthIdx * 3 + periodIdx  (periodIdx: 0=前, 1=中, 2=後)

const MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const PERIOD_LABELS = ['前', '中', '後'];
const TOTAL_COLS = 36;

function toCol(month, period) { // period: 1=前, 2=中, 3=後
  return MONTH_ORDER.indexOf(month) * 3 + (period - 1);
}

function buildCells(events) {
  // type: 'sow'|'transplant'|'harvest_start'|'harvest_end'
  const cells = Array(TOTAL_COLS).fill(null);
  events.forEach(([m, p, t]) => {
    const c = toCol(m, p);
    if (c >= 0 && c < TOTAL_COLS) cells[c] = t;
  });
  const tcol  = cells.findIndex(c => c === 'transplant');
  const hscol = cells.findIndex(c => c === 'harvest_start');
  const hecol = cells.findIndex(c => c === 'harvest_end');

  // 育成期間バー: 定植 → 収穫開始
  if (tcol >= 0 && hscol >= 0) {
    if (hscol > tcol + 1) {
      // 通常（年度内）
      for (let i = tcol + 1; i < hscol; i++) if (!cells[i]) cells[i] = 'growing_bar';
    } else if (hscol < tcol) {
      // 年度またぎ（定植が年度末、収穫開始が翌年度初）
      for (let i = tcol + 1; i < TOTAL_COLS; i++) if (!cells[i]) cells[i] = 'growing_bar';
      for (let i = 0; i < hscol; i++) if (!cells[i]) cells[i] = 'growing_bar';
    }
  }

  // 収穫期間バー: 収穫開始 → 収穫終了
  if (hscol >= 0 && hecol >= 0) {
    if (hecol > hscol + 1) {
      // 通常（年度内）
      for (let i = hscol + 1; i < hecol; i++) if (!cells[i]) cells[i] = 'harvest_bar';
    } else if (hecol < hscol) {
      // 年度またぎ（収穫開始が年度末、収穫終了が翌年度初）
      for (let i = hscol + 1; i < TOTAL_COLS; i++) if (!cells[i]) cells[i] = 'harvest_bar';
      for (let i = 0; i < hecol; i++) if (!cells[i]) cells[i] = 'harvest_bar';
    }
  }

  return cells;
}

// ===== 野菜データベース（暖地/鹿児島向け ※菜園ナビ sb001-sb063 準拠）=====
// 形式: [[月(1-12), 旬(1=前/2=中/3=後), 種類('sow'|'transplant'|'harvest_start')], ...]
const VEGGIE_DB = {
  // ── 夏野菜 ──────────────────────────────────────────
  'トマト':           [[12,1,'sow'],[2,1,'transplant'],[5,1,'harvest_start'],[8,1,'harvest_end']],         // sb015
  'ミニトマト':       [[12,1,'sow'],[2,1,'transplant'],[5,1,'harvest_start'],[8,2,'harvest_end']],         // sb015
  'ナス':             [[12,1,'sow'],[3,1,'transplant'],[6,1,'harvest_start'],[9,1,'harvest_end']],         // sb016
  'ピーマン':         [[12,1,'sow'],[3,2,'transplant'],[6,2,'harvest_start'],[9,1,'harvest_end']],         // sb021
  'シシトウ':         [[12,1,'sow'],[3,2,'transplant'],[6,2,'harvest_start'],[9,1,'harvest_end']],         // sb055
  'トウガラシ':       [[12,1,'sow'],[3,2,'transplant'],[7,1,'harvest_start'],[10,1,'harvest_end']],        // sb038
  '甘長唐辛子':       [[12,1,'sow'],[3,2,'transplant'],[6,2,'harvest_start'],[9,1,'harvest_end']],
  'キュウリ':         [[2,2,'sow'],[3,3,'transplant'],[5,2,'harvest_start'],[7,2,'harvest_end']],         // sb006
  'ズッキーニ':       [[3,1,'sow'],[4,1,'transplant'],[5,2,'harvest_start'],[7,1,'harvest_end']],         // sb060
  'カボチャ':         [[3,1,'sow'],[4,1,'transplant'],[7,1,'harvest_start'],[8,1,'harvest_end']],         // sb004
  'バターナッツ':     [[3,1,'sow'],[4,1,'transplant'],[7,2,'harvest_start'],[9,1,'harvest_end']],         // sb054
  'スイカ':           [[3,1,'sow'],[4,2,'transplant'],[7,2,'harvest_start'],[8,2,'harvest_end']],         // sb012
  'メロン':           [[3,2,'sow'],[4,3,'transplant'],[7,2,'harvest_start'],[8,1,'harvest_end']],
  'ゴーヤ':           [[3,1,'sow'],[4,2,'transplant'],[7,1,'harvest_start'],[9,2,'harvest_end']],         // sb045
  'オクラ':           [[4,1,'sow'],[5,1,'transplant'],[7,1,'harvest_start'],[9,2,'harvest_end']],         // sb002
  'クウシンサイ':     [[5,1,'sow'],[5,1,'transplant'],[7,1,'harvest_start'],[9,2,'harvest_end']],         // sb042
  'エダマメ':         [[4,1,'sow'],[4,1,'transplant'],[7,1,'harvest_start'],[8,1,'harvest_end']],         // sb001
  'インゲン':         [[3,1,'sow'],[3,1,'transplant'],[6,1,'harvest_start'],[8,1,'harvest_end']],         // sb044
  'トウモロコシ':     [[3,1,'sow'],[3,1,'transplant'],[6,1,'harvest_start'],[7,2,'harvest_end']],         // sb014
  'ラッカセイ':       [[4,1,'sow'],[4,1,'transplant'],[9,2,'harvest_start'],[10,1,'harvest_end']],        // sb040
  // ── 芋・根菜 ────────────────────────────────────────
  'サツマイモ':       [[4,2,'sow'],[5,1,'transplant'],[9,2,'harvest_start'],[11,1,'harvest_end']],        // sb008
  'サトイモ':         [[3,2,'sow'],[4,1,'transplant'],[10,2,'harvest_start'],[11,2,'harvest_end']],       // sb026
  'ジャガイモ(春)':   [[2,1,'sow'],[2,1,'transplant'],[5,1,'harvest_start'],[5,3,'harvest_end']],         // sb010
  'ジャガイモ(秋)':   [[8,2,'sow'],[8,2,'transplant'],[11,1,'harvest_start'],[11,3,'harvest_end']],       // sb010
  'ショウガ':         [[3,3,'sow'],[4,1,'transplant'],[10,2,'harvest_start'],[11,1,'harvest_end']],       // sb027
  'ゴボウ':           [[9,2,'sow'],[9,2,'transplant'],[3,2,'harvest_start'],[5,1,'harvest_end']],         // sb046
  'ニンニク':         [[10,2,'sow'],[10,2,'transplant'],[5,1,'harvest_start'],[5,3,'harvest_end']],       // sb018
  '大根':             [[9,2,'sow'],[9,2,'transplant'],[11,2,'harvest_start'],[1,1,'harvest_end']],        // sb013
  '人参':             [[9,2,'sow'],[9,2,'transplant'],[1,2,'harvest_start'],[3,2,'harvest_end']],         // sb017
  'かぶ':             [[9,2,'sow'],[9,2,'transplant'],[11,1,'harvest_start'],[12,3,'harvest_end']],       // sb003
  '紅芯大根':         [[10,1,'sow'],[10,1,'transplant'],[1,1,'harvest_start'],[2,1,'harvest_end']],
  'ラデッシュ':       [[9,2,'sow'],[9,2,'transplant'],[10,2,'harvest_start'],[4,3,'harvest_end']],        // sb024
  'ビーツ':           [[10,1,'sow'],[10,1,'transplant'],[1,2,'harvest_start'],[3,1,'harvest_end']],       // sb056
  // ── 冬春野菜（葉菜・結球） ───────────────────────────
  'ブロッコリー':     [[9,1,'sow'],[10,1,'transplant'],[12,2,'harvest_start'],[2,2,'harvest_end']],       // sb029
  'カリフラワー':     [[9,1,'sow'],[10,1,'transplant'],[12,3,'harvest_start'],[2,3,'harvest_end']],       // sb043
  'キャベツ':         [[9,1,'sow'],[10,2,'transplant'],[12,3,'harvest_start'],[2,3,'harvest_end']],       // sb005
  '芽キャベツ':       [[9,1,'sow'],[10,2,'transplant'],[1,2,'harvest_start'],[3,1,'harvest_end']],        // sb039
  'コールラビ':       [[9,2,'sow'],[10,2,'transplant'],[12,2,'harvest_start'],[2,2,'harvest_end']],       // sb053
  'ハクサイ':         [[9,2,'sow'],[10,2,'transplant'],[11,3,'harvest_start'],[1,2,'harvest_end']],       // sb019
  'レタス':           [[9,2,'sow'],[10,3,'transplant'],[12,2,'harvest_start'],[2,3,'harvest_end']],       // sb036
  'リーフレタス':     [[9,2,'sow'],[10,2,'transplant'],[11,3,'harvest_start'],[3,1,'harvest_end']],       // sb025
  'トレビス':         [[9,1,'sow'],[10,2,'transplant'],[1,1,'harvest_start'],[3,2,'harvest_end']],
  'ラジッキオ':       [[9,1,'sow'],[10,2,'transplant'],[1,1,'harvest_start'],[3,1,'harvest_end']],
  'アイスプラント':   [[10,1,'sow'],[11,1,'transplant'],[2,2,'harvest_start'],[4,1,'harvest_end']],       // sb051
  'セロリ':           [[9,1,'sow'],[10,2,'transplant'],[12,2,'harvest_start'],[3,1,'harvest_end']],       // sb057
  'アーティチョーク': [[9,2,'sow'],[10,2,'transplant'],[4,1,'harvest_start'],[5,2,'harvest_end']],       // sb063
  // ── 葉菜・直播 ──────────────────────────────────────
  'ほうれん草':       [[9,3,'sow'],[9,3,'transplant'],[11,1,'harvest_start'],[4,1,'harvest_end']],        // sb022
  'サラダほうれん草': [[9,3,'sow'],[9,3,'transplant'],[11,1,'harvest_start'],[4,1,'harvest_end']],
  '小松菜':           [[9,2,'sow'],[9,2,'transplant'],[10,2,'harvest_start'],[4,2,'harvest_end']],        // sb007
  '水菜':             [[9,2,'sow'],[9,2,'transplant'],[10,3,'harvest_start'],[4,1,'harvest_end']],        // sb023
  '菜の花':           [[9,1,'sow'],[10,1,'transplant'],[1,2,'harvest_start'],[3,1,'harvest_end']],
  'フダンソウ':       [[9,2,'sow'],[9,2,'transplant'],[11,1,'harvest_start'],[5,1,'harvest_end']],        // sb061
  'シュンギク':       [[9,2,'sow'],[9,2,'transplant'],[11,1,'harvest_start'],[3,1,'harvest_end']],        // sb011
  'チンゲンサイ':     [[9,2,'sow'],[9,2,'transplant'],[10,3,'harvest_start'],[4,2,'harvest_end']],        // sb047
  'ルッコラ':         [[9,2,'sow'],[9,2,'transplant'],[10,3,'harvest_start'],[4,1,'harvest_end']],        // sb048
  'ターサイ':         [[9,2,'sow'],[10,1,'transplant'],[12,1,'harvest_start'],[2,3,'harvest_end']],       // sb049
  'カラシ菜':         [[9,2,'sow'],[10,1,'transplant'],[11,2,'harvest_start'],[3,1,'harvest_end']],
  'クレソン':         [[9,2,'sow'],[10,1,'transplant'],[11,2,'harvest_start'],[4,2,'harvest_end']],       // sb052
  // ── ネギ・玉ねぎ系 ──────────────────────────────────
  'タマネギ':         [[9,2,'sow'],[11,1,'transplant'],[4,2,'harvest_start'],[5,1,'harvest_end']],        // sb033
  'ネギ':             [[10,1,'sow'],[1,1,'transplant'],[3,2,'harvest_start'],[6,1,'harvest_end']],        // sb034
  'アサツキ':         [[9,2,'sow'],[10,1,'transplant'],[11,2,'harvest_start'],[3,1,'harvest_end']],       // sb062
  // ── 豆類 ────────────────────────────────────────────
  'ソラマメ':         [[10,2,'sow'],[10,2,'transplant'],[4,2,'harvest_start'],[5,1,'harvest_end']],       // sb031
  'エンドウ':         [[10,2,'sow'],[10,2,'transplant'],[3,2,'harvest_start'],[5,1,'harvest_end']],       // sb032
  // ── 多年草・特殊 ────────────────────────────────────
  'アスパラガス':     [[2,1,'sow'],[3,1,'transplant'],[3,1,'harvest_start'],[5,3,'harvest_end']],         // sb035
  'イチゴ':           [[9,2,'sow'],[10,1,'transplant'],[3,1,'harvest_start'],[5,2,'harvest_end']],        // sb037
  'ミョウガ':         [[3,1,'sow'],[4,1,'transplant'],[7,2,'harvest_start'],[9,1,'harvest_end']],         // sb041
  'パッションフルーツ':[[3,1,'sow'],[4,1,'transplant'],[6,2,'harvest_start'],[8,3,'harvest_end']],
  'エシャレット':     [[10,1,'sow'],[10,1,'transplant'],[3,2,'harvest_start'],[4,1,'harvest_end']],       // sb050
  // ── ハーブ ──────────────────────────────────────────
  'バジル':           [[3,1,'sow'],[5,1,'transplant'],[6,1,'harvest_start'],[9,2,'harvest_end']],         // sb020
  'シソ':             [[3,2,'sow'],[5,1,'transplant'],[6,2,'harvest_start'],[9,1,'harvest_end']],         // sb009
  'パセリ':           [[9,1,'sow'],[10,1,'transplant'],[11,2,'harvest_start'],[6,1,'harvest_end']],       // sb058
  'イタリアンパセリ': [[9,1,'sow'],[10,1,'transplant'],[11,1,'harvest_start'],[5,3,'harvest_end']],
  'ミツバ':           [[9,2,'sow'],[10,2,'transplant'],[12,1,'harvest_start'],[5,1,'harvest_end']],       // sb059
  'セルフィーユ':     [[9,2,'sow'],[10,1,'transplant'],[11,2,'harvest_start'],[4,2,'harvest_end']],
  'コリアンダー':     [[9,2,'sow'],[10,1,'transplant'],[11,2,'harvest_start'],[3,2,'harvest_end']],
  'パクチー':         [[9,2,'sow'],[10,1,'transplant'],[11,2,'harvest_start'],[3,2,'harvest_end']],       // sb028
  'オレガノ':         [[3,1,'sow'],[4,2,'transplant'],[6,1,'harvest_start'],[9,1,'harvest_end']],         // sb030
  'ローズマリー':     [[9,1,'sow'],[10,1,'transplant'],[12,1,'harvest_start'],[8,3,'harvest_end']],
  'タイム':           [[9,1,'sow'],[10,1,'transplant'],[12,1,'harvest_start'],[8,3,'harvest_end']],
  'ミント':           [[9,1,'sow'],[10,1,'transplant'],[11,1,'harvest_start'],[8,3,'harvest_end']],
  'ニンニク':         [[10,2,'sow'],[10,2,'transplant'],[5,1,'harvest_start'],[5,3,'harvest_end']],       // sb018
  // ── その他 ──────────────────────────────────────────
  '胡瓜':             [[2,2,'sow'],[3,3,'transplant'],[5,2,'harvest_start'],[7,2,'harvest_end']],
  '紅芯大根':         [[10,1,'sow'],[10,1,'transplant'],[1,1,'harvest_start'],[2,1,'harvest_end']],
};

const VEGGIE_NAMES = Object.keys(VEGGIE_DB);

// ===== ツールパレット =====
const TOOLS = [
  { id: 'sow',           label: '▽', desc: '播種' },
  { id: 'transplant',    label: '○', desc: '定植' },
  { id: 'harvest_start', label: '□', desc: '収穫開始' },
  { id: 'harvest_end',   label: '×', desc: '収穫終了' },
  { id: 'erase',         label: '✕', desc: '消去' },
];

const SYMBOL_MAP = {
  sow:           '▽',
  transplant:    '○',
  harvest_start: '□',
  harvest_end:   '×',
};

// ===== リアクティブ状態 =====
const planYear = ref((() => {
  const m = new Date().getMonth(); // 0-indexed
  const y = new Date().getFullYear();
  return m >= 8 ? y : y - 1; // 9月(8)以降は当年開始
})());

const activeTool = ref('sow');
const showVeggiePanel = ref(false);
const searchQuery = ref('');
const selectedVeggies = ref(new Set());

// ===== ストア連携 =====
function yearKey() { return `${planYear.value}-${planYear.value + 1}`; }

// 書き込み用：エントリがなければ作成して返す（データ追加時のみ呼ぶ）
function getPlanData() {
  if (!state.records.t_annual_plan) state.records.t_annual_plan = {};
  const k = yearKey();
  if (!state.records.t_annual_plan[k]) state.records.t_annual_plan[k] = { rows: [] };
  return state.records.t_annual_plan[k];
}

// 読み取り専用：エントリを作成しない（閲覧だけでデータを汚さない）
function readPlanRows() {
  return state.records.t_annual_plan?.[yearKey()]?.rows ?? [];
}

const planRows = computed(() => readPlanRows());

// ===== 年度ナビゲーション =====
function selectYear(yk) {
  planYear.value = parseInt(yk.split('-')[0]);
}

// ‹ 前年度へ移動
function prevYear() { planYear.value = planYear.value - 1; }

// › 次年度へ移動
function nextYear() { planYear.value = planYear.value + 1; }

// ===== 年度管理 =====
// 保存済み年度一覧（データのある年度のみ、新しい順）
const savedYears = computed(() => {
  const plan = state.records.t_annual_plan;
  if (!plan) return [];
  return Object.keys(plan)
    .filter(k => plan[k]?.rows?.length > 0)
    .sort()
    .reverse();
});

// 年度選択ドロップダウン用の選択肢（現在農業年 ±5 年の計10年分）
const yearRangeOptions = computed(() => {
  const now = new Date();
  const base = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 10 }, (_, i) => base - 4 + i);
});

// 印刷用：今日の日付（日本語表記）
const printDate = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
});

// 前年度からコピー
function copyFromPrevYear() {
  const prevKey = `${planYear.value - 1}-${planYear.value}`;
  const prevData = state.records.t_annual_plan?.[prevKey];
  if (!prevData?.rows?.length) {
    actions.showToast('前年度のデータがありません', 'warning');
    return;
  }
  const data = getPlanData();
  let count = 0;
  prevData.rows.forEach(row => {
    if (!data.rows.find(r => r.name === row.name)) {
      data.rows.push({
        id: 'ap_' + Date.now() + Math.random().toString(36).slice(2),
        name: row.name,
        cells: [...row.cells],
      });
      count++;
    }
  });
  actions.syncToCloud();
  actions.showToast(`前年度から${count}種をコピーしました`, 'success');
}

// 年度データ削除
const showDeleteConfirm = ref(false);
function confirmDeleteYear() { showDeleteConfirm.value = true; }
function doDeleteYear() {
  const k = yearKey();
  if (state.records.t_annual_plan?.[k]) {
    state.records.t_annual_plan[k].rows = [];
    actions.syncToCloud();
  }
  showDeleteConfirm.value = false;
  actions.showToast('年度データを削除しました', 'success');
}

const filteredVeggies = computed(() =>
  searchQuery.value
    ? VEGGIE_NAMES.filter(n => n.includes(searchQuery.value))
    : VEGGIE_NAMES
);

// ===== 操作 =====
function toggleVeggieSelect(name) {
  if (selectedVeggies.value.has(name)) {
    selectedVeggies.value.delete(name);
  } else {
    selectedVeggies.value.add(name);
  }
  // Set を更新して Vue リアクティブ検知させる
  selectedVeggies.value = new Set(selectedVeggies.value);
}

function addSelectedVeggies() {
  if (selectedVeggies.value.size === 0) return;
  const data = getPlanData();
  selectedVeggies.value.forEach(name => {
    const raw = VEGGIE_DB[name];
    if (!raw) return;
    // 同名が既にある場合はスキップ
    if (data.rows.find(r => r.name === name)) return;
    data.rows.push({
      id: 'ap_' + Date.now() + Math.random().toString(36).slice(2),
      name,
      cells: buildCells(raw),
    });
  });
  actions.syncToCloud();
  actions.showToast(`${selectedVeggies.value.size}種の野菜を追加しました`, 'success');
  showVeggiePanel.value = false;
  searchQuery.value = '';
  selectedVeggies.value = new Set();
}

function deleteRow(id) {
  const data = getPlanData();
  const idx = data.rows.findIndex(r => r.id === id);
  if (idx >= 0) data.rows.splice(idx, 1);
  actions.syncToCloud();
}

function clickCell(rowId, col) {
  const row = planRows.value.find(r => r.id === rowId);
  if (!row) return;
  if (activeTool.value === 'erase') {
    row.cells[col] = null;
  } else {
    row.cells[col] = activeTool.value;
  }
  actions.syncToCloud();
}

function printPlan() {
  window.print();
}

// ===== Takii品種カタログ連携 =====
const showTakiiModal = ref(false);
const takiiBreedSeq = ref('');
const takiiVeggieName = ref('');
const takiiTempCells = ref(Array(TOTAL_COLS).fill(null));
const takiiActiveTool = ref('sow');
const takiiImgError = ref(false);

function takiiCalendarUrl() {
  const seq = takiiBreedSeq.value.replace(/\D/g, '').padStart(8, '0');
  return seq ? `https://www.takii.co.jp/breed/pattern/0/${seq}.gif` : '';
}

function openTakiiModal() {
  takiiBreedSeq.value = '';
  takiiVeggieName.value = '';
  takiiTempCells.value = Array(TOTAL_COLS).fill(null);
  takiiImgError.value = false;
  showTakiiModal.value = true;
}

function clickTakiiCell(col) {
  if (takiiActiveTool.value === 'erase') {
    takiiTempCells.value[col] = null;
  } else {
    takiiTempCells.value[col] = takiiActiveTool.value;
  }
}

function confirmTakiiAdd() {
  if (!takiiVeggieName.value.trim()) {
    actions.showToast('野菜名を入力してください', 'warning');
    return;
  }
  getPlanData().rows.push({
    id: 'ap_' + Date.now() + Math.random().toString(36).slice(2),
    name: takiiVeggieName.value.trim(),
    cells: [...takiiTempCells.value],
  });
  actions.syncToCloud();
  showTakiiModal.value = false;
}
</script>

<template>
  <div class="ap-view">

    <!-- ===== ヘッダー ===== -->
    <div class="ap-header no-print">
      <div class="ap-header-left">
        <button type="button" @click="prevYear" class="year-btn" title="前の年度">‹</button>
        <div class="year-display">
          <div class="year-select-wrap">
            <select class="year-select-dd" v-model="planYear">
              <option v-for="y in yearRangeOptions" :key="y" :value="y">
                {{ y }}–{{ y + 1 }}年{{ savedYears.some(k => k === `${y}-${y + 1}`) ? ' ★' : '' }}
              </option>
            </select>
            <span class="year-title-suffix no-print">年間生産予定表</span>
          </div>
          <span v-if="planRows.length > 0" class="year-count-badge">{{ planRows.length }}種登録済み</span>
          <span v-else class="year-empty-badge">未作成</span>
        </div>
        <button type="button" @click="nextYear" class="year-btn" title="次の年度">›</button>
      </div>
      <div class="ap-header-right">
        <button @click="showVeggiePanel = !showVeggiePanel" class="btn-primary btn-sm">
          <Plus size="13" /> 野菜を追加
        </button>
        <!-- 前年度コピー（現在年度が空の時に表示） -->
        <button
          v-if="planRows.length === 0"
          @click="copyFromPrevYear"
          class="btn-secondary btn-sm"
          title="前年度（{{ planYear - 1 }}-{{ planYear }}）の野菜リストをコピーします"
        >前年度からコピー</button>
        <button @click="openTakiiModal" class="btn-secondary btn-sm">
          <ExternalLink size="13" /> タキイ品種
        </button>
        <button @click="printPlan" class="btn-secondary btn-sm">
          <Printer size="13" /> 印刷
        </button>
        <!-- 年度削除 -->
        <button
          v-if="planRows.length > 0"
          @click="confirmDeleteYear"
          class="btn-danger btn-sm"
          title="この年度のデータをすべて削除"
        >年度削除</button>
      </div>
    </div>

    <!-- 保存済み年度バッジ -->
    <div v-if="savedYears.length > 0" class="saved-years no-print">
      <span class="saved-years-label">保存済み：</span>
      <button
        v-for="yk in savedYears" :key="yk"
        @click="selectYear(yk)"
        :class="['year-badge', yearKey() === yk ? 'active' : '']"
      >
        {{ yk }}
        <span class="year-badge-cnt">{{ state.records.t_annual_plan[yk]?.rows?.length }}種</span>
      </button>
    </div>

    <!-- 年度削除確認ダイアログ -->
    <Transition name="fade">
      <div v-if="showDeleteConfirm" class="confirm-overlay" @click.self="showDeleteConfirm = false">
        <div class="confirm-dialog glass">
          <p>⚠️ <strong>{{ yearKey() }}</strong> の年間計画データをすべて削除しますか？</p>
          <p class="confirm-sub">この操作は取り消せません（{{ planRows.length }}種のデータが削除されます）</p>
          <div class="confirm-btns">
            <button @click="doDeleteYear" class="btn-danger btn-sm">削除する</button>
            <button @click="showDeleteConfirm = false" class="btn-secondary btn-sm">キャンセル</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ===== ツールパレット ===== -->
    <div class="ap-tools no-print">
      <span class="tools-label">編集ツール：</span>
      <button
        v-for="t in TOOLS" :key="t.id"
        @click="activeTool = t.id"
        :class="['tool-btn', t.id, { active: activeTool === t.id }]"
      >
        <span class="tool-sym">{{ t.label }}</span>{{ t.desc }}
      </button>
    </div>

    <!-- ===== 野菜追加パネル ===== -->
    <div v-if="showVeggiePanel" class="veggie-panel no-print glass">
      <div class="veggie-panel-header">
        <input
          v-model="searchQuery"
          placeholder="野菜名で検索…"
          class="veggie-search glass"
        />
        <span class="veggie-count-label">
          {{ selectedVeggies.size > 0 ? `${selectedVeggies.size}種選択中` : '野菜をクリックして選択' }}
        </span>
        <button
          @click="addSelectedVeggies"
          :disabled="selectedVeggies.size === 0"
          class="btn-primary btn-sm veggie-add-btn"
        >
          <Check size="13" /> {{ selectedVeggies.size > 0 ? `${selectedVeggies.size}種を追加` : '追加' }}
        </button>
        <button @click="showVeggiePanel = false; selectedVeggies = new Set(); searchQuery = ''" class="btn-secondary btn-sm">
          キャンセル
        </button>
      </div>
      <div class="veggie-chips">
        <button
          v-for="name in filteredVeggies" :key="name"
          @click="toggleVeggieSelect(name)"
          :class="['veggie-chip', { selected: selectedVeggies.has(name) }]"
        >
          <span v-if="selectedVeggies.has(name)" class="chip-check">✓</span>
          {{ name }}
        </button>
      </div>
    </div>

    <!-- ===== 印刷専用ヘッダー（画面では非表示） ===== -->
    <div class="print-only prt-doc-header">
      <!-- ① タイトル帯 -->
      <div class="prt-title-band">
        <div class="prt-farm-name">{{ state.farmInfo.name || '' }}</div>
        <h1 class="prt-main-title">年間生産予定表</h1>
        <div class="prt-year-badge">{{ planYear }}–{{ planYear + 1 }}年度</div>
      </div>
      <!-- ② メタ情報帯 -->
      <div class="prt-meta-band">
        <span>{{ planRows.length }}種登録</span>
        <span class="prt-div">｜</span>
        <span>作成日：{{ printDate }}</span>
        <span class="prt-div">｜</span>
        <span>作成者：{{ state.user.name || '－' }}</span>
      </div>
      <!-- ③ マーカー凡例帯 -->
      <div class="prt-legend-band">
        <span class="prt-leg-title">凡例：</span>
        <span class="prt-leg-item prt-leg-sow"><span class="prt-sym">▽</span>播種</span>
        <span class="prt-leg-arrow">→</span>
        <span class="prt-leg-item prt-leg-transplant"><span class="prt-sym">○</span>定植</span>
        <span class="prt-leg-bar prt-bar-growing">　　</span>
        <span class="prt-leg-label">育成期間</span>
        <span class="prt-leg-item prt-leg-harvest-start"><span class="prt-sym">□</span>収穫開始</span>
        <span class="prt-leg-bar prt-bar-harvest">　　</span>
        <span class="prt-leg-label">収穫期間</span>
        <span class="prt-leg-item prt-leg-harvest-end"><span class="prt-sym">×</span>収穫終了</span>
      </div>
    </div>

    <!-- ===== グリッド ===== -->
    <div class="ap-grid-wrap">
      <table class="ap-grid">
        <thead>
          <!-- 年度行 -->
          <tr>
            <th class="lbl-cell" rowspan="3">野菜名</th>
            <th colspan="12" class="year-th curr-yr">{{ planYear }}年（9〜12月）</th>
            <th colspan="24" class="year-th next-yr-th">{{ planYear + 1 }}年（1〜8月）</th>
          </tr>
          <!-- 月行 -->
          <tr>
            <th
              v-for="(m, mi) in MONTH_ORDER" :key="mi"
              colspan="3"
              :class="['month-th', mi >= 4 ? 'next-yr' : '']"
            >{{ m }}月</th>
          </tr>
          <!-- 旬行 -->
          <tr>
            <template v-for="(m, mi) in MONTH_ORDER" :key="'p' + mi">
              <th
                v-for="(pl, pi) in PERIOD_LABELS" :key="pi"
                :class="['period-th', mi >= 4 ? 'next-yr' : '']"
              >{{ pl }}</th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr v-if="planRows.length === 0">
            <td :colspan="TOTAL_COLS + 1" class="empty-row">
              「野菜を追加」ボタンで野菜を選ぶと、鹿児島（暖地）向けの栽培スケジュールが自動入力されます
            </td>
          </tr>
          <tr v-for="row in planRows" :key="row.id" class="data-row">
            <td class="lbl-cell">
              <div class="row-lbl">
                <span>{{ row.name }}</span>
                <button @click="deleteRow(row.id)" class="del-btn no-print">
                  <Trash2 size="11" />
                </button>
              </div>
            </td>
            <td
              v-for="(cell, col) in row.cells"
              :key="col"
              :class="['data-cell', cell ? 'c-' + cell : '']"
              @click="clickCell(row.id, col)"
            ><span v-if="SYMBOL_MAP[cell]" class="sym">{{ SYMBOL_MAP[cell] }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ===== Takii品種モーダル ===== -->
    <Transition name="fade">
      <div v-if="showTakiiModal" class="takii-overlay" @click.self="showTakiiModal = false">
        <div class="takii-modal glass">
          <div class="takii-modal-header">
            <h3>タキイ種苗 品種カレンダー参照</h3>
            <button @click="showTakiiModal = false" class="close-btn"><X size="16"/></button>
          </div>

          <!-- 品種コード入力 -->
          <div class="takii-inputs">
            <div class="field">
              <label>野菜名（行ラベル）</label>
              <input v-model="takiiVeggieName" placeholder="例：恋みどりインゲン" class="glass" />
            </div>
            <div class="field">
              <label>タキイ品種コード（URLの breed_seq=）</label>
              <input v-model="takiiBreedSeq" placeholder="例：00000776" class="glass" maxlength="12" />
            </div>
          </div>

          <!-- カレンダー画像 -->
          <div v-if="takiiCalendarUrl()" class="takii-img-wrap">
            <p class="takii-hint">↓ タキイのカレンダー画像（<strong>中間・暖地</strong>の行を参考に下のグリッドを編集）</p>
            <img
              :src="takiiCalendarUrl()"
              alt="タキイ栽培カレンダー"
              class="takii-calendar-img"
              @error="takiiImgError = true"
              @load="takiiImgError = false"
            />
            <p v-if="takiiImgError" class="takii-err">画像を取得できません。品種コードを確認してください。</p>
          </div>

          <!-- 入力グリッド -->
          <div class="takii-grid-section">
            <p class="takii-hint">↓ 上の画像を見ながらセルをクリックして入力してください</p>
            <div class="ap-tools" style="margin-bottom:6px;">
              <button v-for="t in TOOLS" :key="t.id"
                @click="takiiActiveTool = t.id"
                :class="['tool-btn', t.id, { active: takiiActiveTool === t.id }]">
                <span class="tool-sym">{{ t.label }}</span>{{ t.desc }}
              </button>
            </div>
            <div class="takii-mini-grid-wrap">
              <table class="ap-grid takii-mini-grid">
                <thead>
                  <tr>
                    <th v-for="(m,mi) in MONTH_ORDER" :key="mi" colspan="3"
                        :class="['month-th', mi >= 4 ? 'next-yr' : '']">{{ m }}月</th>
                  </tr>
                  <tr>
                    <template v-for="(m,mi) in MONTH_ORDER" :key="'p'+mi">
                      <th v-for="(pl,pi) in PERIOD_LABELS" :key="pi"
                          :class="['period-th', mi >= 4 ? 'next-yr' : '']">{{ pl }}</th>
                    </template>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td v-for="(cell,col) in takiiTempCells" :key="col"
                        :class="['data-cell', cell ? 'c-' + cell : '']"
                        @click="clickTakiiCell(col)">
                      <span v-if="SYMBOL_MAP[cell]" class="sym">{{ SYMBOL_MAP[cell] }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="takii-footer">
            <button @click="confirmTakiiAdd" class="btn-primary btn-sm">グリッドに追加</button>
            <button @click="showTakiiModal = false" class="btn-secondary btn-sm">キャンセル</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ===== 凡例 ===== -->
    <div class="ap-legend no-print">
      <span class="leg sow">▽ 播種</span>
      <span class="leg transplant">○ 定植</span>
      <span class="leg growing">── 育成期間</span>
      <span class="leg harvest">□ 収穫開始</span>
      <span class="leg harvest-bar">── 収穫期間</span>
      <span class="leg harvest-end">× 収穫終了</span>
      <span class="leg tip">※ クリックして編集</span>
    </div>

  </div>
</template>

<style scoped>
.ap-view {
  padding: 1.2rem 1.5rem;
  background: var(--bg-main);
  min-height: 100%;
}

/* Header */
.ap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.4rem;
  gap: 1rem;
  flex-wrap: wrap;
}
.ap-header-left { display: flex; align-items: center; gap: 0.6rem; }
.year-display { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.ap-header-left h2 { font-size: 1rem; font-weight: 800; white-space: nowrap; margin: 0; }
.year-count-badge {
  font-size: 0.7rem;
  color: #16a34a;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  padding: 1px 8px;
  font-weight: 600;
}
.year-empty-badge {
  font-size: 0.7rem;
  color: #94a3b8;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1px 8px;
}
.ap-header-right { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
.year-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 1rem;
  color: var(--text-main);
}

/* 保存済み年度バッジ */
.saved-years {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}
/* 年度セレクト */
.year-select-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}
.year-select-dd {
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-main);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 6px;
  cursor: pointer;
  appearance: auto;
}
.year-select-dd:hover { border-color: #16a34a; }
.year-select-dd:focus { outline: 2px solid #16a34a; outline-offset: 1px; }
.year-title-suffix {
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-main);
  white-space: nowrap;
}
/* 印刷専用要素は画面では非表示 */
.print-only { display: none; }

.saved-years-label {
  font-size: 0.72rem;
  color: var(--text-soft);
  white-space: nowrap;
}
.year-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border: 1.5px solid var(--border);
  border-radius: 16px;
  background: var(--bg-surface);
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--text-soft);
  transition: all 0.12s;
}
.year-badge:hover { border-color: #16a34a; color: #15803d; }
.year-badge.active {
  border-color: #16a34a;
  background: #f0fdf4;
  color: #166534;
  font-weight: 700;
}
.year-badge-cnt {
  font-size: 0.65rem;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 0 5px;
}
.year-badge.active .year-badge-cnt { background: #dcfce7; color: #15803d; }

/* 危険ボタン */
.btn-danger {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #dc2626;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.78rem;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.1s;
}
.btn-danger:hover { background: #fee2e2; border-color: #f87171; }

/* 確認ダイアログ */
.confirm-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.confirm-dialog {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 1.5rem 2rem;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 10px 40px rgba(0,0,0,0.25);
  border: 1px solid #fca5a5;
}
.confirm-dialog p { margin: 0 0 0.5rem; font-size: 0.9rem; }
.confirm-sub { font-size: 0.78rem; color: #ef4444; }
.confirm-btns { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }

/* Tools */
.ap-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 0.65rem;
}
.tools-label { font-size: 0.75rem; color: var(--text-soft); }
.tool-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px;
  border: 1.5px solid var(--border);
  border-radius: 20px;
  background: var(--bg-surface);
  cursor: pointer;
  font-size: 0.78rem;
  transition: all 0.12s;
  color: var(--text-main);
}
.tool-sym { font-size: 0.88rem; }
.tool-btn.sow.active     { border-color: #16a34a; color: #16a34a; background: #f0fdf4; }
.tool-btn.transplant.active { border-color: #2563eb; color: #2563eb; background: #eff6ff; }
.tool-btn.harvest.active { border-color: #dc2626; color: #dc2626; background: #fef2f2; }
.tool-btn.bar.active     { border-color: #6b7280; color: #374151; background: #f3f4f6; }
.tool-btn.erase.active   { border-color: #9ca3af; color: #6b7280; background: #f9fafb; }

/* Veggie Panel */
.veggie-panel {
  padding: 0.85rem 1rem;
  border: 1px solid rgba(22,163,74,0.18);
  border-radius: 10px;
  margin-bottom: 0.75rem;
}
.veggie-panel-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-bottom: 0.6rem;
}
.veggie-search {
  width: 200px;
  padding: 6px 10px;
  border-radius: 8px;
}
.veggie-count-label {
  font-size: 0.75rem;
  color: var(--text-soft);
  flex: 1;
  min-width: 120px;
}
.veggie-add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.veggie-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-height: 160px;
  overflow-y: auto;
}
.veggie-chip {
  padding: 3px 11px;
  border: 1px solid rgba(22,163,74,0.3);
  border-radius: 16px;
  background: rgba(22,163,74,0.05);
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--text-main);
  transition: all 0.1s;
  display: flex;
  align-items: center;
  gap: 4px;
}
.veggie-chip:hover { background: rgba(22,163,74,0.15); }
.veggie-chip.selected {
  background: rgba(22,163,74,0.2);
  border-color: #16a34a;
  color: #15803d;
  font-weight: 600;
}
.chip-check {
  font-size: 0.72rem;
  color: #16a34a;
  font-weight: 800;
}

/* Grid */
.ap-grid-wrap {
  overflow-x: auto;
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: 8px;
  background: #fff;
}
.ap-grid {
  border-collapse: collapse;
  font-size: 0.68rem;
  white-space: nowrap;
}
.ap-grid th, .ap-grid td {
  border: 1px solid rgba(0,0,0,0.13);
}
.lbl-cell {
  position: sticky;
  left: 0;
  z-index: 3;
  background: #f8f9fa;
  min-width: 115px;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-weight: 700;
}
/* 年度ヘッダー */
.year-th {
  text-align: center;
  padding: 3px 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.03em;
}
.year-th.curr-yr    { background: #dcfce7; color: #166534; }
.year-th.next-yr-th { background: #dbeafe; color: #1e40af; }

.month-th {
  text-align: center;
  background: #f0fdf4;
  padding: 4px 0;
  font-weight: 800;
  font-size: 0.72rem;
  min-width: 75px;
}
.month-th.next-yr { background: #eff6ff; }
.period-th {
  text-align: center;
  width: 25px;
  min-width: 25px;
  background: #fafafa;
  padding: 2px 0;
  font-size: 0.62rem;
  color: #64748b;
}
.period-th.next-yr { background: #f5f9ff; }
.data-row:hover .data-cell:not(.c-growing_bar):not(.c-harvest_bar):not(.c-sow):not(.c-transplant):not(.c-harvest_start):not(.c-harvest_end) {
  background: rgba(22,163,74,0.04);
}
.data-cell {
  width: 25px;
  min-width: 25px;
  height: 22px;
  text-align: center;
  cursor: pointer;
  vertical-align: middle;
  transition: background 0.08s;
  user-select: none;
}
.data-cell:hover { background: rgba(22,163,74,0.12) !important; }
.sym { font-size: 0.82rem; line-height: 1; display: block; }

/* Cell types */
.c-sow       { }
.c-sow .sym  { color: #16a34a; font-weight: 700; }
.c-transplant { }
.c-transplant .sym { color: #1d4ed8; font-weight: 700; }
/* 収穫開始 □ */
.c-harvest_start .sym { color: #dc2626; font-weight: 700; font-size: 0.9rem; }
/* 収穫終了 × */
.c-harvest_end .sym { color: #7f1d1d; font-weight: 900; font-size: 0.85rem; }
/* 育成期間バー（定植→収穫開始）: 薄い緑ライン */
.c-growing_bar { background: rgba(22,163,74,0.13); }
.c-growing_bar:hover { background: rgba(22,163,74,0.22) !important; }
/* 収穫期間バー（収穫開始→収穫終了）: オレンジ填め */
.c-harvest_bar { background: rgba(234,88,12,0.18); }
.c-harvest_bar:hover { background: rgba(234,88,12,0.30) !important; }
/* 旧データ互換 */
.c-bar       { background: rgba(22,163,74,0.13); }
.c-harvest .sym { color: #dc2626; font-weight: 700; }

.row-lbl {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.del-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #ef4444;
  padding: 1px;
  opacity: 0.6;
  flex-shrink: 0;
}
.del-btn:hover { opacity: 1; }

.empty-row {
  text-align: center;
  padding: 2rem;
  color: #94a3b8;
  font-size: 0.82rem;
}

/* Legend */
.ap-legend {
  display: flex;
  gap: 1.2rem;
  margin-top: 0.6rem;
  font-size: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}
.leg { color: var(--text-soft); }
.leg.sow         { color: #16a34a; font-weight: 700; }
.leg.transplant  { color: #1d4ed8; font-weight: 700; }
.leg.growing     { color: #5a7a5a; }
.leg.harvest     { color: #dc2626; font-weight: 700; }
.leg.harvest-bar { color: #ea580c; font-weight: 700; }
.leg.harvest-end { color: #9b1c1c; font-weight: 700; }
.leg.tip       { font-size: 0.7rem; color: #94a3b8; }

/* Takii Modal */
.takii-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.takii-modal {
  background: var(--bg-surface);
  border-radius: 14px;
  padding: 1.4rem;
  width: min(95vw, 1000px);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  border: 1px solid rgba(22,163,74,0.2);
}
.takii-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 1rem;
}
.takii-modal-header h3 { font-size: 1rem; font-weight: 800; }
.close-btn { background: none; border: none; cursor: pointer; color: var(--text-soft); }
.takii-inputs {
  display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;
}
.takii-inputs .field { flex: 1; min-width: 200px; }
.takii-inputs .field label { display: block; font-size: 0.75rem; color: var(--text-soft); margin-bottom: 4px; }
.takii-inputs input { width: 100%; padding: 6px 10px; border-radius: 8px; font-size: 0.85rem; }
.takii-img-wrap { margin-bottom: 1rem; }
.takii-calendar-img {
  max-width: 100%; border: 1px solid rgba(0,0,0,0.1);
  border-radius: 6px; display: block;
}
.takii-hint { font-size: 0.75rem; color: var(--text-soft); margin-bottom: 6px; }
.takii-err { color: #dc2626; font-size: 0.78rem; margin-top: 4px; }
.takii-grid-section { margin-bottom: 1rem; }
.takii-mini-grid-wrap { overflow-x: auto; border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; }
.takii-mini-grid td { height: 26px; }
.takii-footer { display: flex; gap: 0.5rem; justify-content: flex-end; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.csv-error {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #dc2626;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.8rem;
  margin-bottom: 0.6rem;
}

/* ===== 印刷スタイル ===== */
@media print {
  @page { size: A4 landscape; margin: 10mm 8mm; }

  /* 画面専用要素を非表示 */
  .no-print { display: none !important; }

  /* 印刷専用要素を表示 */
  .print-only { display: block !important; }

  /* ap-view のパディングをリセット */
  .ap-view { padding: 0; }

  /* ─── 印刷ヘッダー ─── */
  .prt-doc-header { margin-bottom: 5pt; }

  .prt-title-band {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-top: 2pt solid #1a3a1a;
    border-bottom: 1pt solid #1a3a1a;
    padding: 3pt 0;
    margin-bottom: 2pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .prt-farm-name {
    font-size: 9pt;
    font-weight: 700;
    color: #333;
    min-width: 80pt;
  }
  .prt-main-title {
    font-size: 16pt;
    font-weight: 900;
    color: #1a3a1a;
    margin: 0;
    letter-spacing: 0.05em;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .prt-year-badge {
    font-size: 12pt;
    font-weight: 700;
    color: #1a3a1a;
    min-width: 80pt;
    text-align: right;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .prt-meta-band {
    font-size: 7.5pt;
    color: #555;
    margin-bottom: 3pt;
  }
  .prt-div { margin: 0 5pt; color: #bbb; }

  /* ─── 凡例帯 ─── */
  .prt-legend-band {
    display: flex;
    align-items: center;
    gap: 8pt;
    background: #f5f5f5;
    border: 0.5pt solid #ccc;
    border-radius: 2pt;
    padding: 2.5pt 8pt;
    margin-bottom: 4pt;
    font-size: 7.5pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .prt-leg-title { font-weight: 700; color: #333; margin-right: 2pt; }
  .prt-leg-item  { display: flex; align-items: center; gap: 2pt; }
  .prt-leg-arrow { color: #999; font-size: 7pt; }
  .prt-leg-label { color: #444; }
  .prt-sym { font-weight: 700; font-size: 8pt; }
  .prt-leg-sow        .prt-sym { color: #16a34a; }
  .prt-leg-transplant .prt-sym { color: #1d4ed8; }
  .prt-leg-harvest-start .prt-sym { color: #dc2626; }
  .prt-leg-harvest-end   .prt-sym { color: #7f1d1d; }
  .prt-leg-bar {
    display: inline-block;
    width: 18pt;
    height: 7pt;
    vertical-align: middle;
  }
  .prt-bar-growing {
    background: rgba(22, 163, 74, 0.28);
    border: 0.5pt solid #16a34a;
  }
  .prt-bar-harvest {
    background: rgba(234, 88, 12, 0.28);
    border: 0.5pt solid #ea580c;
  }

  /* ─── グリッド ─── */
  .ap-grid-wrap {
    border: none;
    overflow: visible;
  }
  .ap-grid {
    font-size: 0.52rem;
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .ap-grid th, .ap-grid td {
    border: 0.3pt solid #ccc;
    padding: 0;
  }
  .data-cell  { width: 15pt; min-width: 15pt; height: 12pt; }
  .lbl-cell   { min-width: 52pt; width: 52pt; font-size: 0.5rem; }
  .month-th   { font-size: 0.52rem; }
  .period-th  { font-size: 0.46rem; width: 15pt; min-width: 15pt; }
  .year-th    { font-size: 0.52rem; }

  /* 印刷時にマーカーの色を確実に出力 */
  .sym { font-size: 0.72rem; }
  .c-sow        .sym { color: #16a34a !important; }
  .c-transplant .sym { color: #1d4ed8 !important; }
  .c-harvest_start .sym { color: #dc2626 !important; }
  .c-harvest_end   .sym { color: #7f1d1d !important; }
  .c-growing_bar {
    background: rgba(22, 163, 74, 0.22) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .c-harvest_bar {
    background: rgba(234, 88, 12, 0.22) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
