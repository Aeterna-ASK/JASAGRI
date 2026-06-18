<script setup>
import { ref, computed, reactive } from 'vue';
import { state, actions } from '../../store';
import { Inbox, FileText, CheckCircle2, Search, Calendar, Package, Factory, Trash2, ShieldCheck, Mail, Bot, Hash, Layers, FileDown, RefreshCw } from 'lucide-vue-next';
import { detectCategory } from '../../utils/categoryDetect.js';

// selectedDoc はストアの最新状態をリアクティブに追跡する computed
// （fileUrl がクラウドから非同期解決されたとき自動更新される）
const selectedDocId = ref(null);
const selectedDoc = computed(() => {
  if (!selectedDocId.value) return null;
  return inboxDocs.value.find(d => d.id === selectedDocId.value) || null;
});

// --- PDF結合（複数選択モード） ---
const isMultiSelectMode = ref(false);
const selectedForMergeIds = ref([]);
const isMerging = ref(false);

const toggleMultiSelectMode = () => {
  isMultiSelectMode.value = !isMultiSelectMode.value;
  selectedForMergeIds.value = [];
};

const toggleDocForMerge = (docId) => {
  const idx = selectedForMergeIds.value.indexOf(docId);
  if (idx === -1) {
    selectedForMergeIds.value.push(docId);
  } else {
    selectedForMergeIds.value.splice(idx, 1);
  }
};

const handleCardClick = (doc) => {
  if (isMultiSelectMode.value) {
    toggleDocForMerge(doc.id);
  } else {
    handleSelect(doc);
  }
};

const dataUrlToBytes = (dataUrl) => {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = e => resolve(e.target.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const mergeSelectedToPDF = async () => {
  const docsToMerge = inboxDocs.value.filter(d => selectedForMergeIds.value.includes(d.id));
  if (docsToMerge.length < 2) {
    actions.showToast('2件以上のスキャンを選択してください', 'warning');
    return;
  }

  isMerging.value = true;
  try {
    const { PDFDocument } = await import('pdf-lib');
    const mergedPdf = await PDFDocument.create();

    for (const doc of docsToMerge) {
      const fileUrl = doc.fileUrl;
      const isPdf = (fileUrl && fileUrl.startsWith('data:application/pdf')) ||
                    (doc.fileName && doc.fileName.toLowerCase().endsWith('.pdf'));

      if (isPdf) {
        const pdfBytes = dataUrlToBytes(fileUrl);
        const existingPdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(existingPdf, existingPdf.getPageIndices());
        copiedPages.forEach(page => mergedPdf.addPage(page));
      } else {
        const page = mergedPdf.addPage([595.28, 841.89]);
        const imageBytes = fileUrl.startsWith('data:')
          ? dataUrlToBytes(fileUrl)
          : new Uint8Array(await (await fetch(fileUrl)).arrayBuffer());

        let image;
        if ((fileUrl.includes('data:image/png')) || doc.fileName?.toLowerCase().endsWith('.png')) {
          image = await mergedPdf.embedPng(imageBytes);
        } else {
          image = await mergedPdf.embedJpg(imageBytes);
        }

        const { width, height } = image.scale(1);
        const pW = 595.28, pH = 841.89;
        const scale = Math.min(pW / width, pH / height) * 0.95;
        page.drawImage(image, {
          x: (pW - width * scale) / 2,
          y: (pH - height * scale) / 2,
          width: width * scale,
          height: height * scale,
        });
      }
    }

    const pdfBytes = await mergedPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const pdfDataUrl = await blobToDataUrl(blob);

    const partnerName = docsToMerge[0].parsedData?.partnerName || '';
    const dateStr = new Date().toISOString().split('T')[0];
    const mergedFileName = `結合_${partnerName ? partnerName + '_' : ''}${dateStr}.pdf`;

    actions.addInboxDocument({
      fileName: mergedFileName,
      fileUrl: pdfDataUrl,
      status: 'unread',
      suggestedType: docsToMerge[0].suggestedType || 'マスタ証明書',
      parsedData: { ...docsToMerge[0].parsedData }
    });

    for (const doc of docsToMerge) {
      actions.deleteInboxDocument(doc.id);
    }

    selectedForMergeIds.value = [];
    isMultiSelectMode.value = false;
    actions.showToast(`${docsToMerge.length}枚のスキャンを1つのPDFに結合しました`, 'success');
  } catch (err) {
    console.error('PDF結合エラー:', err);
    actions.showToast('PDF結合に失敗しました: ' + err.message, 'error');
  } finally {
    isMerging.value = false;
  }
};

const inboxDocs = computed(() => state.records.t_inbox_documents || []);

// fileUrl が実際に表示可能なURL/DataURLかを判定
const isValidFileUrl = (url) =>
  !!url && (url.startsWith('data:') || url.startsWith('http') || url.startsWith('blob:') || url.startsWith('/'));

// fileUrl の状態を3つに分類: 'loading' | 'error' | 'ready'
const fileUrlStatus = (url) => {
  if (!url) return 'loading';
  if (isValidFileUrl(url)) return 'ready';
  return 'error'; // サーバーからのエラーメッセージ文字列
};

const selectDocument = (doc) => {
  selectedDocId.value = doc?.id || null;
};

const getStatusBadgeClass = (status) => {
  if (status === 'unread') return 'badge-unread';
  if (status === 'processing') return 'badge-processing';
  return 'badge-assigned';
};

// ── 複数伝票フォームモデル ──────────────────────────────────
// invoiceList: 要素1件 = 1枚の伝票。複数スキャン時は複数要素
const emptyInvoice = () => ({
  date: '',
  expiryDate: '',
  partnerName: '',
  items: [{ materialName: '', category: '資材', quantity: '1' }]
});
const invoiceList = ref([emptyInvoice()]);

// ── カテゴリ自動判定（共有ユーティリティを使用） ─────────────
const CATEGORY_OPTIONS = ['肥料', '農薬', '苗・種子', '飼料', '機材', '資材'];

// 品名変更時にカテゴリを自動更新（AIが「資材」と返してきた場合のみ上書き）
const autoDetectCategory = (item) => {
  if (!item.materialName) return;
  const detected = detectCategory(item.materialName);
  // AIが既に具体的なカテゴリを設定済みの場合は「資材」のみ上書き対象
  if (item.category === '資材' || !item.category) {
    item.category = detected;
  }
};

// ── 伝票追加・削除 ────────────────────────────────────────
const addInvoice = () => {
  const prev = invoiceList.value[invoiceList.value.length - 1];
  invoiceList.value.push({ ...emptyInvoice(), partnerName: prev?.partnerName || '' });
};
const removeInvoice = (invIdx) => {
  if (invoiceList.value.length <= 1) return;
  invoiceList.value.splice(invIdx, 1);
};

// 🌟【有機JAS適合サジェストクエリ】
const materialSuggestions = computed(() => {
  const materials = state.masters.m_material || [];
  return [...new Set(materials.map(m => m.name))];
});
const partnerSuggestions = computed(() => {
  const partners = state.masters.m_partner || [];
  return [...new Set(partners.map(p => p.name))];
});

// カスタムオートコンプリート（複数伝票対応・インデックスキー方式）
const activeDropdownKey = ref(null);
const setDropdown = (key) => { activeDropdownKey.value = key; };
const clearDropdown = () => { setTimeout(() => { activeDropdownKey.value = null; }, 180); };

const getFilteredPartnersFor = (invIdx) => {
  const q = (invoiceList.value[invIdx]?.partnerName || '').toLowerCase();
  const all = partnerSuggestions.value;
  return (q ? all.filter(n => n.toLowerCase().includes(q)) : all).slice(0, 10);
};
const getFilteredMaterialsFor = (invIdx, query) => {
  const q = (query || '').toLowerCase();
  const all = materialSuggestions.value;
  return (q ? all.filter(n => n.toLowerCase().includes(q)) : all).slice(0, 10);
};
const selectPartnerFor = (invIdx, name) => {
  invoiceList.value[invIdx].partnerName = name;
  activeDropdownKey.value = null;
};
const selectMaterialFor = (invIdx, itemIdx, name) => {
  invoiceList.value[invIdx].items[itemIdx].materialName = name;
  activeDropdownKey.value = null;
};

// バリデーション
const allInvoicesValid = computed(() => {
  return invoiceList.value.length > 0 && invoiceList.value.every(inv =>
    inv.date && inv.partnerName &&
    inv.items.length > 0 && inv.items.every(item => (item.materialName || '').trim() !== '')
  );
});
const isMasterCertValid = computed(() => {
  return invoiceList.value.length > 0 && (invoiceList.value[0].items[0]?.materialName || '').trim() !== '';
});

// ドキュメントを選択した時にフォームにAI推論データをバインド
const handleSelect = (doc) => {
  selectDocument(doc);
  activeDropdownKey.value = null;
  if (doc.parsedData) {
    // カテゴリ補正ヘルパー（AI が「資材」と返したものをキーワードで再判定）
    const fixItems = (items) => items.map(i => ({
      ...i,
      category: (i.category && i.category !== '資材') ? i.category : detectCategory(i.materialName),
    }));

    // 複数伝票検出済み（parsedData.invoices 配列が存在する場合）
    if (doc.parsedData.invoices && doc.parsedData.invoices.length > 0) {
      invoiceList.value = doc.parsedData.invoices.map(inv => ({
        date: inv.date || new Date().toISOString().split('T')[0],
        expiryDate: inv.expiryDate || '',
        partnerName: inv.partnerName || '',
        items: inv.items?.length > 0
          ? fixItems(inv.items.map(i => ({ ...i })))
          : [{ materialName: '', category: '資材', quantity: '1' }],
      }));
    } else {
      // 単一伝票（従来互換）
      const rawItems = doc.parsedData.items?.length > 0
        ? doc.parsedData.items.map(i => ({ ...i }))
        : [{ materialName: doc.parsedData.materialName || '', category: doc.parsedData.category || '資材', quantity: doc.parsedData.quantity || '1' }];
      invoiceList.value = [{
        date: doc.parsedData.date || new Date().toISOString().split('T')[0],
        expiryDate: doc.parsedData.expiryDate || '',
        partnerName: doc.parsedData.partnerName || '',
        items: fixItems(rawItems),
      }];
    }
  } else {
    invoiceList.value = [emptyInvoice()];
  }
};

const processAllAsReceipt = () => {
  if (!selectedDoc.value || !allInvoicesValid.value) return;
  const dataList = invoiceList.value.map(inv => ({ ...inv, fileUrl: selectedDoc.value.fileUrl }));
  actions.processBulkInboxDocuments(selectedDoc.value.id, 'receipt', dataList);
  selectedDocId.value = null;
};

const processAsMasterCert = () => {
  if (!selectedDoc.value || !isMasterCertValid.value) return;
  const firstInv = invoiceList.value[0];
  const data = {
    date: firstInv.date || new Date().toISOString().split('T')[0],
    expiryDate: firstInv.expiryDate || '',
    partnerName: firstInv.partnerName || '',
    items: firstInv.items,
    fileUrl: selectedDoc.value.fileUrl
  };
  actions.processInboxDocument(selectedDoc.value.id, 'master_cert', data);
  selectedDocId.value = null;
};

const deleteDoc = () => {
  if (!selectedDoc.value) return;
  if (confirm('このスキャンデータを完全に削除しますか？')) {
    actions.deleteInboxDocument(selectedDoc.value.id);
    selectedDocId.value = null;
  }
};

// --- その他（カスタム書類）登録 ---
const customDocTypeName = ref('');
const showCustomInput = ref(false);

const processAsCustom = () => {
  if (!selectedDoc.value) return;
  const name = customDocTypeName.value.trim();
  if (!name) {
    actions.showToast('書類の名称を入力してください', 'warning');
    return;
  }
  const firstInv = invoiceList.value[0];
  const data = { ...firstInv, fileUrl: selectedDoc.value.fileUrl, customDocTypeName: name };
  actions.processInboxDocument(selectedDoc.value.id, 'custom', data);
  selectedDocId.value = null;
  customDocTypeName.value = '';
  showCustomInput.value = false;
};

// --- 再解析 ---
const isReAnalyzing = ref(false);

const REANALYZE_URL = 'https://asia-northeast1-organiclog-2f6c7.cloudfunctions.net/reanalyzeInboxDocument';

const reAnalyzeDocument = async () => {
  if (!selectedDoc.value || isReAnalyzing.value) return;

  isReAnalyzing.value = true;
  try {
    const res = await fetch(REANALYZE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({ docId: selectedDoc.value.id }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const { result } = await res.json();
    const today = new Date().toISOString().split('T')[0];

    // 複数伝票検出時は invoiceList に展開
    if (result.invoices && result.invoices.length > 0) {
      invoiceList.value = result.invoices.map(inv => ({
        date: inv.date || today,
        expiryDate: inv.expiryDate || '',
        partnerName: inv.partnerName || '',
        items: inv.items?.length > 0 ? inv.items : [{ materialName: '', category: '資材', quantity: '1' }],
      }));
    } else {
      const allItems = Array.isArray(result.items) && result.items.length > 0
        ? result.items
        : [{ materialName: '', category: '資材', quantity: '1' }];
      invoiceList.value = [{
        date: result.date || today,
        expiryDate: result.expiryDate || '',
        partnerName: result.partnerName || '',
        items: allItems,
      }];
    }

    // ストアを更新（Firestoreは Cloud Function 側で更新済み）
    actions.updateInboxDocument(selectedDoc.value.id, {
      suggestedType: result.suggestedType || '未識別',
      parsedData: {
        ...invoiceList.value[0],
        invoices: result.invoices || null,
      },
    });

    actions.showToast(`再解析完了：${result.suggestedType || '未識別'} として識別しました`, 'success');
  } catch (err) {
    console.error('再解析エラー:', err);
    actions.showToast('再解析に失敗しました: ' + err.message, 'error');
  } finally {
    isReAnalyzing.value = false;
  }
};
</script>

<template>
  <div class="inbox-container animate-fade-in">
    <div class="page-header glass">
      <div class="title-wrap">
        <Inbox size="28" class="text-primary" />
        <h2>スキャン受信トレイ（Inbox）</h2>
        <span class="count-badge">{{ inboxDocs.length }}件の未処理</span>
      </div>
      <p class="subtitle">複合機からスキャン送信された書類（納品書・証明書）をAIが自動解析し、振り分けを待機しています。</p>
      <div class="scan-email-bar">
        <Mail size="15" class="scan-email-icon" />
        <span class="scan-email-label">スキャン送信先アドレス：</span>
        <a href="mailto:scan-office@orgaly.app" class="scan-email-link">scan-office@orgaly.app</a>
      </div>
    </div>

    <div class="inbox-layout">
      <!-- 左ペイン：未処理リスト -->
      <div class="inbox-list glass">
        <div class="list-header">
          <Mail size="18" />
          <h3>未処理リスト</h3>
          <button
            class="btn-multiselect"
            :class="{ active: isMultiSelectMode }"
            @click="toggleMultiSelectMode"
            title="複数のスキャンを選択してPDFに結合"
          >
            <Layers size="13" />
            {{ isMultiSelectMode ? 'キャンセル' : '複数選択' }}
          </button>
        </div>
        
        <div v-if="inboxDocs.length === 0" class="empty-state">
          <Inbox size="48" color="#cbd5e1" />
          <p>新しいスキャン書類はありません。</p>
          <span class="sub">複合機からメール送信するとここに届きます</span>
        </div>

        <div class="doc-cards">
          <div
            v-for="doc in inboxDocs"
            :key="doc.id"
            class="doc-card"
            :class="{
              active: !isMultiSelectMode && selectedDoc?.id === doc.id,
              'selected-for-merge': isMultiSelectMode && selectedForMergeIds.includes(doc.id)
            }"
            @click="handleCardClick(doc)"
          >
            <div class="doc-card-top">
              <div v-if="isMultiSelectMode" class="merge-checkbox" :class="{ checked: selectedForMergeIds.includes(doc.id) }">
                <CheckCircle2 v-if="selectedForMergeIds.includes(doc.id)" size="16" class="icon-checked" />
                <div v-else class="checkbox-empty" />
              </div>
              <span class="badge" :class="getStatusBadgeClass(doc.status)">
                {{ doc.status === 'unread' ? '未確認' : '処理中' }}
              </span>
              <span class="doc-date">{{ doc.receivedAt }}</span>
            </div>
            <h4 class="doc-name">{{ doc.fileName }}</h4>
            <div class="doc-suggest">
              <Bot size="14" class="icon-ai" />
              <span>AI推論: <strong>{{ doc.suggestedType || '不明' }}</strong></span>
            </div>
          </div>
        </div>

        <!-- 結合フッター（複数選択モード時のみ表示） -->
        <div v-if="isMultiSelectMode" class="merge-footer" :class="{ 'can-merge': selectedForMergeIds.length >= 2 }">
          <p class="merge-info">
            <span v-if="selectedForMergeIds.length === 0">結合したいスキャンをタップして選択</span>
            <span v-else-if="selectedForMergeIds.length === 1">あと1件以上選択してください</span>
            <span v-else>{{ selectedForMergeIds.length }}件選択中 → PDF {{ selectedForMergeIds.length }}ページ</span>
          </p>
          <button
            class="btn-merge"
            :disabled="selectedForMergeIds.length < 2 || isMerging"
            @click="mergeSelectedToPDF"
          >
            <span v-if="isMerging">結合中...</span>
            <template v-else>
              <FileDown size="15" />
              1つのPDFに結合
            </template>
          </button>
        </div>
      </div>

      <!-- 右ペイン：プレビューと処理 -->
      <div class="inbox-detail glass">
        <div v-if="isMultiSelectMode" class="detail-empty merge-mode-hint">
          <Layers size="48" color="#059669" />
          <p style="color: #047857;">複数選択モード</p>
          <span class="sub" style="color: #059669;">左のリストから複数枚を選んで<br>「1つのPDFに結合」を押してください</span>
        </div>
        <div v-else-if="!selectedDoc" class="detail-empty">
          <Search size="48" color="#cbd5e1" />
          <p>左側のリストから書類を選択してください</p>
        </div>
        
        <div v-else class="detail-content">
          <!-- プレビュー枠 -->
          <div class="preview-pane">
            <div class="preview-header">
              <FileText size="18" />
              <span>プレビュー: {{ selectedDoc.fileName }}</span>
            </div>
            <div class="preview-frame">
              <!-- 共通：ローディング -->
              <div v-if="fileUrlStatus(selectedDoc.fileUrl) === 'loading'" class="preview-loading">
                <div class="preview-spinner" />
                <p>ファイルを読み込み中...</p>
              </div>
              <!-- 共通：サーバーエラーメッセージ -->
              <div v-else-if="fileUrlStatus(selectedDoc.fileUrl) === 'error'" class="preview-error">
                <FileText size="40" color="#f59e0b" />
                <p class="preview-error-title">プレビューを表示できません</p>
                <p class="preview-error-msg">{{ selectedDoc.fileUrl }}</p>
                <p class="preview-error-hint">PDFのサイズを小さくしてから再送してください（目安: 5MB以下）</p>
              </div>
              <!-- 表示可能：PDF -->
              <template v-else-if="selectedDoc.fileName && selectedDoc.fileName.toLowerCase().endsWith('.pdf')">
                <iframe :src="selectedDoc.fileUrl + '#toolbar=0'" class="preview-pdf" frameborder="0" width="100%" height="100%"></iframe>
              </template>
              <!-- 表示可能：画像 -->
              <template v-else>
                <img :src="selectedDoc.fileUrl" alt="Scan Preview" class="preview-image" />
              </template>
            </div>
          </div>

          <!-- 振り分けアクション枠 -->
          <div class="action-pane animate-fade-in">
            <div class="action-header ai-powered">
              <Bot size="28" class="icon-ai-pulse" />
              <div class="action-title-wrap">
                <h3>AIによる解析結果と振り分け</h3>
                <span class="ai-badge">✨ Gemini 2.5 Flash 解析済</span>
              </div>
              <button
                class="btn-reanalyze"
                :class="{ loading: isReAnalyzing }"
                :disabled="isReAnalyzing"
                @click="reAnalyzeDocument"
                title="Gemini AIで再解析する"
              >
                <RefreshCw size="13" :class="{ 'spin': isReAnalyzing }" />
                {{ isReAnalyzing ? '解析中...' : '再解析' }}
              </button>
            </div>
            
            <!-- 複数伝票ループ -->
            <div
              v-for="(invoice, invIdx) in invoiceList"
              :key="invIdx"
              class="invoice-section"
              :class="{ 'invoice-section-multi': invoiceList.length > 1 }"
            >
              <div v-if="invoiceList.length > 1" class="invoice-section-header">
                <span class="invoice-num">伝票 {{ invIdx + 1 }} / {{ invoiceList.length }}</span>
                <span v-if="invoice.date || invoice.partnerName" class="invoice-preview">
                  {{ invoice.date }}{{ invoice.partnerName ? ' · ' + invoice.partnerName : '' }}
                </span>
                <button @click="removeInvoice(invIdx)" class="btn-remove-invoice">✕</button>
              </div>

              <div class="form-grid">
                <div class="form-group">
                  <label><Calendar size="14"/> 発行日・受入日 <span class="required-dot">*</span></label>
                  <input v-model="invoice.date" type="date" class="modern-input" />
                </div>
                <div class="form-group full-width-field" style="grid-column: span 2;">
                  <label><Factory size="14"/> 仕入先・発行元 <span class="required-dot">*</span></label>
                  <div class="ac-wrap">
                    <input
                      v-model="invoice.partnerName"
                      @focus="setDropdown(`partner_${invIdx}`)"
                      @blur="clearDropdown()"
                      type="text" class="modern-input" placeholder="例：国分種苗" autocomplete="off"
                    />
                    <ul v-if="activeDropdownKey === `partner_${invIdx}` && getFilteredPartnersFor(invIdx).length" class="ac-list">
                      <li v-for="name in getFilteredPartnersFor(invIdx)" :key="name" @mousedown.prevent="selectPartnerFor(invIdx, name)">{{ name }}</li>
                    </ul>
                  </div>
                </div>

                <!-- 複数項目（Items）ループ -->
                <div class="items-container">
                  <div v-for="(item, itemIdx) in invoice.items" :key="itemIdx" class="item-row glass-white">
                    <div class="item-row-header">
                      <span class="item-index">項目 {{ itemIdx + 1 }}</span>
                      <button v-if="invoice.items.length > 1" @click="invoice.items.splice(itemIdx, 1)" class="btn-remove-item" title="この項目を削除">
                        ✕ 削除
                      </button>
                    </div>
                    <div class="form-group">
                      <label><Package size="14"/> 品名・資材名 <span class="required-dot">*</span></label>
                      <div class="ac-wrap">
                        <input
                          v-model="item.materialName"
                          @focus="setDropdown(`material_${invIdx}_${itemIdx}`)"
                          @blur="clearDropdown()"
                          @change="autoDetectCategory(item)"
                          type="text" class="modern-input" placeholder="例：菜種油粕" autocomplete="off"
                        />
                        <ul v-if="activeDropdownKey === `material_${invIdx}_${itemIdx}` && getFilteredMaterialsFor(invIdx, item.materialName).length" class="ac-list">
                          <li v-for="name in getFilteredMaterialsFor(invIdx, item.materialName)" :key="name" @mousedown.prevent="selectMaterialFor(invIdx, itemIdx, name)">{{ name }}</li>
                        </ul>
                      </div>
                    </div>
                    <div class="form-group form-group-category">
                      <label>カテゴリ</label>
                      <div class="category-chips">
                        <button
                          v-for="cat in CATEGORY_OPTIONS"
                          :key="cat"
                          type="button"
                          class="cat-chip"
                          :class="{ active: item.category === cat }"
                          @click="item.category = cat"
                        >{{ cat }}</button>
                      </div>
                    </div>
                    <div class="form-group">
                      <label><Hash size="14"/> 数量</label>
                      <input v-model="item.quantity" type="text" class="modern-input" placeholder="例：1袋" />
                    </div>
                  </div>

                  <button class="btn-add-item" @click="invoice.items.push({ materialName: '', category: '資材', quantity: '1' })">
                    + 明細行を追加
                  </button>
                </div>
                <div class="form-group full-width-field" style="grid-column: span 2;">
                  <label style="color: #10b981; font-weight: 800;"><ShieldCheck size="14" class="text-success" /> 有効期限（適合証明書の場合・期限切れ日）</label>
                  <input v-model="invoice.expiryDate" type="date" class="modern-input" style="border-color: #10b981; background: rgba(16, 185, 129, 0.02);" />
                </div>
              </div>
            </div>

            <!-- 伝票追加ボタン（納品書向け） -->
            <button class="btn-add-invoice" @click="addInvoice">
              ＋ 伝票を追加（同一スキャンに複数伝票あり）
            </button>

            <div class="action-buttons">
              <button
                class="btn-process btn-receipt"
                :disabled="!allInvoicesValid"
                :class="{ disabled: !allInvoicesValid }"
                @click="processAllAsReceipt"
              >
                <FileText size="18" />
                {{ invoiceList.length > 1 ? `${invoiceList.length}件まとめて登録` : '納品受入記録として登録' }}
              </button>
              <button
                class="btn-process btn-master"
                :disabled="!isMasterCertValid"
                :class="{ disabled: !isMasterCertValid }"
                @click="processAsMasterCert"
              >
                <ShieldCheck size="18" />
                マスタ適合証明書として登録
              </button>

              <!-- その他（任意名称）登録 -->
              <div class="custom-doc-wrap">
                <button
                  class="btn-process btn-custom-toggle"
                  :class="{ active: showCustomInput }"
                  @click="showCustomInput = !showCustomInput"
                >
                  <Layers size="16" />
                  {{ showCustomInput ? '閉じる' : 'その他の書類として登録...' }}
                </button>
                <div v-if="showCustomInput" class="custom-input-row animate-fade-in">
                  <input
                    v-model="customDocTypeName"
                    class="modern-input"
                    placeholder="書類名称（例：事業者認証書、水質検査成績書）"
                    @keyup.enter="processAsCustom"
                    autofocus
                  />
                  <button
                    class="btn-process btn-custom-exec"
                    :disabled="!customDocTypeName.trim()"
                    :class="{ disabled: !customDocTypeName.trim() }"
                    @click="processAsCustom"
                  >
                    <FileText size="15" />
                    この名称で登録
                  </button>
                </div>
              </div>

              <button class="btn-process btn-delete" @click="deleteDoc">
                <Trash2 size="18" />
                ゴミ箱へ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inbox-container {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: calc(100vh - 100px);
}

.page-header {
  padding: 1.5rem 2rem;
  border-radius: 16px;
  background: white;
  border: 1px solid var(--glass-stroke);
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.title-wrap h2 {
  font-size: 1.5rem;
  font-weight: 900;
  color: var(--text-main);
  margin: 0;
}

.text-primary { color: #059669; }

.count-badge {
  background: #ef4444;
  color: white;
  padding: 0.2rem 0.8rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 800;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
}

.subtitle {
  color: #64748b;
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0 0 0.75rem 0;
}

.scan-email-bar {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: #f0fdf4;
  border: 1.5px solid #a7f3d0;
  border-radius: 10px;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
}

.scan-email-icon {
  color: #059669;
  flex-shrink: 0;
}

.scan-email-label {
  color: #475569;
  font-weight: 700;
  white-space: nowrap;
}

.scan-email-link {
  color: #047857;
  font-weight: 800;
  text-decoration: none;
  font-family: monospace;
  font-size: 0.9rem;
  letter-spacing: 0.02em;
  transition: color 0.15s;
}

.scan-email-link:hover {
  color: #059669;
  text-decoration: underline;
}

.inbox-layout {
  display: flex;
  gap: 1.5rem;
  flex: 1;
  min-height: 0; /* Important for scrollable children */
}

/* --- Left Pane: List --- */
.inbox-list {
  width: 350px;
  background: white;
  border-radius: 16px;
  border: 1px solid var(--glass-stroke);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  padding: 1.25rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #f8fafc;
}

.list-header h3 {
  font-size: 1.1rem;
  font-weight: 900;
  color: #1e293b;
  margin: 0;
}

.doc-cards {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* --- Multi-select & Merge --- */
.btn-multiselect {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.3rem 0.65rem;
  border-radius: 8px;
  border: 1.5px solid #059669;
  background: white;
  color: #059669;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-multiselect.active { background: #059669; color: white; }
.btn-multiselect:hover { background: #d1fae5; }
.btn-multiselect.active:hover { background: #047857; color: white; }

.doc-card.selected-for-merge {
  border-color: #059669;
  background: #f0fdf4;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.15);
}
.merge-checkbox {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; flex-shrink: 0;
}
.checkbox-empty {
  width: 16px; height: 16px;
  border: 2px solid #cbd5e1; border-radius: 50%; background: white;
}
.icon-checked { color: #059669; }

.merge-footer {
  padding: 1rem;
  border-top: 2px dashed #e2e8f0;
  background: #f8fafc;
  display: flex; flex-direction: column; gap: 0.6rem;
}
.merge-footer.can-merge { border-top-color: #059669; background: #f0fdf4; }
.merge-info { font-size: 0.8rem; font-weight: 700; color: #64748b; text-align: center; margin: 0; }
.merge-footer.can-merge .merge-info { color: #047857; }
.btn-merge {
  width: 100%; padding: 0.75rem;
  background: #059669; color: white;
  border: none; border-radius: 10px;
  font-size: 0.9rem; font-weight: 800;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 0.45rem;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.2);
}
.btn-merge:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
.btn-merge:not(:disabled):hover { background: #047857; transform: translateY(-1px); }

.doc-card {
  padding: 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: white;
}

.doc-card:hover {
  border-color: #cbd5e1;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.doc-card.active {
  border-color: #059669;
  background: #f0fdf4;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.15);
}

.doc-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.badge {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
}

.badge-unread { background: #fee2e2; color: #ef4444; }
.badge-processing { background: #fef3c7; color: #d97706; }

.doc-date {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 700;
}

.doc-name {
  font-size: 0.95rem;
  font-weight: 800;
  color: #334155;
  margin: 0 0 0.5rem 0;
  word-break: break-all;
}

.doc-suggest {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #059669;
  background: white;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  border: 1px solid #a7f3d0;
}

.icon-ai {
  color: #059669;
}

/* --- Right Pane: Detail & Process --- */
.inbox-detail {
  flex: 1;
  background: white;
  border-radius: 16px;
  border: 1px solid var(--glass-stroke);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  gap: 1rem;
}

.detail-empty p {
  font-size: 1.1rem;
  font-weight: 800;
}

.detail-content {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Preview Area */
.preview-pane {
  flex: 1;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  background: #f1f5f9;
}

.preview-header {
  padding: 1rem 1.5rem;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 800;
  color: #475569;
}

.preview-frame {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  justify-content: center;
}

.preview-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: #94a3b8;
  font-weight: 700;
}
.preview-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e2e8f0;
  border-top-color: #059669;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.preview-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  text-align: center;
}
.preview-error-title {
  font-size: 1rem;
  font-weight: 800;
  color: #92400e;
  margin: 0;
}
.preview-error-msg {
  font-size: 0.85rem;
  font-weight: 700;
  color: #d97706;
  background: #fef3c7;
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  margin: 0;
}
.preview-error-hint {
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 600;
  margin: 0;
}

.preview-image, .preview-pdf {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

/* Action Area */
.action-pane {
  width: 400px;
  display: flex;
  flex-direction: column;
  background: white;
  overflow-y: auto;
}

.action-header {
  padding: 1.5rem;
  background: #f0fdf4;
  border-bottom: 1px solid #a7f3d0;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.action-header.ai-powered {
  background: linear-gradient(135deg, #f0fdf4 0%, #d1fae5 100%);
  border-bottom: 2px solid #6ee7b7;
}

.action-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.btn-reanalyze {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 800;
  border-radius: 8px;
  border: 1.5px solid #059669;
  background: white;
  color: #059669;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  flex-shrink: 0;
}
.btn-reanalyze:hover:not(:disabled) { background: #d1fae5; }
.btn-reanalyze:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-reanalyze.loading { background: #d1fae5; }
.spin { animation: spin 0.8s linear infinite; }

.action-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 900;
  color: #064e3b;
}

.ai-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 900;
  color: #047857;
  background: white;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(4, 120, 87, 0.15);
  width: max-content;
}

.icon-ai-pulse {
  color: #059669;
  animation: aiPulse 2s infinite;
}

@keyframes aiPulse {
  0% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(5, 150, 105, 0.4)); }
  50% { transform: scale(1.1); filter: drop-shadow(0 0 8px rgba(5, 150, 105, 0.8)); }
  100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(5, 150, 105, 0.4)); }
}

.form-grid {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 800;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

/* カスタムオートコンプリート */
.ac-wrap {
  position: relative;
}
.ac-list {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  z-index: 200;
  background: white;
  border: 1.5px solid #059669;
  border-radius: 0 0 10px 10px;
  max-height: 200px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0.25rem 0;
  box-shadow: 0 8px 24px rgba(5, 150, 105, 0.15);
}
.ac-list li {
  padding: 0.55rem 1rem;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 700;
  color: #334155;
  transition: background 0.1s;
}
.ac-list li:hover {
  background: #f0fdf4;
  color: #047857;
}

.modern-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #1e293b;
  transition: all 0.2s ease;
}

.modern-input:focus {
  outline: none;
  border-color: #059669;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
}

.action-buttons {
  padding: 1.5rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: auto;
}

.items-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  grid-column: span 2;
}

.item-row {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
  background: #f8fafc;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.item-row-header {
  grid-column: span 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px dashed #cbd5e1;
  padding-bottom: 0.5rem;
}

.item-index {
  font-size: 0.8rem;
  font-weight: 800;
  color: #64748b;
  background: #e2e8f0;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
}

.btn-remove-item {
  font-size: 0.75rem;
  color: #ef4444;
  background: #fee2e2;
  border: none;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 800;
}

.btn-add-item {
  background: #f1f5f9;
  border: 2px dashed #cbd5e1;
  color: #64748b;
  padding: 0.75rem;
  border-radius: 8px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
  grid-column: span 2;
}

.btn-add-item:hover {
  background: #e2e8f0;
  border-color: #94a3b8;
  color: #334155;
}

/* ── 複数伝票セクション ── */
.invoice-section {
  margin-bottom: 0.5rem;
}

.invoice-section-multi {
  border: 1.5px solid var(--emerald-border);
  border-radius: 12px;
  padding: 0.875rem;
  background: rgba(240, 253, 244, 0.45);
}

.invoice-section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--emerald-border);
}

.invoice-num {
  font-weight: 800;
  font-size: 0.75rem;
  color: var(--emerald);
  background: var(--emerald-light);
  padding: 2px 10px;
  border-radius: 99px;
  white-space: nowrap;
}

.invoice-preview {
  flex: 1;
  font-size: 0.75rem;
  color: var(--text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-remove-invoice {
  background: none;
  border: 1px solid #fca5a5;
  color: #ef4444;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.btn-remove-invoice:hover {
  background: #fee2e2;
}

.btn-add-invoice {
  width: 100%;
  padding: 0.65rem 1rem;
  border: 2px dashed var(--emerald-border);
  background: transparent;
  color: var(--emerald);
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  margin-bottom: 1rem;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}

.btn-add-invoice:hover {
  background: var(--emerald-tint);
  border-color: var(--emerald);
}

/* ── カテゴリチップ ── */
.form-group-category {
  grid-column: span 2;
}

.category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.2rem;
}

.cat-chip {
  padding: 3px 10px;
  border-radius: 99px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.6;
}

.cat-chip:hover {
  border-color: var(--emerald-border);
  color: var(--emerald);
  background: var(--emerald-tint);
}

.cat-chip.active {
  background: var(--emerald);
  color: white;
  border-color: var(--emerald);
}

/* 苗・種子は緑系で目立たせる */
.cat-chip.active:has(+ .cat-chip),
.cat-chip[class*="active"] {
  box-shadow: 0 0 0 2px var(--emerald-glow);
}

.btn-process {
  width: 100%;
  padding: 1rem;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-process:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
.btn-process:disabled:hover {
  transform: none;
}

/* 必須マーク表示用 */
.required-dot {
  color: #ef4444;
  margin-left: 2px;
  font-weight: 900;
}

.btn-receipt {
  background: #10b981;
  color: white;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}
.btn-receipt:not(:disabled):hover { background: #059669; transform: translateY(-2px); }

.btn-master {
  background: var(--primary);
  color: white;
  box-shadow: 0 4px 12px rgba(26, 107, 58, 0.25);
}
.btn-master:not(:disabled):hover { background: hsl(145, 65%, 18%); transform: translateY(-2px); }

.btn-delete {
  background: white;
  color: #ef4444;
  border: 1.5px solid #ef4444;
  margin-top: 0.5rem;
}
.btn-delete:hover { background: #fef2f2; }

.custom-doc-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.btn-custom-toggle {
  background: white;
  color: #f59e0b;
  border: 1.5px solid #f59e0b;
  font-size: 0.9rem;
}
.btn-custom-toggle:hover { background: #fffbeb; }
.btn-custom-toggle.active { background: #fef3c7; border-color: #d97706; color: #b45309; }

.custom-input-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.btn-custom-exec {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
  font-size: 0.9rem;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
}
.btn-custom-exec:not(:disabled):hover { background: linear-gradient(135deg, #d97706, #b45309); transform: translateY(-2px); }

@media (max-width: 1200px) {
  .inbox-layout {
    flex-direction: column;
  }
  .inbox-list {
    width: 100%;
    height: 300px;
    flex: none;
  }
  .detail-content {
    flex-direction: column;
  }
  .action-pane {
    width: 100%;
    border-top: 1px solid #e2e8f0;
  }
}
</style>
