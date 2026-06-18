<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  Layers,
  Search,
  Filter,
  Download,
  ExternalLink,
  Calendar,
  User,
  Tag,
  Eye,
  X,
  FileText,
  ShieldCheck,
  Plus,
  ImageIcon,
  Save,
  Edit,
  Building2,
  Leaf,
  Trash2,
  Lock,
  LayoutGrid,
  List
} from 'lucide-vue-next';
import { state, actions } from '../../store';

const searchQuery = ref('');
const selectedDocType = ref('all');
const viewMode = ref('card'); // 'card' | 'list'

const filteredReceipts = computed(() => {
  let receipts = [...(state.records.t_material_receipt || [])];

  // Sort by date descending
  receipts.sort((a, b) => new Date(b.date) - new Date(a.date));

  // 監査モード中は監査期間でフィルタリング
  if (state.auditMode.active) {
    if (state.auditMode.startDate) receipts = receipts.filter(r => (r.date || '') >= state.auditMode.startDate);
    if (state.auditMode.endDate)   receipts = receipts.filter(r => (r.date || '') <= state.auditMode.endDate);
  }

  if (selectedDocType.value !== 'all') {
    receipts = receipts.filter(r => r.docType === selectedDocType.value);
  }

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    receipts = receipts.filter(r =>
      (r.materialName || '').toLowerCase().includes(q) ||
      (r.supplier || '').toLowerCase().includes(q) ||
      (r.partnerName || '').toLowerCase().includes(q)
    );
  }

  return receipts;
});

// 納品書（画像・伝票）単位でグルーピング
const groupedNotes = computed(() => {
  const receipts = filteredReceipts.value;
  const groups = {};

  receipts.forEach(r => {
    const key = r.certUrl || r.photoUrl || `${r.date}_${r.partnerId || r.supplier || r.partnerName}`;
    
    // 🌟 マスタ（m_material）に登録されている適合証明書（certUrl/jasCertUrl）をリアルタイムに逆引きして「証明書OK」を動的判定
    const mat = (state.masters.m_material || []).find(m => m.id === r.materialId || m.name === r.materialName);
    const itemHasCert = r.hasCert || !!(mat && (mat.certUrl || mat.jasCertUrl));

    if (!groups[key]) {
      groups[key] = {
        key: key,
        docType: r.docType || '納品書',
        date: r.date,
        expiryDate: r.expiryDate || (mat ? (mat.expiry || mat.expiryDate || '') : ''),
        supplier: r.partnerName || r.supplier || '未指定の仕入先',
        partnerId: r.partnerId || '',
        // レコード自身の certUrl/photoUrl → なければマスタの certUrl をフォールバック
        photoUrl: r.certUrl || r.photoUrl || (mat ? (mat.certUrl || mat.jasCertUrl) : null) || null,
        hasCert: itemHasCert,
        items: [],
        originalRecords: []
      };
    } else {
      // 複数資材が含まれる伝票の場合、いずれかの資材で証明書が登録されていれば「証明書OK」を適用
      if (itemHasCert) {
        groups[key].hasCert = true;
      }
      // photoUrl が未設定なら後続レコードのマスタから補完
      if (!groups[key].photoUrl) {
        groups[key].photoUrl = r.certUrl || r.photoUrl || (mat ? (mat.certUrl || mat.jasCertUrl) : null) || null;
      }
    }
    let cat = r.category || '';
    if (cat === '肥料' || cat === '農薬') {
      cat = '肥料・農薬';
    } else if (cat === '種苗') {
      cat = '苗・種子'; // 旧表記を統一
    }
    groups[key].items.push({
      id: r.id,
      materialName: r.materialName,
      quantity: r.quantity,
      category: cat
    });
    groups[key].originalRecords.push(r);
  });

  return Object.values(groups);
});

// リスト表示用：groupedNotes を日付ごとにまとめる
const groupedByDate = computed(() => {
  const dateMap = {};
  groupedNotes.value.forEach(card => {
    const d = card.date || '日付不明';
    if (!dateMap[d]) dateMap[d] = [];
    dateMap[d].push(card);
  });
  return Object.entries(dateMap)
    .sort(([a], [b]) => new Date(b) - new Date(a))
    .map(([date, cards]) => ({ date, cards }));
});

const STANDARD_TYPES = ['資材適合書', '種苗納品書', '肥料・農薬納品書'];
const isCertType = (dt) => dt === '資材適合書' || dt === '資材・適合証明書';

onMounted(() => { actions.migrateMaterialReceiptDocTypes(); });


const materials = computed(() => state.masters.m_material || []);
const singleMaterialId = ref('');
const singleMaterialName = ref('');

const onSingleMaterialChange = () => {
  if (singleMaterialId.value && singleMaterialId.value !== 'new_auto') {
    const selected = materials.value.find(m => m.id === singleMaterialId.value);
    if (selected) {
      singleMaterialName.value = selected.name;
    }
  }
};

// Photo Preview Logic
const isPreviewOpen = ref(false);
const previewUrl = ref('');

const isPdfUrl = (url) => {
  if (!url) return false;
  if (url.startsWith('data:application/pdf')) return true;
  if (url.includes('.pdf')) return true;
  return false;
};

const openPreview = (url) => {
  if (!url) return;
  previewUrl.value = url;
  isPreviewOpen.value = true;
};

const exportExcel = () => {
  // Define columns for JAS compliant material ledger
  const headers = ['受取日', '書類種別', '資材名', '数量', '仕入先', '証明書確認'];
  
  // Prepare data based on current filtered results (バラの受入れデータ)
  const rows = filteredReceipts.value.map(r => {
    // 🌟 マスタ（m_material）に登録されている適合証明書（certUrl/jasCertUrl）をリアルタイムに逆引きして「確認済み」を動的判定
    const mat = (state.masters.m_material || []).find(m => m.id === r.materialId || m.name === r.materialName);
    const hasCert = r.hasCert || !!(mat && (mat.certUrl || mat.jasCertUrl));
    return [
      r.date,
      r.docType,
      r.materialName,
      r.quantity,
      r.supplier || r.partnerName,
      hasCert ? '確認済み' : '未確認'
    ];
  });

  // Convert to CSV string with BOM for Excel (Windows)
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Trigger download
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `資材購入台帳_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Registration Logic
const isRegModalOpen = ref(false);
const isScanning = ref(false);
const editingId = ref(null);
const editingOriginalIds = ref([]); // 編集開始時の対象レコードID群（削除対象を正確に特定するため）
const fileInput = ref(null);

const newReceipt = ref({
  docType: '種苗納品書',
  date: new Date().toISOString().split('T')[0],
  expiryDate: '',
  supplier: '',
  hasCert: false,
  photoUrl: '',
  items: []
});

const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const max_dim = 1600;
        if (width > max_dim || height > max_dim) {
          if (width > height) {
            height = Math.round((height *= max_dim / width));
            width = max_dim;
          } else {
            width = Math.round((width *= max_dim / height));
            height = max_dim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await compressImage(file);
    newReceipt.value.photoUrl = dataUrl;
    startAIScan(file);
  } catch (error) {
    console.error("Image compression error:", error);
    actions.showToast('画像の読み込みに失敗しました', 'error');
  }
};

const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

const startAIScan = async (file) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    actions.showToast('APIキー未設定のため自動解析は行われません。手動で品目を入力してください。', 'info');
    return;
  }

  isScanning.value = true;
  try {
    const base64Image = await fileToBase64(file);
    const prompt = `
      以下の画像（納品書または証明書）から、記載されている【全ての品目】を抽出し、指定のJSON形式で返してください。
      {
        "supplier": "仕入先名",
        "date": "YYYY-MM-DD",
        "docType": "納品書|資材証明書|適合証明書",
        "items": [
          { "materialName": "資材名", "quantity": "数量（単位含）", "category": "肥料・農薬|種苗|機材" }
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
            { inline_data: { mime_type: file.type, data: base64Image } }
          ]
        }]
      })
    });

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json();
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract JSON block
    const jsonMatch = textResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      newReceipt.value.supplier = parsed.supplier || '';
      newReceipt.value.date = parsed.date || new Date().toISOString().split('T')[0];
      
      let detectedDocType = parsed.docType || '種苗納品書';
      if (detectedDocType === '資材証明書' || detectedDocType === '適合証明書') {
        detectedDocType = '資材適合書';
      } else if (detectedDocType === '納品書') {
        detectedDocType = '種苗納品書';
      }
      newReceipt.value.docType = detectedDocType;
      newReceipt.value.items = parsed.items || [];

      // 資材適合書の場合は単一資材の値を初期設定
      if (isCertType(detectedDocType) && parsed.items && parsed.items.length > 0) {
        const firstItem = parsed.items[0];
        singleMaterialName.value = firstItem.materialName || '';
        const found = materials.value.find(m => 
          m.name.includes(singleMaterialName.value) || singleMaterialName.value.includes(m.name)
        );
        singleMaterialId.value = found ? found.id : 'new_auto';
      }
      actions.showToast('AI解析が正常に完了しました！', 'success');
    }
  } catch (error) {
    console.error('Gemini OCR scan failed:', error);
    actions.showToast('AI解析に失敗しました。手動で入力してください。', 'error');
  } finally {
    isScanning.value = false;
  }
};

const addItem = () => {
  newReceipt.value.items.push({ materialName: '', quantity: '', category: '資材' });
};

const removeItem = (index) => {
  newReceipt.value.items.splice(index, 1);
};

const openAddModal = () => {
  editingId.value = null;
  editingOriginalIds.value = [];
  singleMaterialId.value = '';
  singleMaterialName.value = '';
  customTypeName.value = '';
  newReceipt.value = {
    docType: '種苗納品書',
    date: new Date().toISOString().split('T')[0],
    expiryDate: '',
    supplier: '',
    hasCert: false,
    photoUrl: '',
    items: [{ materialName: '', quantity: '', category: '資材' }]
  };
  isRegModalOpen.value = true;
};

const openEditGroupModal = (group) => {
  editingId.value = group.key;
  // 削除対象を「このグループに属するレコードのID」だけに固定する（certUrl共有による連鎖削除防止）
  editingOriginalIds.value = group.originalRecords.map(r => r.id);

  if (isCertType(group.docType) && group.originalRecords.length > 0) {
    const firstRec = group.originalRecords[0];
    singleMaterialId.value = firstRec.materialId || '';
    singleMaterialName.value = firstRec.materialName || '';
  } else {
    singleMaterialId.value = '';
    singleMaterialName.value = '';
  }

  newReceipt.value = {
    docType: group.docType,
    date: group.date,
    expiryDate: group.expiryDate || '',
    supplier: group.supplier,
    hasCert: group.hasCert,
    photoUrl: group.photoUrl,
    items: group.originalRecords.map(r => ({
      id: r.id,
      materialName: r.materialName || '',
      quantity: r.quantity || '',
      category: r.category || '肥料・農薬'
    }))
  };
  isRegModalOpen.value = true;
};

const handleDeleteGroup = (group) => {
  const isCert = isCertType(group.docType);
  const label = isCert ? 'この証明書書類' : `この書類（含まれるすべての資材: ${group.items.length}件）`;
  if (confirm(`${label}を完全に削除してもよろしいですか？\n（資材受入台帳からすべての資材レコードが削除されます）`)) {
    group.originalRecords.forEach(r => {
      actions.deleteMaterialReceipt(r.id);
    });
    actions.showToast(isCert ? '証明書を削除しました' : '書類を削除しました', 'info');
  }
};

const handleRegister = () => {
  // 標準タグ以外はすべてその他に正規化
  if (!STANDARD_TYPES.includes(newReceipt.value.docType) && !isCertType(newReceipt.value.docType)) {
    newReceipt.value.docType = 'その他';
  }

  // 資材適合書の場合は単一資材の値を合成
  if (isCertType(newReceipt.value.docType)) {
    let matName = singleMaterialName.value.trim();
    let matId = singleMaterialId.value;

    if (!matName && matId && matId !== 'new_auto') {
      matName = materials.value.find(m => m.id === matId)?.name || '';
    }

    if (!matName) {
      actions.showToast('証明対象の資材名を入力してください', 'warning');
      return;
    }

    if (matId === 'new_auto' || !matId) {
      // 資材マスタ新規自動追加
      const newMat = actions.addMasterItem('m_material', {
        name: matName,
        category: '肥料・農薬',
        unit: '袋'
      });
      matId = newMat?.id || '';
    }

    newReceipt.value.items = [{
      materialName: matName,
      quantity: '1枚',
      category: '肥料・農薬',
      selectedMaterialId: matId
    }];
  }

  if (newReceipt.value.items.length === 0) {
    actions.showToast('品目を入力してください', 'warning');
    return;
  }
  
  if (editingId.value) {
    // 編集時は「編集開始時に保存したID」のみ削除する
    // ※ certUrl / date+supplier による横断検索は certUrl 共有で別レコードを巻き込む危険があるため廃止
    editingOriginalIds.value.forEach(id => {
      actions.deleteMaterialReceipt(id);
    });
    editingOriginalIds.value = [];
  }

  // 新規または編集（再登録）として一括登録
  newReceipt.value.items.forEach(item => {
    actions.addMaterialReceipt({
      docType: newReceipt.value.docType,
      date: newReceipt.value.date,
      expiryDate: isCertType(newReceipt.value.docType) ? newReceipt.value.expiryDate : '',
      supplier: newReceipt.value.supplier,
      partnerName: newReceipt.value.supplier,
      hasCert: isCertType(newReceipt.value.docType) ? true : newReceipt.value.hasCert,
      photoUrl: newReceipt.value.photoUrl,
      certUrl: newReceipt.value.photoUrl,
      materialId: item.selectedMaterialId || '',
      materialName: item.materialName,
      quantity: item.quantity,
      category: item.category || '肥料・農薬'
    });

    // 🌟 【マスタ（m_material）への自動同期・最新情報共有】
    if (isCertType(newReceipt.value.docType)) {
      const matId = item.selectedMaterialId;
      const matName = item.materialName;
      const material = (state.masters.m_material || []).find(m => m.id === matId || m.name === matName);
      if (material) {
        material.expiry = newReceipt.value.expiryDate || '';
        material.expiryDate = newReceipt.value.expiryDate || '';
        material.certUrl = newReceipt.value.photoUrl || null;
        material.jasCertUrl = newReceipt.value.photoUrl || null;
      }
    }
  });

  isRegModalOpen.value = false;
  actions.showToast(editingId.value ? '記録を修正しました！' : '記録を登録しました！', 'success');
};
</script>

<template>
  <div class="purchase-history-pro animate-slide-up">
    <!-- Pro Header -->
    <div class="header glass shadow-sm">
      <div class="title-group">
        <Layers size="28" class="text-primary" />
        <div>
          <h2>資材購入・証憑台帳 <small>v.Pro</small></h2>
          <p>AIが納品書を解析し、JAS準拠の台帳を自動生成</p>
        </div>
      </div>
      <div class="btn-group">
<button @click="actions.bulkFixReceiptCategories()" class="btn-fix-category" title="「資材」カテゴリの品目を品名から自動判定して補正します">
          ✦ カテゴリ自動補正
        </button>
        <button @click="openAddModal" class="btn-primary shadow-glow">
          <Plus size="20" /> 新規登録・AI解析
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

    <!-- Smart Filters -->
    <div class="filter-bar glass mb-4">
      <div class="search-box">
        <Search size="16" class="text-muted" />
        <input v-model="searchQuery" placeholder="資材名・仕入先で検索..." />
      </div>
      <div class="filter-item ml-auto">
        <Tag size="14" class="text-muted" />
        <select v-model="selectedDocType" class="glass">
          <option value="all">すべての書類</option>
          <option value="資材適合書">資材適合書</option>
          <option value="種苗納品書">種苗納品書</option>
          <option value="肥料・農薬納品書">肥料・農薬納品書</option>
          <option value="その他">その他</option>
        </select>
      </div>
      <!-- 表示切り替えボタン -->
      <div class="view-toggle">
        <button @click="viewMode = 'card'" :class="['toggle-btn', { active: viewMode === 'card' }]">
          <LayoutGrid size="14" /><span>カード</span>
        </button>
        <button @click="viewMode = 'list'" :class="['toggle-btn', { active: viewMode === 'list' }]">
          <List size="14" /><span>リスト</span>
        </button>
      </div>
    </div>

    <!-- ── カード表示 ── -->
    <div v-if="viewMode === 'card'" class="evidence-grid">
      <div v-for="r in groupedNotes" :key="r.key" class="evidence-card glass shadow-sm animate-pop">
        <div class="card-image" @click="openPreview(r.photoUrl)">
          <template v-if="r.photoUrl">
            <img v-if="!isPdfUrl(r.photoUrl)" :src="r.photoUrl" />
            <div v-else class="pdf-thumb">
              <FileText size="40" />
              <span>PDF書類</span>
            </div>
          </template>
          <div v-else class="no-image"><FileText size="40" class="text-muted" /></div>
          <div class="image-overlay">
            <Eye size="24" />
            <span>伝票写真を拡大</span>
          </div>
          <div class="doc-badge" :class="[r.docType, { 'badge-custom': !['資材適合書','種苗納品書','肥料・農薬納品書','納品書','資材・適合証明書'].includes(r.docType) }]">
            {{ r.docType }}
          </div>
        </div>
        
        <div class="card-content">
          <div class="date-row">
            <Calendar size="14" />
            <span>受取日: {{ r.date }}</span>
          </div>
          
          <div v-if="isCertType(r.docType) && r.expiryDate" class="date-row text-success font-bold" style="margin-top: -0.25rem;">
            <ShieldCheck size="14" class="text-success" />
            <span>有効期限: {{ r.expiryDate }}</span>
            <span v-if="new Date(r.expiryDate) < new Date()" class="badge-expired">期限切れ</span>
          </div>
          
          <h3 class="supplier-title">{{ r.supplier }}</h3>
          
          <!-- 購入品目リスト (複数資材のスマートな表示) -->
          <div class="note-items-list-box">
            <div class="note-items-header">🌱 {{ isCertType(r.docType) ? '証明対象資材' : `購入資材内訳 (${r.items.length}品目)` }}</div>
            <div class="note-items-scroll">
              <div v-for="item in r.items" :key="item.id" class="note-item-row">
                <span class="item-name" :title="item.materialName">{{ item.materialName }}</span>
                <span class="item-qty">{{ item.quantity || '-' }}</span>
                <span v-if="item.category" class="item-cat" :class="item.category">{{ item.category }}</span>
              </div>
            </div>
          </div>

          <div class="card-footer mt-auto">
            <div class="status-indicator" :class="{ verified: r.hasCert }">
              <ShieldCheck size="14" />
              <span>{{ r.hasCert ? '証明書OK' : '未確認' }}</span>
            </div>
            <div class="card-actions">
              <button @click="openEditGroupModal(r)" class="btn-text-action view">編集</button>
              <button @click="handleDeleteGroup(r)" class="btn-text-action delete">削除</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="groupedNotes.length === 0" class="empty-state card glass full-width">
        <FileText size="48" class="text-muted mb-4" />
        <p>該当する納品書・証憑データが見つかりません。</p>
      </div>
    </div>

    <!-- ── リスト表示 ── -->
    <div v-else class="list-view animate-slide-up">
      <div v-if="groupedByDate.length === 0" class="empty-state card glass">
        <FileText size="48" class="text-muted mb-4" />
        <p>該当する納品書・証憑データが見つかりません。</p>
      </div>

      <div v-for="group in groupedByDate" :key="group.date" class="date-section">
        <!-- 日付ヘッダー -->
        <div class="date-section-header">
          <Calendar size="14" />
          <span class="date-label">{{ group.date }}</span>
          <span class="date-count">{{ group.cards.reduce((s, c) => s + c.items.length, 0) }}品目</span>
        </div>

        <!-- テーブル -->
        <div class="list-table glass">
          <div class="list-thead">
            <span class="lc-supplier">仕入先</span>
            <span class="lc-materials">資材</span>
            <span class="lc-doctype">書類種別</span>
            <span class="lc-cert">証明書</span>
            <span class="lc-actions"></span>
          </div>

          <div v-for="card in group.cards" :key="card.key" class="list-row">
            <!-- 仕入先 -->
            <span class="lc-supplier">
              <span class="lsup-name">{{ card.supplier }}</span>
              <span v-if="card.expiryDate" class="lsup-expiry">期限: {{ card.expiryDate }}
                <span v-if="new Date(card.expiryDate) < new Date()" class="badge-expired">期限切れ</span>
              </span>
            </span>

            <!-- 資材（複数アイテムは縦並び） -->
            <span class="lc-materials">
              <div v-for="item in card.items" :key="item.id" class="lmat-row">
                <span class="lmat-name" :title="item.materialName">{{ item.materialName }}</span>
                <span class="lmat-qty">{{ item.quantity || '-' }}</span>
                <span v-if="item.category" class="item-cat" :class="item.category">{{ item.category }}</span>
              </div>
            </span>

            <!-- 書類種別 -->
            <span class="lc-doctype">
              <span class="ldoc-badge" :class="{ 'is-cert': isCertType(card.docType) }">
                {{ card.docType }}
              </span>
            </span>

            <!-- 証明書 -->
            <span class="lc-cert">
              <span class="lcert-status" :class="{ ok: card.hasCert }">
                <ShieldCheck size="13" />{{ card.hasCert ? '証明書OK' : '未確認' }}
              </span>
            </span>

            <!-- アクション -->
            <span class="lc-actions">
              <button v-if="card.photoUrl" @click="openPreview(card.photoUrl)" class="btn-list-act preview">伝票</button>
              <button @click="openEditGroupModal(card)" class="btn-list-act view">編集</button>
              <button @click="handleDeleteGroup(card)" class="btn-list-act del">削除</button>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <!-- Image Preview Modal (Premium Lightbox) -->
    <Transition name="fade">
      <div v-if="isPreviewOpen" class="lightbox-overlay" @click.self="isPreviewOpen = false">
        <div class="lightbox-content animate-zoom-in">
          <button @click="isPreviewOpen = false" class="btn-close-lightbox">
            <X size="32" />
          </button>
          <iframe v-if="isPdfUrl(previewUrl)" :src="previewUrl + '#toolbar=0'" class="lightbox-pdf" frameborder="0"></iframe>
          <img v-else :src="previewUrl" class="lightbox-image" />
          <div class="lightbox-caption">
            <ImageIcon size="16" /> 証憑書類プレビュー
          </div>
        </div>
      </div>
    </Transition>

    <!-- Registration/AI Scan Modal -->
    <Transition name="fade">
      <div v-if="isRegModalOpen" class="overlay glass-heavy">
        <div class="modal card glass scale-up">
          <div class="modal-header">
            <div class="title-wrap">
              <ImageIcon size="24" class="text-primary" />
              <h3>{{ editingId ? '記録の修正' : '購入証憑の新規登録' }}</h3>
            </div>
            <button @click="isRegModalOpen = false" class="btn-close"><X size="24" /></button>
          </div>

          <div class="modal-body">
            <div class="upload-section">
              <input type="file" ref="fileInput" hidden @change="handleFileUpload" accept="image/*,application/pdf" />
              <!-- 書類あり: プレビュー表示 + 差し替えボタン -->
              <div v-if="newReceipt.photoUrl" class="preview-wrap-modal">
                <div class="preview-doc-area" @click="openPreview(newReceipt.photoUrl)">
                  <img v-if="!isPdfUrl(newReceipt.photoUrl)" :src="newReceipt.photoUrl" class="upload-preview" />
                  <div v-else class="pdf-thumb-modal">
                    <FileText size="48" />
                    <span>PDF書類</span>
                  </div>
                  <div class="image-overlay">
                    <Eye size="24" />
                    <span>書類を拡大確認</span>
                  </div>
                  <div v-if="isScanning" class="scan-overlay">
                    <div class="scan-line"></div>
                    <div class="scan-pulse"></div>
                    <div class="scan-text">AIが納品書を解析中...</div>
                  </div>
                </div>
                <button type="button" @click="fileInput.click()" class="btn-replace-file">
                  <Plus size="14" /> 別ファイルに差し替え（AI再解析）
                </button>
              </div>
              <!-- 書類なし: アップロードゾーン -->
              <div v-else class="upload-zone card glass" @click="fileInput.click()">
                <div class="upload-placeholder">
                  <div class="upload-icon-circle"><Plus size="32" /></div>
                  <p>写真・PDFをアップロードしてAI解析</p>
                  <small>Geminiが内容を自動で読み取ります</small>
                </div>
              </div>
            </div>

            <div class="form-grid mt-2">
              <div class="form-group">
                <label>書類種別</label>
                <select v-model="newReceipt.docType" class="glass">
                  <option value="種苗納品書">種苗納品書</option>
                  <option value="肥料・農薬納品書">肥料・農薬納品書</option>
                  <option value="資材適合書">資材適合書</option>
                  <option value="その他">その他</option>
                </select>
              </div>
              <div class="form-group">
                <label>受取日</label>
                <input v-model="newReceipt.date" type="date" class="glass" />
              </div>
              <div v-if="isCertType(newReceipt.docType)" class="form-group full animate-slide-up">
                <label style="color: #10b981; font-weight: 900;">📅 有効期限（期限が切れる日）</label>
                <input v-model="newReceipt.expiryDate" type="date" class="glass highlight-select" />
              </div>
              <div class="form-group full">
                <label>仕入先</label>
                <div class="input-with-icon">
                  <Building2 size="18" class="input-icon" />
                  <input v-model="newReceipt.supplier" placeholder="例：国分種苗" class="glass-input" />
                </div>
              </div>
            </div>

            <!-- 納品書系またはその他の場合は資材品目追加テーブル -->
            <div v-if="!isCertType(newReceipt.docType)" class="items-builder mt-2">
              <div class="section-header">
                <label>解析された資材リスト</label>
                <button @click="addItem" class="btn-add-item"><Plus size="16" /> 品目を追加</button>
              </div>
              <div class="items-table-scroll">
                <table class="builder-table">
                  <thead>
                    <tr><th>カテゴリ</th><th>資材名</th><th>数量</th><th width="40"></th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="(item, idx) in newReceipt.items" :key="idx">
                      <td>
                        <select v-model="item.category" class="table-input">
                          <option value="種苗">種苗</option>
                          <option value="肥料・農薬">肥料・農薬</option>
                          <option value="資材">資材</option>
                          <option value="その他">その他</option>
                        </select>
                      </td>
                      <td><input v-model="item.materialName" placeholder="資材名..." /></td>
                      <td><input v-model="item.quantity" placeholder="10kg" class="text-right" /></td>
                      <td><button @click="removeItem(idx)" class="btn-del"><Trash2 size="16" /></button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 資材・適合証明書 の場合は単一の証明資材元選択フォーム -->
            <div v-else class="items-builder mt-2 animate-slide-up">
              <div class="form-group full">
                <label>🌱 証明対象の資材（マスタから自動検出・選択）</label>
                <div class="select-wrap">
                  <select v-model="singleMaterialId" class="glass highlight-select" @change="onSingleMaterialChange">
                    <option value="">-- 新規登録する（マスタ外） --</option>
                    <option v-for="m in materials" :key="m.id" :value="m.id">
                      [{{ m.category }}] {{ m.name }}
                    </option>
                  </select>
                </div>
              </div>
              
              <div v-if="!singleMaterialId" class="form-group full mt-2 animate-slide-up">
                <label>新規登録する資材名</label>
                <div class="input-with-icon">
                  <Leaf size="18" class="input-icon" />
                  <input v-model="singleMaterialName" placeholder="証明する資材名を入力してください（例：有機あいのう肥料）" class="glass-input font-bold" />
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <div v-if="isCertType(newReceipt.docType)" class="cert-check-info text-success">
              <ShieldCheck size="18" />
              <span>証明書類（JAS適合証）として台帳に保管されます</span>
            </div>
            <div v-else-if="newReceipt.docType === 'その他'" class="cert-check-info" style="color: #b45309; background: #fef3c7; border-radius: 8px; padding: 0.5rem 0.75rem;">
              <Lock size="16" style="color:#d97706" />
              <span>「その他」書類として証憑台帳に保管されます</span>
            </div>
            <div v-else></div>
            <div class="btn-group-row">
              <button @click="isRegModalOpen = false" class="btn-secondary">キャンセル</button>
              <button @click="handleRegister" class="btn-primary" :disabled="isCertType(newReceipt.docType) ? !singleMaterialName.trim() : newReceipt.items.length === 0">
                <Save size="18" /> {{ editingId ? '変更を保存' : '登録を実行' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.purchase-history-pro { padding: 1.5rem; width: 100%; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding: 1.25rem 2rem; border-radius: 16px; background: white; border: 1px solid var(--glass-stroke); }
.title-group { display: flex; gap: 1rem; align-items: center; }
.title-group h2 { font-size: 1.5rem; font-weight: 900; margin: 0; }
.title-group small { font-size: 0.8rem; color: var(--primary); font-family: monospace; }
.title-group p { color: var(--text-soft); font-size: 0.85rem; margin: 0; }
.btn-group { display: flex; gap: 0.75rem; }

.filter-bar { padding: 0.75rem 1.25rem; border-radius: 12px; display: flex; align-items: center; background: white; border: 1px solid var(--glass-stroke); }
.search-box { display: flex; align-items: center; gap: 0.5rem; background: #f1f5f9; padding: 0.5rem 1.25rem; border-radius: 999px; width: 300px; }
.search-box input { background: transparent; border: none; font-size: 0.9rem; flex: 1; outline: none; }
.ml-auto { margin-left: auto; }
.filter-item { display: flex; align-items: center; gap: 0.5rem; }

.evidence-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
.evidence-card { border-radius: 20px; overflow: hidden; background: white; border: 1px solid var(--glass-stroke); transition: all 0.3s; }
.evidence-card:hover { transform: translateY(-5px); box-shadow: 0 20px 40px rgba(0,0,0,0.1) !important; }

.card-image { position: relative; height: 180px; cursor: pointer; background: #f1f5f9; }
.card-image img { width: 100%; height: 100%; object-fit: cover; }
.image-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; opacity: 0; transition: 0.3s; }
.card-image:hover .image-overlay { opacity: 1; }
.no-image { height: 100%; display: flex; align-items: center; justify-content: center; color: #cbd5e1; }
.pdf-thumb { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; color: #059669; font-size: 0.8rem; font-weight: 800; background: #f0fdf4; }

.doc-badge { position: absolute; top: 1rem; left: 1rem; padding: 0.35rem 0.85rem; border-radius: 999px; font-size: 0.75rem; font-weight: 900; color: white; background: #64748b; box-shadow: 0 4px 10px rgba(0,0,0,0.25); border: 1.5px solid rgba(255,255,255,0.8); text-shadow: 0 1px 3px rgba(0,0,0,0.5); z-index: 5; }
.doc-badge.納品書 { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.doc-badge.資材・適合証明書, .doc-badge.資材証明書, .doc-badge.適合証明書 { background: linear-gradient(135deg, #10b981, #059669); }
.doc-badge.badge-custom { background: linear-gradient(135deg, #f59e0b, #b45309); }


.card-content { padding: 1.25rem; display: flex; flex-direction: column; min-height: 250px; }
.date-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: #64748b; font-weight: 700; margin-bottom: 0.5rem; }
.supplier-title { font-size: 1.15rem; font-weight: 900; color: #1e293b; margin-bottom: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.note-items-list-box {
  background: #f8fafc;
  border-radius: 12px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  border: 1px solid #e2e8f0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.note-items-header {
  font-size: 0.72rem;
  font-weight: 800;
  color: #64748b;
  margin-bottom: 0.5rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px dashed #cbd5e1;
}
.note-items-scroll {
  max-height: 120px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex: 1;
}
.note-items-scroll::-webkit-scrollbar {
  width: 4px;
}
.note-items-scroll::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 2px;
}
.note-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  gap: 0.5rem;
}
.item-name {
  font-weight: 800;
  color: #334155;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-qty {
  font-weight: 700;
  color: #475569;
  background: #cbd5e1;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.7rem;
  white-space: nowrap;
}
.item-cat {
  font-size: 0.62rem;
  font-weight: 800;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  white-space: nowrap;
}
.item-cat.肥料-農薬, .item-cat.肥料・農薬, .item-cat.肥料 { background: rgba(16, 185, 129, 0.1); color: #10b981; }
.item-cat.農薬 { background: rgba(239, 68, 68, 0.1); color: #dc2626; }
.item-cat.種苗, .item-cat.苗・種子 { background: rgba(34, 197, 94, 0.12); color: #16a34a; }
.item-cat.機材 { background: rgba(107, 114, 128, 0.1); color: #6b7280; }
.item-cat.飼料 { background: rgba(245, 158, 11, 0.1); color: #b45309; }
.item-cat.資材 { background: rgba(148, 163, 184, 0.1); color: #64748b; }

/* ── 表示切り替えトグル ── */
.view-toggle {
  display: flex;
  gap: 2px;
  margin-left: 1rem;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 3px;
}
.toggle-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0 0.65rem;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}
.toggle-btn:hover { background: #e2e8f0; color: #475569; }
.toggle-btn.active { background: white; color: var(--primary); box-shadow: 0 1px 4px rgba(0,0,0,0.10); }

/* ── リスト表示 ── */
.list-view { display: flex; flex-direction: column; gap: 1.5rem; }

.date-section {}
.date-section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  font-weight: 900;
  color: #334155;
  margin-bottom: 0.5rem;
  padding: 0 0.25rem;
}
.date-label { font-size: 1rem; letter-spacing: 0.03em; }
.date-count {
  font-size: 0.72rem;
  font-weight: 700;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
}

.list-table {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--glass-stroke);
}
.list-thead {
  display: grid;
  grid-template-columns: 150px 1fr 150px 110px 160px;
  padding: 0.5rem 1rem;
  background: #f8fafc;
  font-size: 0.72rem;
  font-weight: 800;
  color: #64748b;
  border-bottom: 1px solid #e2e8f0;
}
.list-row {
  display: grid;
  grid-template-columns: 150px 1fr 150px 110px 160px;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  align-items: center;
  transition: background 0.15s;
}
.list-row:last-child { border-bottom: none; }
.list-row:hover { background: #f8fafc; }

/* 仕入先列 */
.lc-supplier { display: flex; flex-direction: column; gap: 0.2rem; }
.lsup-name { font-size: 0.85rem; font-weight: 800; color: #1e293b; }
.lsup-expiry { font-size: 0.68rem; color: #10b981; font-weight: 700; }

/* 資材列 */
.lc-materials { display: flex; flex-direction: column; gap: 0.3rem; }
.lmat-row { display: flex; align-items: center; gap: 0.4rem; }
.lmat-name { font-size: 0.82rem; font-weight: 700; color: #334155; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.lmat-qty { font-size: 0.7rem; font-weight: 700; color: #475569; background: #e2e8f0; padding: 0.1rem 0.35rem; border-radius: 4px; white-space: nowrap; }

/* 書類種別列 */
.lc-doctype { display: flex; align-items: center; }
.ldoc-badge { font-size: 0.72rem; font-weight: 800; color: #64748b; background: #f1f5f9; padding: 0.2rem 0.55rem; border-radius: 999px; white-space: nowrap; }
.ldoc-badge.is-cert { background: #d1fae5; color: #059669; }

/* 証明書列 */
.lc-cert { display: flex; align-items: center; }
.lcert-status { display: flex; align-items: center; gap: 0.25rem; font-size: 0.72rem; font-weight: 800; color: #94a3b8; }
.lcert-status.ok { color: #10b981; }

/* アクション列 */
.lc-actions { display: flex; align-items: center; gap: 0.4rem; justify-content: flex-end; }
.btn-list-act {
  padding: 0.22rem 0.7rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 800;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: 0.15s;
  white-space: nowrap;
}
.btn-list-act.preview { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
.btn-list-act.view { background: #f1f5f9; color: #475569; }
.btn-list-act.del  { background: #fff1f2; color: #e11d48; border-color: #fecdd3; }
.btn-list-act:hover { opacity: 0.8; }

.btn-fix-category {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #16a34a, #15803d);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-fix-category:hover { opacity: 0.85; transform: translateY(-1px); }

.card-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; border-top: 1px solid #f1f5f9; }
.status-indicator { display: flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; font-weight: 800; color: #94a3b8; }
.status-indicator.verified { color: #10b981; }

.btn-text-action { padding: 0.3rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 800; border: 1px solid #e2e8f0; cursor: pointer; transition: 0.2s; }
.btn-text-action.view { background: #f1f5f9; color: #475569; }
.btn-text-action.delete { background: #fff1f2; color: #e11d48; border-color: #fecdd3; }
.btn-text-action:hover { opacity: 0.8; }

/* Lightbox & Photo UI Upgrade */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.lightbox-content {
  position: relative;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.lightbox-image {
  max-width: 100%;
  max-height: 80vh;
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  border: 4px solid rgba(255, 255, 255, 0.1);
}

.lightbox-pdf {
  width: 85vw;
  height: 82vh;
  border: none;
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.btn-close-lightbox {
  position: absolute;
  top: -60px;
  right: -20px;
  background: transparent;
  color: white;
  border: none;
  cursor: pointer;
  transition: transform 0.3s;
}

.btn-close-lightbox:hover { transform: scale(1.2) rotate(90deg); }

.lightbox-caption {
  margin-top: 1rem;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Upload Zone Upgrades */
.upload-zone { 
  height: 220px; 
  background: #f8fafc; 
  border: 2px dashed #e2e8f0; 
  border-radius: 16px; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  cursor: pointer; 
  overflow: hidden; 
  position: relative; 
  transition: all 0.3s;
}

.upload-zone:hover {
  border-color: var(--primary);
  background: var(--primary-glow);
}

.upload-icon-circle {
  width: 60px;
  height: 60px;
  background: white;
  color: var(--primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.upload-placeholder { text-align: center; color: #64748b; }
.upload-placeholder p { font-weight: 800; margin-bottom: 0.25rem; }
.upload-placeholder small { opacity: 0.7; }

.upload-preview { width: 100%; height: 100%; object-fit: contain; }

.scan-pulse {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, var(--primary) 0%, transparent 70%);
  opacity: 0.3;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.8); opacity: 0.1; }
  50% { transform: scale(1.2); opacity: 0.4; }
  100% { transform: scale(0.8); opacity: 0.1; }
}

.scan-text {
  font-weight: 900;
  color: #10b981 !important;
  text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
  z-index: 10;
}

/* Animations */
.animate-zoom-in {
  animation: zoomIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes zoomIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Common Modals & Overlay Styling */
.overlay { 
  position: fixed; 
  inset: 0; 
  z-index: 5000; 
  background: rgba(15, 23, 42, 0.4); 
  backdrop-filter: blur(12px); 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  padding: 2rem;
}

.modal { 
  width: 800px; 
  max-width: 95vw;
  height: 90vh; 
  max-height: 90vh;
  background: rgba(255, 255, 255, 0.9); 
  border-radius: 24px; 
  display: flex; 
  flex-direction: column; 
  overflow: hidden; 
  border: 1px solid var(--glass-stroke); 
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.modal-header { 
  padding: 1.5rem 2rem; 
  border-bottom: 1px solid var(--glass-stroke); 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
}

.modal-body { 
  flex: 1; 
  overflow-y: auto; 
  padding: 2rem; 
  display: flex; 
  flex-direction: column; 
  gap: 1.5rem; 
}

.modal-footer { 
  padding: 1.25rem 2rem; 
  background: rgba(248, 250, 252, 0.8); 
  border-top: 1px solid var(--glass-stroke); 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  gap: 1rem; 
}

.form-grid { 
  display: grid; 
  grid-template-columns: 1fr 1fr; 
  gap: 1.25rem; 
}

.form-group.full { 
  grid-column: span 2; 
}

.form-group label { 
  display: block; 
  font-size: 0.8rem; 
  font-weight: 800; 
  margin-bottom: 0.5rem; 
  color: var(--text-soft); 
}

.form-group input, .form-group select { 
  width: 100%; 
  padding: 0.75rem 1rem; 
  border-radius: 12px; 
  border: 1px solid var(--glass-stroke); 
  background: var(--bg-surface); 
  font-size: 0.95rem; 
  color: var(--text-main);
  transition: all 0.2s;
}

.form-group input:focus, .form-group select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-glow);
}

.highlight-select {
  border-color: #10b981 !important;
  background: rgba(16, 185, 129, 0.03) !important;
  font-weight: 800;
}

.cert-check-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  font-weight: 800;
  color: #10b981;
}

/* Upload Preview Animations & Layouts */
.preview-wrap {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* モーダル内書類プレビュー（編集時） */
.preview-wrap-modal {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.preview-doc-area {
  position: relative;
  height: 200px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--glass-stroke);
}
.preview-doc-area:hover .image-overlay { opacity: 1; }
.preview-doc-area .upload-preview { width: 100%; height: 100%; object-fit: contain; }
.pdf-thumb-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: #64748b;
  font-size: 0.85rem;
  font-weight: 600;
}
.btn-replace-file {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  border: 1px dashed #94a3b8;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  width: fit-content;
  transition: all 0.15s;
}
.btn-replace-file:hover { border-color: var(--primary); color: var(--primary); }

.scan-overlay { 
  position: absolute; 
  inset: 0; 
  background: rgba(16, 185, 129, 0.1); 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  justify-content: center; 
}

.scan-line { 
  position: absolute; 
  left: 0; 
  right: 0; 
  height: 3px; 
  background: #10b981; 
  box-shadow: 0 0 8px #10b981; 
  animation: scan 2s linear infinite; 
}

@keyframes scan {
  0% { top: 0%; }
  50% { top: 100%; }
  100% { top: 0%; }
}

/* Items Builder & Table Styling */
.items-builder { 
  display: flex; 
  flex-direction: column; 
  gap: 0.75rem; 
}

.section-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
}

.section-header label { 
  font-size: 0.8rem; 
  font-weight: 800; 
  color: var(--text-soft); 
}

.btn-add-item { 
  background: var(--primary-glow); 
  color: var(--primary); 
  padding: 0.4rem 0.85rem; 
  border-radius: 8px; 
  font-weight: 800; 
  font-size: 0.8rem; 
  display: flex; 
  align-items: center; 
  gap: 0.25rem; 
  border: 1px dashed var(--primary); 
  cursor: pointer; 
  transition: 0.2s; 
}

.btn-add-item:hover { 
  background: var(--primary);
  color: white;
}

.items-table-scroll { 
  max-height: 200px; 
  overflow-y: auto; 
  border: 1px solid var(--glass-stroke); 
  border-radius: 12px; 
  background: var(--bg-surface); 
}

.builder-table { 
  width: 100%; 
  border-collapse: collapse; 
  text-align: left; 
}

.builder-table th { 
  background: var(--bg-secondary); 
  padding: 0.75rem 1rem; 
  font-size: 0.75rem; 
  font-weight: 800; 
  color: var(--text-soft); 
  border-bottom: 1px solid var(--glass-stroke); 
}

.builder-table td { 
  padding: 0.5rem 1rem; 
  border-bottom: 1px solid var(--glass-stroke); 
  vertical-align: middle; 
}

.builder-table td input, .builder-table td select { 
  width: 100%; 
  padding: 0.5rem; 
  border-radius: 8px; 
  border: 1px solid var(--glass-stroke); 
  font-size: 0.85rem; 
  background: white; 
}

.btn-del { 
  background: #fff1f2; 
  color: #e11d48; 
  border: 1px solid #fecdd3; 
  padding: 0.4rem; 
  border-radius: 8px; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  cursor: pointer; 
  transition: 0.2s; 
}

.btn-del:hover { 
  background: #ffe4e6; 
}

/* Modal Footer controls */
.cert-check { 
  display: flex; 
  align-items: center; 
  gap: 0.5rem; 
  font-weight: 800; 
  color: #16a34a; 
  font-size: 0.85rem; 
  cursor: pointer; 
}

.cert-check input { 
  width: 18px; 
  height: 18px; 
}

.btn-group-row { 
  display: flex; 
  gap: 0.75rem; 
}

.title-wrap { 
  display: flex; 
  align-items: center; 
  gap: 0.75rem; 
}

.btn-close { 
  background: transparent; 
  border: none; 
  color: var(--text-soft); 
  cursor: pointer; 
  transition: 0.2s; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  padding: 0.25rem; 
  border-radius: 50%; 
}

.btn-close:hover { 
  background: var(--bg-secondary); 
  color: var(--text-main); 
}

.glass-input { 
  background: var(--bg-surface) !important; 
}
.font-bold { font-weight: 800; }
.text-success { color: #10b981 !important; }
.badge-expired {
  background: #fff1f2;
  color: #e11d48;
  border: 1px solid #fecdd3;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 900;
  margin-left: 0.5rem;
}
</style>
