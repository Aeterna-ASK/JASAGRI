<script setup>
import { ref, computed } from 'vue';
import { ShieldCheck, Plus, Trash2, Printer, ChevronRight, CheckCircle2 } from 'lucide-vue-next';
import { state, actions } from '../../store';

// ===== タブ管理 =====
const activeTab = ref('dates'); // 'dates' | 'check' | 'package'

// ===== 監査日管理 =====
const newAuditDate   = ref('');
const newAuditNote   = ref('');
const showAddForm    = ref(false);

// 監査日一覧（古い順）
const auditDates = computed(() =>
  [...(state.records.t_audit_dates || [])].sort((a, b) => a.date.localeCompare(b.date))
);

// 現在の監査期間を自動算出
const currentPeriod = computed(() => {
  const dates = auditDates.value; // 昇順ソート済み
  if (dates.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);

  // 過去の監査日（今日以前）と将来の監査日（今日より後）に分ける
  const pastDates   = dates.filter(d => d.date <= today);
  const futureDates = dates.filter(d => d.date >  today);

  // 過去の監査日がなければ期間算出不可
  if (pastDates.length === 0) return null;

  // 前回監査 = 最新の過去監査日
  const last = pastDates[pastDates.length - 1];

  // 開始日：前回監査月の1日
  const lastD = new Date(last.date);
  const start  = new Date(lastD.getFullYear(), lastD.getMonth(), 1);
  const startStr = start.toISOString().slice(0, 10);

  // 終了日：次回予定（最も近い将来日）or 今日
  const next   = futureDates[0];
  const endStr = next ? next.date : today;

  const fmt = (s) => {
    const d = new Date(s);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  };

  return {
    startDate: startStr,
    endDate:   endStr,
    label:     `${fmt(startStr)}〜${fmt(endStr)}`,
    lastAudit: last.date,
    nextAudit: next ? next.date : null,
  };
});

function addAuditDate() {
  if (!newAuditDate.value) return;
  actions.addAuditDate(newAuditDate.value, newAuditNote.value);
  actions.showToast('監査日を登録しました', 'success');
  newAuditDate.value = '';
  newAuditNote.value = '';
  showAddForm.value  = false;
}

function deleteAuditDate(id) {
  if (!confirm('この監査日を削除しますか？')) return;
  actions.deleteAuditDate(id);
  // 監査モードが有効なら解除
  if (state.auditMode.active) actions.setAuditMode(false);
}

function toggleAuditMode() {
  if (state.auditMode.active) {
    actions.setAuditMode(false);
    actions.showToast('監査モードを解除しました', 'info');
  } else {
    if (!currentPeriod.value) {
      actions.showToast('監査日を1件以上登録してください', 'warning');
      return;
    }
    const p = currentPeriod.value;
    actions.setAuditMode(true, p.startDate, p.endDate, p.label);
    actions.showToast(`監査モードON：${p.label}`, 'success');
  }
}

// ===== 矛盾チェック =====
const checkRan = ref(false);
const checking = ref(false);

// ヘルパー: 期間内かどうか
function inPeriod(dateStr) {
  if (!currentPeriod.value) return false;
  return dateStr >= currentPeriod.value.startDate && dateStr <= currentPeriod.value.endDate;
}

// ヘルパー: 作物名の正規化（「有機トマト」→「トマト」）
function normCrop(name) {
  return (name || '').replace(/^有機/, '').trim();
}

// ヘルパー: 作業記録から作物名・作業種を抽出
function getWorkMeta(r) {
  let cropName = '';
  let workType = '';
  if (r.cropId) {
    cropName = state.masters.m_crop.find(c => String(c.id) === String(r.cropId))?.name || '';
  }
  if (!cropName && r.content) {
    const found = state.masters.m_crop.find(c => (r.content || '').includes(c.name));
    if (found) cropName = found.name;
  }
  if (!cropName && r.seeds?.length > 0) {
    cropName = r.seeds[0].name.split(' ')[0];
  }
  const c = r.content || '';
  if (c.includes('播種'))           workType = '播種';
  else if (c.includes('定植'))      workType = '定植';
  else if (c.includes('収穫開始') || c.includes('収穫始')) workType = '収穫開始';
  else if (c.includes('収穫終了') || c.includes('収穫終')) workType = '収穫終了';
  else if (c.includes('収穫'))      workType = '収穫';
  return { cropName, workType };
}

const issues = ref([]);

function runCheck() {
  if (!currentPeriod.value) {
    actions.showToast('監査日を登録してから実行してください', 'warning');
    return;
  }
  checking.value = true;
  setTimeout(() => {
    issues.value = buildIssues();
    checkRan.value = true;
    checking.value = false;
  }, 400);
}

function buildIssues() {
  const result = [];
  const p = currentPeriod.value;
  const workRecs     = (state.records.t_work_record     || []).filter(r => inPeriod(r.date));
  const deliveries   = (state.records.t_delivery_note   || []).filter(r => inPeriod(r.date));
  const harvests     = (state.records.t_harvest         || []).filter(r => inPeriod(r.date || r.createdAt?.slice(0,10)));
  const allWork      = state.records.t_work_record || [];

  // ── チェック1: 出荷記録 → 収穫作業なし ──────────────────
  deliveries.forEach(note => {
    const itemDetails = note.itemDetails || [];
    itemDetails.forEach(item => {
      const cropN = normCrop(item.name);
      if (!cropN) return;
      // 出荷日より前90日以内に収穫作業があるか
      const found = allWork.some(wr => {
        if (wr.date > note.date) return false;
        const diff = (new Date(note.date) - new Date(wr.date)) / 86400000;
        if (diff > 120) return false;
        const { cropName, workType } = getWorkMeta(wr);
        return normCrop(cropName).includes(cropN) || cropN.includes(normCrop(cropName))
          ? workType.includes('収穫') || (wr.content || '').includes('収穫')
          : false;
      });
      if (!found) {
        result.push({
          level: 'critical',
          icon: '🔴',
          title: `出荷記録あり → 収穫作業記録なし`,
          detail: `${note.date}  ${cropN}  ${item.quantity}${item.unit || 'kg'}  出荷`,
          hint: '収穫作業記録が見当たりません。作業履歴を確認・追加してください。',
          tab: 'history',
        });
      }
    });
  });

  // ── チェック2: 収穫作業 → 播種/定植記録なし ─────────────
  const harvestWorks = workRecs.filter(r => {
    const { workType } = getWorkMeta(r);
    return workType.includes('収穫');
  });
  harvestWorks.forEach(wr => {
    const { cropName } = getWorkMeta(wr);
    if (!cropName) return;
    // 収穫日より前に同作物の播種 or 定植があるか
    const found = allWork.some(w2 => {
      if (w2.date >= wr.date) return false;
      const { cropName: cn2, workType: wt2 } = getWorkMeta(w2);
      const sameField = !wr.fieldId || !w2.fieldId || String(wr.fieldId) === String(w2.fieldId);
      const sameCrop  = normCrop(cn2) === normCrop(cropName) ||
                        normCrop(cropName).includes(normCrop(cn2)) ||
                        normCrop(cn2).includes(normCrop(cropName));
      return sameField && sameCrop && (wt2 === '播種' || wt2 === '定植' ||
        (w2.content || '').includes('播種') || (w2.content || '').includes('定植'));
    });
    if (!found) {
      result.push({
        level: 'warning',
        icon: '🟡',
        title: `収穫作業あり → 播種・定植記録なし`,
        detail: `${wr.date}  ${cropName}  収穫作業記録はあるが、播種・定植の記録が見当たらない`,
        hint: '播種または定植の作業記録を確認・追加してください。',
        tab: 'history',
      });
    }
  });

  // ── チェック3: 年間計画の作物 → 作業記録なし ─────────────
  const planYear = new Date(p.startDate).getFullYear();
  const planKey  = `${planYear}-${planYear + 1}`;
  const planRows = state.records.t_annual_plan?.[planKey]?.rows || [];
  planRows.forEach(row => {
    const has = workRecs.some(wr => {
      const { cropName } = getWorkMeta(wr);
      return normCrop(cropName).includes(normCrop(row.name)) ||
             normCrop(row.name).includes(normCrop(cropName));
    });
    if (!has) {
      result.push({
        level: 'warning',
        icon: '🟡',
        title: `年間計画に登録 → 作業記録なし`,
        detail: `${row.name}  年間生産予定表に登録されているが、監査期間中の作業記録がない`,
        hint: '実際に栽培した場合は作業記録を追加してください。栽培しなかった場合は年間計画から削除を検討してください。',
        tab: 'annualplan',
      });
    }
  });

  // ── チェック4: 長期間の作業記録空白 ──────────────────────
  const sorted = [...workRecs].sort((a, b) => a.date.localeCompare(b.date));
  let prev = p.startDate;
  sorted.forEach(wr => {
    const gap = (new Date(wr.date) - new Date(prev)) / 86400000;
    if (gap >= 14) {
      result.push({
        level: 'info',
        icon: 'ℹ️',
        title: `作業記録の空白期間 ${Math.floor(gap)}日間`,
        detail: `${prev} 〜 ${wr.date}  の間、作業記録がありません`,
        hint: '農閑期であれば問題ありません。記録漏れの場合は補完してください。',
        tab: 'history',
      });
    }
    prev = wr.date;
  });
  // 最後の記録から期末まで
  if (sorted.length > 0) {
    const gap = (new Date(p.endDate) - new Date(sorted[sorted.length - 1].date)) / 86400000;
    if (gap >= 14) {
      result.push({
        level: 'info',
        icon: 'ℹ️',
        title: `期末の作業記録空白 ${Math.floor(gap)}日間`,
        detail: `${sorted[sorted.length - 1].date} 〜 ${p.endDate}  作業記録なし`,
        hint: '農閑期であれば問題ありません。',
        tab: 'history',
      });
    }
  }

  return result;
}

const criticalCount = computed(() => issues.value.filter(i => i.level === 'critical').length);
const warningCount  = computed(() => issues.value.filter(i => i.level === 'warning').length);
const infoCount     = computed(() => issues.value.filter(i => i.level === 'info').length);

function goTo(tab) {
  state.activeTab = tab;
}

// ===== 監査パッケージ印刷 =====
const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

const periodWorkRecs = computed(() => {
  if (!currentPeriod.value) return [];
  return (state.records.t_work_record || [])
    .filter(r => inPeriod(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));
});

const periodHarvests = computed(() => {
  if (!currentPeriod.value) return [];
  return (state.records.t_harvest || [])
    .filter(r => inPeriod(r.date || r.createdAt?.slice(0, 10)))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
});

const periodDeliveries = computed(() => {
  if (!currentPeriod.value) return [];
  return (state.records.t_delivery_note || [])
    .filter(r => inPeriod(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));
});

const periodMaterials = computed(() => {
  if (!currentPeriod.value) return [];
  return (state.records.t_material_receipt || [])
    .filter(r => inPeriod(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));
});

function getFieldName(id) {
  return state.masters.m_field.find(f => String(f.id) === String(id))?.name || id || '－';
}

function printPackage() {
  if (!currentPeriod.value) {
    actions.showToast('監査日を登録してください', 'warning');
    return;
  }
  window.print();
}
</script>

<template>
  <div class="audit-view">

    <!-- ===== ヘッダー ===== -->
    <div class="audit-header no-print">
      <div class="audit-header-left">
        <ShieldCheck size="20" class="header-icon" />
        <h1>監査管理</h1>
        <span v-if="state.auditMode.active" class="mode-badge active">
          📋 監査モード中：{{ state.auditMode.label }}
        </span>
      </div>
    </div>

    <!-- ===== タブ ===== -->
    <div class="audit-tabs no-print">
      <button
        v-for="t in [
          { id:'dates',   label:'① 監査日管理' },
          { id:'check',   label:'② 矛盾チェック' },
          { id:'package', label:'③ 監査パッケージ印刷' },
        ]"
        :key="t.id"
        @click="activeTab = t.id"
        :class="['tab-btn', { active: activeTab === t.id }]"
      >{{ t.label }}</button>
    </div>

    <!-- ===================================================
         タブ①：監査日管理
    ==================================================== -->
    <div v-if="activeTab === 'dates'" class="tab-content no-print">

      <!-- 現在の監査期間 -->
      <div v-if="currentPeriod" class="period-card">
        <div class="period-label">現在の監査期間</div>
        <div class="period-range">{{ currentPeriod.label }}</div>
        <div class="period-sub">
          前回監査：{{ currentPeriod.lastAudit }}
          <span v-if="currentPeriod.nextAudit">　次回予定：{{ currentPeriod.nextAudit }}</span>
          <span v-else class="period-warn">　次回予定：未登録</span>
        </div>
        <button @click="toggleAuditMode" :class="['mode-toggle', state.auditMode.active ? 'mode-on' : 'mode-off']">
          {{ state.auditMode.active ? '✅ 監査モード解除' : '📋 監査モードON（全画面フィルター）' }}
        </button>
      </div>
      <div v-else class="period-empty">
        ⚠️ 監査日が未登録です。下のフォームから登録してください。
      </div>

      <!-- 監査日一覧 -->
      <div class="dates-section">
        <div class="section-title">監査日一覧</div>
        <div v-if="auditDates.length === 0" class="empty-msg">まだ監査日が登録されていません</div>
        <div v-for="d in auditDates" :key="d.id" class="date-row">
          <div class="date-info">
            <span class="date-badge">{{ d.date }}</span>
            <span class="date-note">{{ d.note || '（備考なし）' }}</span>
          </div>
          <button @click="deleteAuditDate(d.id)" class="del-btn">
            <Trash2 size="13" />
          </button>
        </div>
      </div>

      <!-- 監査日追加 -->
      <div class="add-section">
        <button v-if="!showAddForm" @click="showAddForm = true" class="btn-add">
          <Plus size="14" /> 監査日を追加
        </button>
        <div v-else class="add-form">
          <div class="add-form-title">監査日を登録</div>
          <div class="add-form-row">
            <label>実施日</label>
            <input v-model="newAuditDate" type="date" class="form-input" />
          </div>
          <div class="add-form-row">
            <label>備考（任意）</label>
            <input v-model="newAuditNote" type="text" placeholder="例：第5回 有機JAS定期審査" class="form-input" />
          </div>
          <div class="add-form-btns">
            <button @click="addAuditDate" class="btn-primary btn-sm">登録</button>
            <button @click="showAddForm = false" class="btn-secondary btn-sm">キャンセル</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================================================
         タブ②：矛盾チェック
    ==================================================== -->
    <div v-if="activeTab === 'check'" class="tab-content no-print">
      <div class="check-header">
        <div class="check-period-info" v-if="currentPeriod">
          対象期間：<strong>{{ currentPeriod.label }}</strong>
        </div>
        <button @click="runCheck" :disabled="!currentPeriod || checking" class="btn-run-check">
          <span v-if="checking">🔄 分析中...</span>
          <span v-else>🔍 矛盾チェックを実行</span>
        </button>
      </div>

      <!-- 結果サマリー -->
      <div v-if="checkRan && !checking" class="check-summary">
        <div class="summary-item critical">
          <span class="sum-icon">🔴</span>
          <span class="sum-count">{{ criticalCount }}</span>
          <span class="sum-label">重大な矛盾</span>
        </div>
        <div class="summary-item warning">
          <span class="sum-icon">🟡</span>
          <span class="sum-count">{{ warningCount }}</span>
          <span class="sum-label">注意</span>
        </div>
        <div class="summary-item info">
          <span class="sum-icon">ℹ️</span>
          <span class="sum-count">{{ infoCount }}</span>
          <span class="sum-label">情報</span>
        </div>
        <div v-if="issues.length === 0" class="sum-ok">
          <CheckCircle2 size="18" class="ok-icon" /> 問題は検出されませんでした
        </div>
      </div>

      <!-- 矛盾一覧 -->
      <div v-if="checkRan && !checking && issues.length > 0" class="issues-list">
        <div
          v-for="(issue, i) in issues" :key="i"
          :class="['issue-card', `issue-${issue.level}`]"
        >
          <div class="issue-top">
            <span class="issue-icon">{{ issue.icon }}</span>
            <span class="issue-title">{{ issue.title }}</span>
            <button @click="goTo(issue.tab)" class="issue-goto">
              該当画面へ <ChevronRight size="12" />
            </button>
          </div>
          <div class="issue-detail">{{ issue.detail }}</div>
          <div class="issue-hint">💡 {{ issue.hint }}</div>
        </div>
      </div>

      <div v-if="!checkRan" class="check-idle">
        「矛盾チェックを実行」ボタンを押すと、監査期間のデータを自動分析します。<br>
        <small>チェック内容：出荷↔収穫の整合性 / 収穫↔播種・定植の整合性 / 年間計画との照合 / 長期空白期間の検出</small>
      </div>
    </div>

    <!-- ===================================================
         タブ③：監査パッケージ印刷
    ==================================================== -->
    <div v-if="activeTab === 'package'" class="tab-content no-print">
      <div v-if="!currentPeriod" class="period-empty">
        ⚠️ 監査日を登録してから利用してください。
      </div>
      <div v-else>
        <div class="package-info">
          <div><strong>出力対象期間：</strong>{{ currentPeriod.label }}</div>
          <div><strong>作業記録：</strong>{{ periodWorkRecs.length }}件</div>
          <div><strong>収穫記録：</strong>{{ periodHarvests.length }}件</div>
          <div><strong>資材購入：</strong>{{ periodMaterials.length }}件</div>
          <div><strong>出荷記録：</strong>{{ periodDeliveries.length }}件</div>
        </div>
        <button @click="printPackage" class="btn-print-pkg">
          <Printer size="16" /> 監査パッケージを印刷
        </button>
        <div class="package-note">
          印刷ダイアログで「すべてのページ」「横向き」を選択してください。<br>
          目次・表紙・各セクションが自動的に出力されます。
        </div>
      </div>
    </div>

    <!-- ===================================================
         印刷専用コンテンツ（画面では非表示）
    ==================================================== -->
    <div v-if="currentPeriod" class="print-only pkg-pages">

      <!-- ── 表紙 ── -->
      <div class="pkg-cover">
        <div class="pkg-cover-inner">
          <div class="pkg-cover-org">有機JAS認証事業者</div>
          <h1 class="pkg-cover-title">監査証拠書類</h1>
          <div class="pkg-cover-year">{{ currentPeriod.label }}</div>
          <div class="pkg-cover-table">
            <div class="pkg-cov-row"><span>農場名</span><span>{{ state.farmInfo.name || '－' }}</span></div>
            <div class="pkg-cov-row"><span>代表者</span><span>{{ state.farmInfo.representative || '－' }}</span></div>
            <div class="pkg-cov-row"><span>所在地</span><span>{{ state.farmInfo.address || '－' }}</span></div>
            <div class="pkg-cov-row"><span>認証番号</span><span>{{ state.farmInfo.invoiceNo || '－' }}</span></div>
            <div class="pkg-cov-row"><span>審査期間</span><span>{{ currentPeriod.label }}</span></div>
            <div class="pkg-cov-row"><span>作成日</span><span>{{ today }}</span></div>
          </div>
        </div>
      </div>

      <!-- ── 目次 ── -->
      <div class="pkg-section">
        <div class="pkg-section-header">目　次</div>
        <table class="pkg-toc-table">
          <tr><td>第1章</td><td>現場作業記録台帳</td><td>{{ periodWorkRecs.length }}件</td></tr>
          <tr><td>第2章</td><td>収穫記録台帳</td><td>{{ periodHarvests.length }}件</td></tr>
          <tr><td>第3章</td><td>資材購入記録台帳</td><td>{{ periodMaterials.length }}件</td></tr>
          <tr><td>第4章</td><td>出荷・納品記録台帳</td><td>{{ periodDeliveries.length }}件</td></tr>
          <tr><td>第5章</td><td>年間生産予定表</td><td>参照</td></tr>
        </table>
      </div>

      <!-- ── 第1章：作業記録 ── -->
      <div class="pkg-section">
        <div class="pkg-chapter-label">第1章</div>
        <div class="pkg-section-header">現場作業記録台帳</div>
        <div class="pkg-period-note">対象期間：{{ currentPeriod.label }}</div>
        <table class="pkg-table">
          <thead>
            <tr>
              <th style="width:70pt">作業日</th>
              <th style="width:70pt">圃場</th>
              <th style="width:60pt">品目</th>
              <th>作業内容</th>
              <th style="width:50pt">作業者</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="periodWorkRecs.length === 0">
              <td colspan="5" class="pkg-empty">記録なし</td>
            </tr>
            <tr v-for="r in periodWorkRecs" :key="r.id">
              <td>{{ r.date }}</td>
              <td>{{ getFieldName(r.fieldId) }}</td>
              <td>{{ state.masters.m_crop.find(c => String(c.id) === String(r.cropId))?.name || '－' }}</td>
              <td>{{ r.content }}</td>
              <td>{{ r.workerName || '－' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── 第2章：収穫記録 ── -->
      <div class="pkg-section">
        <div class="pkg-chapter-label">第2章</div>
        <div class="pkg-section-header">収穫記録台帳</div>
        <div class="pkg-period-note">対象期間：{{ currentPeriod.label }}</div>
        <table class="pkg-table">
          <thead>
            <tr>
              <th style="width:70pt">収穫日</th>
              <th style="width:70pt">圃場</th>
              <th style="width:80pt">品目</th>
              <th style="width:60pt">重量</th>
              <th>備考</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="periodHarvests.length === 0">
              <td colspan="5" class="pkg-empty">記録なし</td>
            </tr>
            <tr v-for="r in periodHarvests" :key="r.id">
              <td>{{ r.date || r.createdAt?.slice(0,10) }}</td>
              <td>{{ getFieldName(r.fieldId) }}</td>
              <td>{{ r.cropName || '－' }}</td>
              <td>{{ r.weight ? r.weight + 'kg' : '－' }}</td>
              <td>{{ r.note || '－' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── 第3章：資材購入 ── -->
      <div class="pkg-section">
        <div class="pkg-chapter-label">第3章</div>
        <div class="pkg-section-header">資材購入記録台帳</div>
        <div class="pkg-period-note">対象期間：{{ currentPeriod.label }}</div>
        <table class="pkg-table">
          <thead>
            <tr>
              <th style="width:70pt">購入日</th>
              <th style="width:120pt">資材名</th>
              <th style="width:50pt">数量</th>
              <th style="width:70pt">仕入先</th>
              <th>備考</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="periodMaterials.length === 0">
              <td colspan="5" class="pkg-empty">記録なし</td>
            </tr>
            <tr v-for="r in periodMaterials" :key="r.id">
              <td>{{ r.date }}</td>
              <td>{{ r.materialName || r.name || '－' }}</td>
              <td>{{ r.quantity ? r.quantity + (r.unit || '') : '－' }}</td>
              <td>{{ r.supplier || r.partnerName || '－' }}</td>
              <td>{{ r.note || '－' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── 第4章：出荷記録 ── -->
      <div class="pkg-section">
        <div class="pkg-chapter-label">第4章</div>
        <div class="pkg-section-header">出荷・納品記録台帳</div>
        <div class="pkg-period-note">対象期間：{{ currentPeriod.label }}</div>
        <table class="pkg-table">
          <thead>
            <tr>
              <th style="width:70pt">出荷日</th>
              <th style="width:80pt">納品先</th>
              <th>品目・数量</th>
              <th style="width:60pt">伝票番号</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="periodDeliveries.length === 0">
              <td colspan="4" class="pkg-empty">記録なし</td>
            </tr>
            <tr v-for="r in periodDeliveries" :key="r.id">
              <td>{{ r.date }}</td>
              <td>{{ r.partnerName || '－' }}</td>
              <td>{{ r.items }}</td>
              <td>{{ r.slipNo || '－' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── フッター ── -->
      <div class="pkg-footer">
        本書類は有機JAS認証審査のために Orgaly（有機JASのための畑のカルテ）により出力されました。
        出力日：{{ today }}
      </div>
    </div>

  </div>
</template>

<style scoped>
.audit-view { padding: 1.2rem 1.5rem; background: var(--bg-main); min-height: 100%; }

/* Header */
.audit-header { display: flex; align-items: center; margin-bottom: 1rem; }
.audit-header-left { display: flex; align-items: center; gap: 0.6rem; }
.audit-header-left h1 { font-size: 1.15rem; font-weight: 900; margin: 0; }
.header-icon { color: #16a34a; }
.mode-badge {
  font-size: 0.75rem; font-weight: 700;
  background: #dcfce7; color: #15803d;
  border: 1.5px solid #86efac;
  border-radius: 20px; padding: 2px 10px;
}

/* Tabs */
.audit-tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--border); margin-bottom: 1.2rem; }
.tab-btn {
  padding: 7px 18px; border: none; background: transparent;
  font-size: 0.85rem; font-weight: 600; color: var(--text-soft);
  cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px;
  transition: all 0.15s;
}
.tab-btn:hover { color: var(--text-main); }
.tab-btn.active { color: #16a34a; border-bottom-color: #16a34a; background: transparent; }

.tab-content { max-width: 800px; }

/* 現在の監査期間 */
.period-card {
  background: #f0fdf4; border: 1.5px solid #86efac;
  border-radius: 12px; padding: 1rem 1.2rem; margin-bottom: 1.2rem;
}
.period-label { font-size: 0.72rem; color: #16a34a; font-weight: 700; margin-bottom: 4px; }
.period-range { font-size: 1.25rem; font-weight: 900; color: #14532d; margin-bottom: 4px; }
.period-sub { font-size: 0.78rem; color: #555; margin-bottom: 0.8rem; }
.period-warn { color: #d97706; font-weight: 700; }
.period-empty { background: #fef9c3; border: 1px solid #fde68a; border-radius: 10px; padding: 0.8rem 1rem; color: #92400e; font-size: 0.85rem; margin-bottom: 1rem; }

.mode-toggle {
  padding: 7px 16px; border-radius: 8px; border: none; cursor: pointer;
  font-size: 0.82rem; font-weight: 700;
}
.mode-on { background: #f0fdf4; border: 1.5px solid #16a34a !important; color: #15803d; border: none; }
.mode-off { background: #16a34a; color: white; }
.mode-toggle:hover { opacity: 0.85; }

/* 監査日一覧 */
.dates-section { margin-bottom: 1rem; }
.section-title { font-size: 0.78rem; font-weight: 700; color: var(--text-soft); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
.empty-msg { font-size: 0.82rem; color: var(--text-soft); padding: 0.5rem 0; }
.date-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: var(--bg-surface);
  border: 1px solid var(--border); border-radius: 8px; margin-bottom: 6px;
}
.date-info { display: flex; align-items: center; gap: 10px; }
.date-badge {
  font-size: 0.85rem; font-weight: 700; color: #1d4ed8;
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 2px 8px;
}
.date-note { font-size: 0.8rem; color: var(--text-soft); }
.del-btn {
  background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px;
  border-radius: 4px; display: flex; align-items: center;
}
.del-btn:hover { background: #fef2f2; }

/* 追加フォーム */
.add-section { margin-top: 0.5rem; }
.btn-add {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; background: #f8fafc; border: 1.5px dashed #94a3b8;
  border-radius: 8px; cursor: pointer; font-size: 0.82rem; color: var(--text-soft);
}
.btn-add:hover { border-color: #16a34a; color: #16a34a; }
.add-form { background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 1rem; }
.add-form-title { font-size: 0.85rem; font-weight: 700; margin-bottom: 0.7rem; }
.add-form-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; }
.add-form-row label { font-size: 0.8rem; color: var(--text-soft); min-width: 70px; }
.form-input { border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; font-size: 0.85rem; flex: 1; }
.add-form-btns { display: flex; gap: 8px; margin-top: 0.8rem; }
.btn-primary { background: #16a34a; color: white; border: none; border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 0.82rem; font-weight: 700; }
.btn-secondary { background: var(--bg-surface); color: var(--text-soft); border: 1px solid var(--border); border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 0.82rem; }
.btn-sm { font-size: 0.8rem; }

/* チェック */
.check-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.check-period-info { font-size: 0.85rem; color: var(--text-soft); }
.btn-run-check {
  padding: 8px 20px; background: #1d4ed8; color: white;
  border: none; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 700;
}
.btn-run-check:hover { background: #1e40af; }
.btn-run-check:disabled { opacity: 0.6; cursor: default; }

.check-summary {
  display: flex; align-items: center; gap: 1.2rem;
  background: #f8fafc; border: 1px solid var(--border);
  border-radius: 10px; padding: 0.8rem 1.2rem; margin-bottom: 1rem;
}
.summary-item { display: flex; align-items: center; gap: 5px; }
.sum-icon { font-size: 1rem; }
.sum-count { font-size: 1.1rem; font-weight: 900; }
.sum-label { font-size: 0.75rem; color: var(--text-soft); }
.sum-ok { display: flex; align-items: center; gap: 6px; color: #16a34a; font-weight: 700; font-size: 0.85rem; }
.ok-icon { color: #16a34a; }

.issues-list { display: flex; flex-direction: column; gap: 8px; }
.issue-card { border-radius: 10px; padding: 0.8rem 1rem; }
.issue-critical { background: #fef2f2; border: 1.5px solid #fca5a5; }
.issue-warning  { background: #fffbeb; border: 1.5px solid #fde68a; }
.issue-info     { background: #eff6ff; border: 1.5px solid #bfdbfe; }
.issue-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.issue-icon { font-size: 0.9rem; }
.issue-title { font-size: 0.85rem; font-weight: 700; flex: 1; }
.issue-goto {
  font-size: 0.72rem; padding: 2px 8px;
  background: white; border: 1px solid #cbd5e1;
  border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 2px;
  color: #1d4ed8;
}
.issue-goto:hover { background: #eff6ff; }
.issue-detail { font-size: 0.78rem; color: #444; margin-bottom: 3px; }
.issue-hint { font-size: 0.73rem; color: #666; }

.check-idle {
  background: #f8fafc; border: 1px solid var(--border);
  border-radius: 10px; padding: 1.2rem; color: var(--text-soft);
  font-size: 0.85rem; line-height: 1.6;
}

/* パッケージ */
.package-info {
  background: #f0fdf4; border: 1px solid #86efac;
  border-radius: 10px; padding: 0.8rem 1.2rem;
  font-size: 0.85rem; line-height: 1.8; margin-bottom: 1rem;
}
.btn-print-pkg {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 24px; background: #16a34a; color: white;
  border: none; border-radius: 8px; cursor: pointer;
  font-size: 0.9rem; font-weight: 700; margin-bottom: 0.6rem;
}
.btn-print-pkg:hover { background: #15803d; }
.package-note { font-size: 0.75rem; color: var(--text-soft); line-height: 1.5; }

/* 印刷専用 */
.print-only { display: none; }

/* ====================================================
   @media print
==================================================== */
@media print {
  @page { size: A4 landscape; margin: 12mm 10mm; }

  .no-print { display: none !important; }
  .print-only { display: block !important; }
  .audit-view { padding: 0; background: none; }

  /* 表紙 */
  .pkg-cover {
    display: flex; align-items: center; justify-content: center;
    height: 100vh; page-break-after: always;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .pkg-cover-inner { text-align: center; }
  .pkg-cover-org { font-size: 11pt; color: #555; margin-bottom: 16pt; letter-spacing: 0.1em; }
  .pkg-cover-title { font-size: 28pt; font-weight: 900; color: #1a3a1a; margin: 0 0 10pt 0; letter-spacing: 0.08em; }
  .pkg-cover-year { font-size: 16pt; font-weight: 700; color: #16a34a; margin-bottom: 30pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pkg-cover-table { border: 1pt solid #ccc; padding: 0; min-width: 280pt; }
  .pkg-cov-row { display: flex; border-bottom: 0.5pt solid #ddd; }
  .pkg-cov-row:last-child { border-bottom: none; }
  .pkg-cov-row span:first-child { width: 80pt; padding: 5pt 10pt; background: #f1f5f9; font-weight: 700; font-size: 9pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pkg-cov-row span:last-child { flex: 1; padding: 5pt 10pt; font-size: 9pt; }

  /* 目次・セクション */
  .pkg-section { page-break-before: always; padding-top: 4pt; }
  .pkg-chapter-label { font-size: 8pt; color: #888; margin-bottom: 2pt; }
  .pkg-section-header {
    font-size: 14pt; font-weight: 900; color: #1a3a1a;
    border-left: 4pt solid #16a34a; padding-left: 8pt;
    margin-bottom: 4pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .pkg-period-note { font-size: 8pt; color: #666; margin-bottom: 6pt; }

  /* 目次テーブル */
  .pkg-toc-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .pkg-toc-table td { padding: 6pt 10pt; border-bottom: 0.5pt solid #ddd; }
  .pkg-toc-table td:last-child { text-align: right; color: #888; }

  /* データテーブル */
  .pkg-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 4pt; }
  .pkg-table th { background: #f1f5f9; font-weight: 800; padding: 4pt 6pt; border: 0.5pt solid #ccc; text-align: left; font-size: 7.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pkg-table td { padding: 3pt 6pt; border: 0.5pt solid #ddd; vertical-align: top; font-size: 7.5pt; }
  .pkg-table tr:nth-child(even) td { background: #fafafa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pkg-empty { text-align: center; color: #aaa; padding: 10pt; }

  /* フッター */
  .pkg-footer { margin-top: 20pt; font-size: 7pt; color: #aaa; text-align: center; border-top: 0.5pt solid #eee; padding-top: 6pt; }
}
</style>
