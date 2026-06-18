<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { 
  FileText, Plus, Download, Trash2, Eye, Search, Truck, Calendar, X, Building2, Printer
} from 'lucide-vue-next';
import { state, actions } from '../../store';
import { addToRiryLink, updateInRiryLink } from '../../services/riryLinkSync.js';

const isAdding = ref(false);
const isPreviewOpen = ref(false);
const searchQuery = ref('');
const generatedNote = ref(null);
const editingNoteId = ref(null); // null=新規, 文字列=編集中ID
const printOrientation = ref('portrait'); // 'portrait' = 縦 / 'landscape' = 横

// Ri-Ry-Link 一括同期
const isBulkSyncing  = ref(false);
const bulkSyncResult = ref(null); // { added, updated, total } or null

const bulkSyncToRiryLink = async () => {
  if (isBulkSyncing.value) return;

  const TARGET = '黒酢の郷 桷志田';
  const allNotes = (state.records.t_delivery_note || [])
    .filter(n => n.partnerName === TARGET);

  const newNotes      = allNotes.filter(n => !n.riryLinkId);  // 未同期→新規追加
  const existingNotes = allNotes.filter(n =>  n.riryLinkId);  // 同期済み→品目名更新

  if (allNotes.length === 0) {
    actions.showToast('同期対象のレコード（黒酢の郷 桷志田）がありません', 'info');
    return;
  }

  isBulkSyncing.value  = true;
  bulkSyncResult.value = null;
  let added   = 0;
  let updated = 0;

  // ── Phase 1: 未同期レコードを Ri-Ry-Link に新規追加 ──────────────
  for (const note of newNotes) {
    try {
      const riryLinkId = await addToRiryLink(note);
      if (riryLinkId) {
        const idx = state.records.t_delivery_note.findIndex(n => n.id === note.id);
        if (idx !== -1) {
          state.records.t_delivery_note[idx] = {
            ...state.records.t_delivery_note[idx],
            riryLinkId,
          };
        }
        added++;
      }
    } catch (e) {
      console.error('[BulkSync] 追加エラー:', note.id, e);
    }
  }

  // ── Phase 2: 同期済みレコードを一括更新（「有機〇〇」品目名の修正を含む）──
  for (const note of existingNotes) {
    try {
      await updateInRiryLink(note);
      updated++;
    } catch (e) {
      console.error('[BulkSync] 更新エラー:', note.id, e);
    }
  }

  // Phase 1 で新規 ID が付与されたので Orgaly 側にも保存
  if (added > 0) actions.syncToCloud();

  isBulkSyncing.value  = false;
  bulkSyncResult.value = { added, updated, total: allNotes.length };

  const parts = [];
  if (added   > 0) parts.push(`新規追加 ${added} 件`);
  if (updated > 0) parts.push(`品目名更新 ${updated} 件`);
  actions.showToast(
    `Ri-Ry-Link 一括同期完了: ${parts.length ? parts.join('・') : '変更なし'}`,
    'success',
    6000
  );
};

const partners = computed(() => (state.masters.m_partner || []).filter(p => p.partnerType === '納品先' || p.category === '納品先'));

// 伝票番号が未採番のレコード数（0になったらボタンを非表示に）
const unassignedCount = computed(() =>
  (state.records.t_delivery_note || []).filter(n => !n.slipNo).length
);

// 検索フィルターおよび最新日付順（直近）の並び替え
const filteredAndSortedDeliveryNotes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  let list = [...(state.records.t_delivery_note || [])];

  // 監査モード中は監査期間でフィルタリング
  if (state.auditMode.active) {
    if (state.auditMode.startDate) list = list.filter(n => (n.date || '') >= state.auditMode.startDate);
    if (state.auditMode.endDate)   list = list.filter(n => (n.date || '') <= state.auditMode.endDate);
  }

  if (query) {
    list = list.filter(note => {
      const partnerObj = (state.masters.m_partner || []).find(p => p.id === note.partnerId);
      const partnerName = (partnerObj?.name || '不明').toLowerCase();
      const items = (note.items || '').toLowerCase();
      const slipNo = (note.slipNo || '').toLowerCase();
      return partnerName.includes(query) || items.includes(query) || slipNo.includes(query);
    });
  }

  // 日付の降順（新しい日付が上）、同じ日付の場合はIDの降順（新しく登録されたものが上）
  return list.sort((a, b) => {
    const dateCompare = (b.date || '').localeCompare(a.date || '');
    if (dateCompare !== 0) return dateCompare;
    return (b.id || '').localeCompare(a.id || '');
  });
});

const today = () => new Date().toISOString().split('T')[0];
// farmInfo.roundingMode に従って端数処理（'floor'=切り捨て / それ以外=四捨五入）
const applyRounding = (v) => {
  const n = Number(v) || 0;
  return state.farmInfo.roundingMode === 'floor' ? Math.floor(n) : Math.round(n);
};
const round = applyRounding; // 短縮エイリアス

const newNote = ref({
  date: today(),
  slipNo: '',
  partnerId: '',
  items: []
});

// 小計（税抜）
const subtotalAmount = computed(() => {
  const raw = (newNote.value.items || []).reduce(
    (sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0
  );
  return applyRounding(raw);
});

// 消費税額（動的）
const taxAmount = computed(() => {
  const rate = (state.farmInfo.taxRate != null) ? Number(state.farmInfo.taxRate) : 8;
  return applyRounding(subtotalAmount.value * (rate / 100));
});

// 合計（税込）
const totalAmount = computed(() => subtotalAmount.value + taxAmount.value);

// プレビュー表示用：保存済みの generatedNote から小計・税額を算出
const previewSubtotal = computed(() => {
  if (!generatedNote.value) return 0;
  // 保存時に subtotal が記録されている場合はそれを使う
  if (generatedNote.value.subtotal != null) return generatedNote.value.subtotal;
  // なければ itemDetails から再計算
  const raw = (generatedNote.value.itemDetails || []).reduce(
    (s, i) => s + (Number(i.quantity || 0) * Number(i.unitPrice || 0)), 0
  );
  return applyRounding(raw);
});
const previewTax    = computed(() => {
  if (generatedNote.value?.taxAmount != null) return generatedNote.value.taxAmount;
  const rate = (generatedNote.value?.farmInfo?.taxRate != null) 
    ? Number(generatedNote.value.farmInfo.taxRate) 
    : ((state.farmInfo.taxRate != null) ? Number(state.farmInfo.taxRate) : 8);
  return applyRounding(previewSubtotal.value * (rate / 100));
});
const previewTotal  = computed(() => {
  return previewSubtotal.value + previewTax.value;
});

const organicRemark = computed(() => {
  if (!generatedNote.value || !generatedNote.value.itemDetails) return '';
  const items = generatedNote.value.itemDetails;
  const organicItems = items.filter(i => i.isOrganic);
  
  if (organicItems.length === 0) {
    return '';
  } else if (organicItems.length === items.length) {
    return '【備考】有機JAS格付確認済み（JASマーク表示品）';
  } else {
    // 複数の有機品目がある場合は、それらを列挙する
    const names = organicItems.map(i => i.fullName).join('、');
    return `【備考】${names}は有機JAS格付確認済み（JASマーク表示品）`;
  }
});

// 過去に納品した商品のユニークリストと単価情報
const uniquePastItems = computed(() => {
  const notes = state.records.t_delivery_note || [];
  const itemsMap = new Map();
  const partnerId = newNote.value.partnerId;
  
  // 日付昇順でソート（新しい日付の値で上書きするため）
  const sortedNotes = [...notes].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  
  sortedNotes.forEach(note => {
    const isCurrentPartner = note.partnerId === partnerId;
    (note.itemDetails || []).forEach(item => {
      const name = item.name || item.fullName;
      if (!name) return;
      
      itemsMap.set(name, {
        name,
        unitPrice: item.unitPrice,
        isOrganic: item.isOrganic,
        isCurrentPartner
      });
    });
  });
  
  // 降順にして最新が上に来るようにする
  return Array.from(itemsMap.values()).reverse();
});

// 商品名変更時に過去の単価を自動参照・設定
const onItemNameChange = (item) => {
  if (!item.name) return;
  
  const notes = state.records.t_delivery_note || [];
  const partnerId = newNote.value.partnerId;
  
  // 最新の伝票から順に探す
  const sortedNotes = [...notes].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  
  let match = null;
  
  // 1. 選択中の取引先の過去データから探す
  if (partnerId) {
    for (const note of sortedNotes) {
      if (note.partnerId === partnerId) {
        const found = (note.itemDetails || []).find(i => i.name === item.name || i.fullName === item.name);
        if (found && found.unitPrice) {
          match = { unitPrice: found.unitPrice, isOrganic: found.isOrganic };
          break;
        }
      }
    }
  }
  
  // 2. 見つからなければ、取引先を問わずに直近の過去データから探す
  if (!match) {
    for (const note of sortedNotes) {
      const found = (note.itemDetails || []).find(i => i.name === item.name || i.fullName === item.name);
      if (found && found.unitPrice) {
        match = { unitPrice: found.unitPrice, isOrganic: found.isOrganic };
        break;
      }
    }
  }
  
  // 単価が未入力の場合のみ自動補完
  if (match) {
    if (item.unitPrice == null || item.unitPrice === '') {
      item.unitPrice = match.unitPrice;
    }
    if (match.isOrganic !== undefined) {
      item.isOrganic = match.isOrganic;
    }
  }
};

const addItem = () => {
  newNote.value.items.push({ name: '', quantity: null, unit: 'kg', unitPrice: null, isOrganic: true });
};

const removeItem = (index) => {
  newNote.value.items.splice(index, 1);
};

const handleSave = () => {
  if (newNote.value.items.length === 0) {
    actions.showToast('品目を1つ以上追加してください', 'warning');
    return;
  }
  if (!newNote.value.partnerId) {
    actions.showToast('納品先を選択してください', 'warning');
    return;
  }

  const selectedPartner = partners.value.find(p => p.id === newNote.value.partnerId);
  const noteData = {
    partnerId: newNote.value.partnerId,
    partnerName: selectedPartner?.name || '指定なし',
    items: newNote.value.items.map(i => `${i.isOrganic ? '有機' : ''}${i.name || '名称未設定'} (${i.quantity || 0}${i.unit} @¥${round(i.unitPrice)})`).join(', '),
    itemDetails: newNote.value.items.map(i => ({
      ...i,
      unitPrice: round(i.unitPrice),
      fullName: `${i.isOrganic ? '有機' : ''}${i.name || '名称未設定'}`
    })),
    subtotal: subtotalAmount.value,
    taxAmount: taxAmount.value,
    amount: totalAmount.value, // 税込合計
    date: newNote.value.date || today(),
    slipNo: newNote.value.slipNo?.trim() || undefined,
    farmInfo: { ...state.farmInfo }
  };

  if (editingNoteId.value) {
    // 編集モード：既存レコードを更新
    actions.updateDeliveryNote({ id: editingNoteId.value, ...noteData });
    const updated = (state.records.t_delivery_note || []).find(n => n.id === editingNoteId.value);
    generatedNote.value = updated ? { ...updated } : { ...noteData };
    actions.showToast('納品書を更新しました', 'success');
  } else {
    // 新規作成
    const latestNote = actions.addDeliveryNote(noteData);
    generatedNote.value = latestNote;
  }

  isPreviewOpen.value = true;
  isAdding.value = false;
};

const viewNote = (note) => {
  generatedNote.value = {
    ...note,
    farmInfo: note.farmInfo || { ...state.farmInfo },
    itemDetails: note.itemDetails || []
  };
  isPreviewOpen.value = true;
};

const editNote = (note) => {
  editingNoteId.value = note.id;
  newNote.value = {
    date: note.date || today(),
    slipNo: note.slipNo || '',
    partnerId: note.partnerId || '',
    items: (note.itemDetails || []).map(i => ({
      name: i.name || (i.fullName || '').replace(/^有機/, ''),
      quantity: i.quantity,
      unit: i.unit || 'kg',
      unitPrice: i.unitPrice,
      isOrganic: i.isOrganic !== false
    }))
  };
  isAdding.value = true;
};

const deleteNote = (id) => {
  if (confirm('この納品書を削除しますか？')) {
    actions.deleteDeliveryNote(id);
  }
};

const resetForm = () => {
  editingNoteId.value = null;
  newNote.value = {
    date: today(),
    slipNo: '',
    partnerId: '',
    items: []
  };
};

const getPartnerName = (id) => state.masters.m_partner.find(p => p.id === id)?.name || '不明';
const handlePrint = () => {
  // 向き指定の @page スタイルを動的に差し込む
  let styleEl = document.getElementById('dn-page-orientation');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dn-page-orientation';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@page { size: A4 ${printOrientation.value}; margin: 15mm; }`;

  document.body.classList.add('delivery-note-print-active');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
};

const handleAfterPrint = () => {
  document.body.classList.remove('delivery-note-print-active');
};

onMounted(() => {
  window.addEventListener('afterprint', handleAfterPrint);
});

onUnmounted(() => {
  window.removeEventListener('afterprint', handleAfterPrint);
});

const closePreview = () => {
  isPreviewOpen.value = false;
  resetForm();
};

const exportExcel = () => {
  const headers = ['日付', '伝票番号', '格付', '品目', '数量', '単価', '金額', '納品先'];
  const rows = [];
  
  state.records.t_delivery_note.forEach(note => {
    const details = note.itemDetails || [{ fullName: note.items, quantity: '', unitPrice: note.amount, isOrganic: true }];
    const slipNo = note.slipNo || `DN-${note.id.split('-')[1] || 'OLD'}`;
    
    details.forEach(item => {
      rows.push([
        note.date,
        slipNo,
        item.isOrganic ? '有機' : '非有機',
        item.name || item.fullName,
        `${item.quantity || ''}${item.unit || ''}`,
        item.unitPrice || 0,
        Number(item.quantity || 0) * Number(item.unitPrice || 0),
        getPartnerName(note.partnerId)
      ]);
    });
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const csvUrl = URL.createObjectURL(blob);
  link.href = csvUrl;
  link.download = `出荷明細台帳_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(csvUrl), 1000);
};
</script>

<template>
  <div class="delivery-notes-pro animate-slide-up">
    <div class="header glass shadow-sm">
      <div class="title-group">
        <FileText size="28" class="text-primary" />
        <div>
          <h2>納品書・出荷管理 <small>v.Pro</small></h2>
          <p>収穫記録と直結したトレーサブルな納品書発行</p>
        </div>
      </div>
      <div class="btn-group">
        <button @click="isAdding = true; addItem();" class="btn-primary shadow-glow">
          <Plus size="20" /> 納品書の新規作成
        </button>
        <button v-if="unassignedCount > 0" @click="actions.bulkAssignSlipNumbers()" class="btn-warning">
          <FileText size="18" /> 伝票番号を一括採番（{{ unassignedCount }}件）
        </button>
        <!-- Ri-Ry-Link 一括同期ボタン -->
        <button @click="bulkSyncToRiryLink" class="btn-rirylink" :disabled="isBulkSyncing">
          <span v-if="isBulkSyncing" class="sync-spinner">⟳</span>
          <Truck v-else size="16" />
          {{ isBulkSyncing ? '同期中...' : 'Ri-Ry-Link 一括同期' }}
          <span v-if="bulkSyncResult" class="sync-badge">
            <template v-if="bulkSyncResult.added > 0">+{{ bulkSyncResult.added }}</template>
            <template v-if="bulkSyncResult.added > 0 && bulkSyncResult.updated > 0"> / </template>
            <template v-if="bulkSyncResult.updated > 0">↻{{ bulkSyncResult.updated }}</template>
          </span>
        </button>
        <button @click="exportExcel" class="btn-secondary">
          <Download size="18" /> 台帳出力
        </button>
      </div>
    </div>

    <!-- 監査モードバナー -->
    <div v-if="state.auditMode.active" class="audit-mode-banner">
      🔍 監査モード中：<strong>{{ state.auditMode.label }}</strong> の期間データのみ表示しています
    </div>

    <!-- Search & Filters -->
    <div class="filter-bar glass mb-2">
      <div class="search-box">
        <Search size="16" class="text-muted" />
        <input v-model="searchQuery" placeholder="納品先・品目で検索..." />
      </div>
    </div>

    <!-- List View -->
    <div class="list-section">
      <div class="table-container glass shadow-sm">
        <table class="modern-table">
          <thead>
            <tr>
              <th width="100">伝票番号</th>
              <th width="120">発行日</th>
              <th width="200">納品先</th>
              <th>品目内容</th>
              <th width="120" class="text-right">合計金額</th>
              <th width="180" class="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="note in filteredAndSortedDeliveryNotes" :key="note.id" class="hover-row">
              <td class="slip-no">{{ note.slipNo || '-' }}</td>
              <td class="date">{{ note.date }}</td>
              <td>
                <div class="partner-cell">
                  <Truck size="16" class="text-muted" />
                  <strong>{{ getPartnerName(note.partnerId) }}</strong>
                </div>
              </td>
              <td>
                <div class="items-summary" :title="note.items">{{ note.items }}</div>
              </td>
              <td class="amount">¥{{ Number(note.amount || 0).toLocaleString() }}</td>
              <td class="actions">
                <button @click="viewNote(note)" class="btn-text-action view">閲覧</button>
                <button @click="editNote(note)" class="btn-text-action edit">編集</button>
                <button @click="deleteNote(note.id)" class="btn-text-action delete">削除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <!-- Create Modal -->
    <Transition name="fade">
      <div v-if="isAdding" class="overlay glass-heavy">
        <div class="modal card glass scale-up">
          <div class="modal-header">
            <h3>{{ editingNoteId ? '納品書の編集' : '納品書の新規発行' }}</h3>
            <button @click="isAdding = false; resetForm();" class="btn-close"><X size="24" /></button>
          </div>
          <div class="modal-body">
            <div class="form-row-2col mb-2">
              <div class="form-group">
                <label><Calendar size="13" style="display:inline;vertical-align:-2px;margin-right:4px;" />発行日</label>
                <input v-model="newNote.date" type="date" class="glass" />
              </div>
              <div class="form-group">
                <label>伝票番号</label>
                <div class="slip-no-readonly">
                  <template v-if="editingNoteId">{{ newNote.slipNo || '-' }}</template>
                  <template v-else><span class="auto-label">自動採番</span>　DN-{{ state.slipCounter }}</template>
                </div>
              </div>
            </div>
            <div class="form-group mb-2">
              <label>納品先を選択</label>
              <select v-model="newNote.partnerId" class="glass">
                <option value="">選択してください</option>
                <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
            <div class="items-builder">
              <div class="section-header">
                <label>納品品目の追加</label>
                <button @click="addItem" class="btn-add-item"><Plus size="16" /> 行を追加</button>
              </div>
              <div class="items-table-scroll">
                <table class="builder-table">
                  <thead>
                    <tr><th width="70">格付</th><th>品名</th><th width="100">数量</th><th width="120">単価</th><th width="120">小計</th><th width="40"></th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="(item, idx) in newNote.items" :key="idx">
                      <td><button @click="item.isOrganic = !item.isOrganic" :class="['organic-toggle', { active: item.isOrganic }]">有機</button></td>
                      <td><input v-model="item.name" placeholder="品名..." list="past-items-list" @change="onItemNameChange(item)" /></td>
                      <td><input v-model="item.quantity" type="number" class="text-right" /></td>
                      <td><input v-model="item.unitPrice" type="number" class="text-right" /></td>
                      <td class="subtotal">¥{{ (Number(item.quantity || 0) * Number(item.unitPrice || 0)).toLocaleString() }}</td>
                      <td><button @click="removeItem(idx)" class="btn-del"><Trash2 size="16" /></button></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- 以前納品した商品の価格参照用のデータリスト -->
              <datalist id="past-items-list">
                <option v-for="pastItem in uniquePastItems" :key="pastItem.name" :value="pastItem.name">
                  前回の単価: ¥{{ pastItem.unitPrice }} {{ pastItem.isCurrentPartner ? '（この取引先）' : '（他取引先）' }}
                </option>
              </datalist>
            </div>
          </div>
          <div class="modal-footer">
            <div class="amount-summary">
              <div class="amount-row"><span>小計（税抜）</span><span>¥{{ subtotalAmount.toLocaleString() }}</span></div>
              <div class="amount-row"><span>消費税額（{{ state.farmInfo.taxRate ?? 8 }}%）</span><span>¥{{ taxAmount.toLocaleString() }}</span></div>
              <div class="amount-row total"><span>合計金額（税込）</span><span>¥{{ totalAmount.toLocaleString() }}</span></div>
            </div>
            <button @click="handleSave" class="btn-primary w-full py-4">プレビューを確認して発行</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- PDF Preview -->
    <Transition name="fade">
      <div v-if="isPreviewOpen && generatedNote" class="preview-overlay">
        <div class="preview-content-card">
          <div class="preview-header-actions">
            <h3>納品書プレビュー</h3>
            <div class="btn-group-row">
              <!-- 印刷向き切替 -->
              <div class="orientation-toggle">
                <button
                  @click="printOrientation = 'portrait'"
                  :class="['orientation-btn', { active: printOrientation === 'portrait' }]"
                  title="縦（ポートレート）">
                  縦
                </button>
                <button
                  @click="printOrientation = 'landscape'"
                  :class="['orientation-btn', { active: printOrientation === 'landscape' }]"
                  title="横（ランドスケープ）">
                  横
                </button>
              </div>
              <button @click="handlePrint" class="btn-print"><Printer size="18" /> 印刷・PDF保存</button>
              <button @click="closePreview" class="btn-close-preview"><X size="24" /></button>
            </div>
          </div>
          <div class="printable-document" id="delivery-note-doc">
            <div class="doc-header">
              <h1>納品書</h1>
              <div class="doc-meta">
                <p>発行日: {{ generatedNote.date }}</p>
                <p>伝票番号: {{ generatedNote.slipNo || '-' }}</p>
              </div>
            </div>
            <div class="doc-addresses">
              <div class="dest-address">
                <h2>{{ generatedNote.partnerName }} 御中</h2>
                <p>いつも大変お世話になっております。</p>
                <p>下記の通り納品申し上げます。</p>
              </div>
              <div class="sender-address" v-if="generatedNote.farmInfo">
                <h3>{{ generatedNote.farmInfo.name }}</h3>
                <p>〒{{ generatedNote.farmInfo.postalCode }}</p>
                <p>{{ generatedNote.farmInfo.address }}</p>
                <p>TEL: {{ generatedNote.farmInfo.tel }}</p>
                <p>代表者: {{ generatedNote.farmInfo.representative }}</p>
                <p v-if="generatedNote.farmInfo.invoiceNo" class="invoice-no">
                  登録番号: {{ generatedNote.farmInfo.invoiceNo }}
                </p>
              </div>
            </div>
            <div class="doc-total-box">
              <span class="total-label">合計金額</span>
              <span class="val">¥{{ previewTotal.toLocaleString() }}-</span>
              <span class="tax-info">（消費税{{ generatedNote?.farmInfo?.taxRate ?? state.farmInfo.taxRate ?? 8 }}%込）</span>
            </div>
            <table class="doc-items-table">
              <thead>
                <tr><th>品名</th><th class="text-right">数量</th><th class="text-right">単価</th><th class="text-right">金額</th></tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in generatedNote.itemDetails" :key="idx">
                  <td>{{ item.fullName }}</td>
                  <td class="text-right">{{ item.quantity }}{{ item.unit }}</td>
                  <td class="text-right">¥{{ applyRounding(item.unitPrice || 0).toLocaleString() }}</td>
                  <td class="text-right">¥{{ applyRounding(Number(item.quantity || 0) * Number(item.unitPrice || 0)).toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>

            <!-- 小計・消費税・合計 -->
            <table class="doc-subtotal-table">
              <tbody>
                <tr>
                  <td class="subtotal-label">小計（税抜）</td>
                  <td class="subtotal-val">¥{{ previewSubtotal.toLocaleString() }}</td>
                </tr>
                <tr>
                  <td class="subtotal-label">消費税額（{{ generatedNote?.farmInfo?.taxRate ?? state.farmInfo.taxRate ?? 8 }}%）</td>
                  <td class="subtotal-val">¥{{ previewTax.toLocaleString() }}</td>
                </tr>
                <tr class="grand-total-row">
                  <td class="subtotal-label">合計（税込）</td>
                  <td class="subtotal-val">¥{{ previewTotal.toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>

            <div class="doc-footer">
              <p v-if="organicRemark">{{ organicRemark }}</p>
              <p>納品した農産物の産地　【鹿児島県産】</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.delivery-notes-pro { padding: 1.5rem; width: 100%; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding: 1.25rem 2rem; border-radius: 16px; background: white; border: 1px solid var(--glass-stroke); }
.title-group { display: flex; gap: 1rem; align-items: center; }
.title-group h2 { font-size: 1.5rem; font-weight: 900; margin: 0; }
.title-group p { color: var(--text-soft); font-size: 0.85rem; margin: 0; }
.btn-group { display: flex; gap: 0.75rem; }
.btn-warning { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.25rem; background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; border-radius: 10px; font-weight: 700; font-size: 0.875rem; cursor: pointer; transition: background 0.15s; }
.btn-warning:hover { background: #fde68a; }
.btn-rirylink { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.25rem; background: #ecfdf5; color: #065f46; border: 1px solid #6ee7b7; border-radius: 10px; font-weight: 700; font-size: 0.875rem; cursor: pointer; transition: background 0.15s; }
.btn-rirylink:hover:not(:disabled) { background: #d1fae5; }
.btn-rirylink:disabled { opacity: 0.6; cursor: not-allowed; }
.sync-spinner { display: inline-block; animation: spin 1s linear infinite; }
.sync-badge { background: #065f46; color: #fff; border-radius: 999px; padding: 0 0.4rem; font-size: 0.75rem; }
@keyframes spin { to { transform: rotate(360deg); } }

.filter-bar { padding: 0.75rem 1.25rem; border-radius: 12px; display: flex; align-items: center; background: white; border: 1px solid var(--glass-stroke); }
.search-box { display: flex; align-items: center; gap: 0.5rem; background: #f1f5f9; padding: 0.5rem 1.25rem; border-radius: 999px; width: 300px; }
.search-box input { background: transparent; border: none; font-size: 0.9rem; flex: 1; outline: none; }

.table-container { border-radius: 16px; overflow: hidden; background: white; border: 1px solid var(--glass-stroke); }
.modern-table { width: 100%; border-collapse: collapse; text-align: left; table-layout: fixed; }
.modern-table th { background: #f8fafc; padding: 1rem 1.25rem; font-weight: 800; color: #64748b; font-size: 0.75rem; text-transform: uppercase; }
.modern-table td { padding: 1rem 1.25rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; font-size: 0.95rem; }

.slip-no { font-family: monospace; color: var(--primary); font-weight: 800; font-size: 0.85rem; }

.actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
.btn-text-action { padding: 0.4rem 1rem; border-radius: 8px; font-size: 0.85rem; font-weight: 800; border: 1px solid #e2e8f0; cursor: pointer; }
.btn-text-action.view { background: #f1f5f9; color: #475569; }
.btn-text-action.edit { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
.btn-text-action.delete { background: #fff1f2; color: #e11d48; }

.invoice-no { font-size: 0.8em; color: #475569; margin-top: 0.3rem; }

.slip-no-readonly {
  padding: 0.55rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  color: #64748b;
  font-size: 0.95rem;
  font-family: monospace;
  font-weight: 700;
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.slip-no-readonly .auto-label {
  font-family: sans-serif;
  font-weight: 600;
  font-size: 0.75rem;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 0.1rem 0.5rem;
  border-radius: 99px;
  margin-right: 0.25rem;
}

.amount-summary { margin-bottom: 1rem; background: #f8fafc; border-radius: 10px; padding: 0.75rem 1.25rem; }
.amount-row { display: flex; justify-content: space-between; font-size: 0.9rem; padding: 0.3rem 0; color: #475569; }
.amount-row.total { border-top: 1.5px solid #334155; margin-top: 0.3rem; padding-top: 0.5rem; font-size: 1rem; font-weight: 900; color: #1e293b; }

/* Modals */
.overlay { position: fixed; inset: 0; z-index: 5000; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; }
.modal { width: 900px; max-width: 95vw; height: 85vh; background: white; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; }
.modal-header { padding: 1.25rem 2rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
.modal-body { flex: 1; overflow-y: auto; padding: 2rem; }
.form-row-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.modal-footer { padding: 1.5rem 2rem; background: #f8fafc; border-top: 1px solid #f1f5f9; }

.items-builder { display: flex; flex-direction: column; gap: 1rem; }
.items-table-scroll { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
.builder-table { width: 100%; border-collapse: collapse; }
.builder-table th { background: #f8fafc; padding: 0.75rem; font-size: 0.75rem; text-align: left; }
.builder-table td { padding: 0.75rem; border-bottom: 1px solid #f1f5f9; }
.builder-table input { width: 100%; padding: 0.5rem; border: 1px solid #e2e8f0; border-radius: 4px; }

.organic-toggle { background: #f1f5f9; color: #94a3b8; padding: 0.3rem 0.75rem; border-radius: 6px; border: none; font-size: 0.75rem; }
.organic-toggle.active { background: var(--primary); color: white; }

/* Preview */
.preview-overlay { position: fixed; inset: 0; z-index: 6000; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; }
.preview-content-card { width: 100%; max-width: 850px; height: 95vh; background: #fff; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; }
.preview-header-actions { padding: 1.25rem 2rem; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
.orientation-toggle { display: flex; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.orientation-btn { padding: 0.3rem 0.75rem; background: #f8fafc; border: none; cursor: pointer; font-size: 0.85rem; color: #64748b; transition: all 0.15s; }
.orientation-btn:hover { background: #e2e8f0; }
.orientation-btn.active { background: #1e40af; color: #fff; font-weight: 700; }

.printable-document { flex: 1; padding: 3rem; overflow-y: auto; font-family: serif; color: #333; }
.doc-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #333; padding-bottom: 1.5rem; margin-bottom: 3rem; }
.doc-header h1 { font-size: 2.5rem; letter-spacing: 1rem; margin: 0; }
.doc-addresses { display: flex; justify-content: space-between; margin-bottom: 3rem; }
.doc-total-box { background: #f8fafc; border: 1px solid #333; padding: 1.5rem; display: flex; align-items: center; justify-content: center; gap: 2rem; margin-bottom: 2rem; }
.doc-total-box .val { font-size: 2.2rem; font-weight: 700; text-decoration: underline; }
.doc-items-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
.doc-items-table th { border-top: 3px solid #333; border-bottom: 1px solid #333; padding: 0.75rem; }
.doc-items-table td { border-bottom: 1px solid #eee; padding: 0.75rem; }

.doc-subtotal-table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; margin-left: auto; max-width: 320px; }
.doc-subtotal-table td { padding: 0.45rem 0.75rem; font-size: 0.9rem; }
.doc-subtotal-table .subtotal-label { color: #475569; }
.doc-subtotal-table .subtotal-val { text-align: right; font-weight: 700; }
.doc-subtotal-table .grand-total-row td { border-top: 2px solid #333; font-size: 1rem; font-weight: 900; padding-top: 0.6rem; }

.text-right { text-align: right; }
.text-center { text-align: center; }
</style>

<style>
/* Global Print Styles - Namespaced to delivery-note-print-active */
@media print {
  /* 1. Global Reset */
  body.delivery-note-print-active {
    visibility: hidden !important;
    background: white !important;
  }

  /* 2. Absolute Isolation using Visibility */
  body.delivery-note-print-active #delivery-note-doc,
  body.delivery-note-print-active #delivery-note-doc * {
    visibility: visible !important;
  }

  /* 3. Ensure structure */
  body.delivery-note-print-active .preview-overlay, 
  body.delivery-note-print-active .preview-content-card, 
  body.delivery-note-print-active .printable-document {
    visibility: visible !important;
    display: block !important;
    position: static !important;
    width: 100% !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    box-shadow: none !important;
    border: none !important;
    overflow: visible !important;
  }

  /* 4. Position document */
  body.delivery-note-print-active #delivery-note-doc {
    display: block !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    padding: 2cm !important;
  }

  /* 5. Suppress everything else */
  body.delivery-note-print-active #app, 
  body.delivery-note-print-active .overlay, 
  body.delivery-note-print-active .preview-header-actions,
  body.delivery-note-print-active .filter-bar,
  body.delivery-note-print-active .header {
    display: none !important;
  }

  /* 6. Fix for tables in Print mode */
  body.delivery-note-print-active .doc-items-table {
    display: table !important;
    border-collapse: collapse !important;
  }
  body.delivery-note-print-active .doc-items-table tr { display: table-row !important; }
  body.delivery-note-print-active .doc-items-table th, 
  body.delivery-note-print-active .doc-items-table td { display: table-cell !important; }
  
  body.delivery-note-print-active .doc-header, 
  body.delivery-note-print-active .doc-addresses, 
  body.delivery-note-print-active .doc-total-box {
    display: flex !important;
  }
}
</style>
