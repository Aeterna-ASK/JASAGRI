<script setup>
import { ref, computed } from 'vue';
import { 
  FileText, 
  Truck, 
  ArrowRight, 
  Save, 
  ClipboardCheck, 
  AlertCircle, 
  X as CloseIcon, 
  Plus, 
  Trash2 as TrashIcon,
  Share2
} from 'lucide-vue-next';
import { state, actions } from '../../store';

const selectedPartnerId = ref('');
const items = ref([]); // Array of { name: '', quantity: null, unit: 'kg', unitPrice: null, isOrganic: true }
const isPreviewOpen = ref(false);
const generatedNote = ref(null);

const partners = computed(() => (state.masters.m_partner || []).filter(p => p.partnerType === '納品先' || p.category === '納品先'));
const selectedPartner = computed(() => partners.value.find(p => p.id === selectedPartnerId.value));

// 過去に納品した商品のユニークリストと単価情報
const uniquePastItems = computed(() => {
  const notes = state.records.t_delivery_note || [];
  const itemsMap = new Map();
  const partnerId = selectedPartnerId.value;
  
  // 日付昇順でソート
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
  
  return Array.from(itemsMap.values()).reverse();
});

// 商品名変更時に過去の単価を自動参照・設定
const onItemNameChange = (item) => {
  if (!item.name) return;
  
  const notes = state.records.t_delivery_note || [];
  const partnerId = selectedPartnerId.value;
  
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
const latestHarvest = computed(() => {
  const harvests = [...(state.records.t_harvest || [])];
  harvests.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return harvests[0] || null;
});

const totalAmount = computed(() => {
  return (items.value || []).reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
});

const organicRemark = computed(() => {
  if (!generatedNote.value || !generatedNote.value.itemDetails) return '';
  const itemDetails = generatedNote.value.itemDetails;
  const organicItems = itemDetails.filter(i => i.isOrganic);
  
  if (organicItems.length === 0) {
    return '';
  } else if (organicItems.length === itemDetails.length) {
    return '【備考】有機JAS格付確認済み（JASマーク表示品）';
  } else {
    const names = organicItems.map(i => i.fullName || i.name).join('、');
    return `【備考】${names}は有機JAS格付確認済み（JASマーク表示品）`;
  }
});

const addItem = () => {
  items.value.push({ name: '', quantity: null, unit: 'kg', unitPrice: null, isOrganic: true });
};

const removeItem = (index) => {
  items.value.splice(index, 1);
};

const handleReflect = () => {
  if (!latestHarvest.value) return;
  items.value.push({ 
    name: latestHarvest.value.cropName, 
    quantity: latestHarvest.value.harvestWeight,
    unit: 'kg',
    unitPrice: null,
    isOrganic: true
  });
};

const handleSave = () => {
  if (items.value.length === 0) {
    actions.showToast('品目を1項目以上追加してください', 'warning');
    return;
  }
  if (!selectedPartnerId.value) {
    actions.showToast('納品先を選択してください', 'warning');
    return;
  }

  try {
    const noteData = {
      partnerName: selectedPartner.value?.name || '指定なし',
      items: items.value.map(i => `${i.isOrganic ? '有機' : ''}${i.name} (${i.quantity || 0}${i.unit} @¥${i.unitPrice || 0})`).join(', '),
      itemDetails: items.value.map(i => ({ ...i, fullName: `${i.isOrganic ? '有機' : ''}${i.name}` })),
      amount: totalAmount.value,
      date: new Date().toISOString().split('T')[0],
      farmInfo: { ...state.farmInfo }
    };

    const savedNote = actions.addDeliveryNote({
      partnerId: selectedPartnerId.value,
      ...noteData
    });

    // 実際に保存された伝票番号(slipNo)を含むレコードをプレビューに使用
    generatedNote.value = savedNote || noteData;
    isPreviewOpen.value = true;
  } catch (err) {
    console.error('Save failed:', err);
    actions.showToast('発行処理中にエラーが発生しました', 'error');
  }
};

const handleSharePDF = () => {
  const element = document.getElementById('delivery-note-doc');
  if (!element) return;

  // 1. 新しいウィンドウ（タブ）を開く
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    actions.showToast('ポップアップがブロックされました。許可設定を確認してください。', 'warning');
    return;
  }

  // 2. 現在のスタイル（CSS）をすべて取得
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(s => s.outerHTML)
    .join('');

  // 3. 納品書のHTMLとスタイルを注入
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>納品書_${generatedNote.value.partnerName}</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${styles}
        <style>
          /* 別タブ専用のレイアウト調整 */
          body { 
            background: #4b5563 !important; 
            margin: 0 !important; 
            padding: 40px 20px !important;
            display: flex !important;
            justify-content: center !important;
            min-height: 100vh !important;
          }
          .printable-document { 
            transform: none !important; 
            margin: 0 auto !important; 
            box-shadow: 0 20px 50px rgba(0,0,0,0.3) !important;
            width: 210mm !important; /* A4幅 */
            min-height: 297mm !important;
            display: block !important;
            visibility: visible !important;
            position: relative !important;
            background: white !important;
          }
          /* 印刷時の設定 */
          @media print {
            body { background: white !important; padding: 0 !important; }
            .printable-document { 
              box-shadow: none !important; 
              width: 100% !important; 
              margin: 0 !important;
              padding: 15mm !important;
            }
          }
        </style>
      </head>
      <body>
        ${element.outerHTML}
        <script>
          // 別タブ側での自動アクションが必要な場合はここに記述
        <\/script>
      </body>
    </html>
  `);
  
  printWindow.document.close();
};

const closePreview = () => {
  isPreviewOpen.value = false;
  // Reset form
  selectedPartnerId.value = '';
  items.value = [];
};
</script>

<template>
  <div class="delivery-quick animate-slide-up">
    <div class="page-header">
      <div class="icon-wrap bg-accent-grad">
        <FileText size="24" />
      </div>
      <div>
        <h2>納品書クイック発行</h2>
        <p>現場での出荷・納品を即時記録</p>
      </div>
    </div>

    <!-- Suggested Harvest -->
    <div v-if="latestHarvest" class="card glass harvest-link mb-2">
      <div class="badge">最新の収穫記録あり</div>
      <div class="harvest-info">
        <ClipboardCheck size="18" class="text-primary" />
        <div>
          <strong>{{ latestHarvest.cropName }}</strong>
          <span>{{ latestHarvest.date }} / {{ latestHarvest.harvestWeight }}kg</span>
        </div>
      </div>
      <button @click="handleReflect" class="btn-reflect glass">
        このデータを品目に追加 <Plus size="14" />
      </button>
    </div>

    <div class="form card glass shadow-lg">
      <div class="form-group">
        <label>納品先を選択</label>
        <select v-model="selectedPartnerId" class="glass">
          <option value="">取引先マスタから選択</option>
          <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>

      <div class="form-group items-group">
        <div class="group-header">
          <label>納品品目リスト</label>
          <button @click="addItem" class="btn-mini-add">
            <Plus size="14" /> 品目を追加
          </button>
        </div>
        
        <div class="items-list">
          <div v-for="(item, idx) in items" :key="idx" class="item-row animate-pop">
            <!-- Close button in corner -->
            <button @click="removeItem(idx)" class="btn-remove-corner" title="削除">
              <component :is="TrashIcon" size="14" />
            </button>

            <div class="item-main">
              <!-- Stage 1: Name & Organic -->
              <div class="stack-row-1">
                <div @click="item.isOrganic = !item.isOrganic" :class="['organic-badge-btn', { active: item.isOrganic }]">
                  有機
                </div>
                <input v-model="item.name" type="text" placeholder="品名を入力" class="glass item-name" list="quick-past-items-list" @change="onItemNameChange(item)" />
              </div>
              
              <!-- Stage 2: Inputs -->
              <div class="stack-row-2">
                <div class="field-box">
                  <label>数量</label>
                  <div class="input-unit-wrap">
                    <input v-model="item.quantity" type="number" class="glass-input" />
                    <span class="unit-tag">{{ item.unit }}</span>
                  </div>
                </div>
                <div class="field-box">
                  <label>単価 (円)</label>
                  <input v-model="item.unitPrice" type="number" class="glass-input" />
                </div>
              </div>

              <!-- Stage 3: Subtotal -->
              <div class="stack-row-3">
                <span class="label">小計</span>
                <span class="value">¥{{ (Number(item.quantity || 0) * Number(item.unitPrice || 0)).toLocaleString() }}</span>
              </div>
            </div>
          </div>
          
          <div v-if="items.length === 0" class="empty-list">
            品目が追加されていません
          </div>
        </div>
        
        <!-- 以前納品した商品の価格参照用のデータリスト -->
        <datalist id="quick-past-items-list">
          <option v-for="pastItem in uniquePastItems" :key="pastItem.name" :value="pastItem.name">
            前回の単価: ¥{{ pastItem.unitPrice }} {{ pastItem.isCurrentPartner ? '（この取引先）' : '（他取引先）' }}
          </option>
        </datalist>
      </div>

      <div class="form-group">
        <label>合計金額（自動計算）</label>
        <div class="total-display glass-vibrant">
          <span class="currency">¥</span>
          <span class="amount">{{ totalAmount.toLocaleString() }}</span>
          <span class="tax-note">（税込）</span>
        </div>
      </div>

      <div class="mt-2 text-center text-soft text-sm">
        <p>※発行後、PDFが自動生成されクラウドに保存されます。</p>
      </div>

      <button 
        @click="handleSave" 
        :disabled="!selectedPartnerId || items.length === 0" 
        class="btn-primary w-full mt-2 py-4 shadow-xl"
      >
        <FileText size="20" />
        納品書を発行（プレビュー）
      </button>
    </div>

    <!-- PDF Preview Overlay -->
    <Transition name="fade">
      <div v-if="isPreviewOpen && generatedNote" class="preview-overlay">
        <div class="preview-content-card animate-pop">
          <div class="preview-header-actions">
            <div class="title-wrap">
              <h3>納品書プレビュー</h3>
              <span class="preview-badge">A4出力</span>
            </div>
            <div class="btn-group-row">
              <button @click="handleSharePDF" class="btn-share-pdf">
                <Share2 size="16" /> PDFを共有・保存
              </button>
              <button @click="closePreview" class="btn-close-preview">
                <CloseIcon size="20" />
              </button>
            </div>
          </div>

          <div class="doc-preview-wrapper">
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
                <div class="sender-address">
                  <h3>{{ generatedNote.farmInfo.name }}</h3>
                  <p>〒{{ generatedNote.farmInfo.postalCode }}</p>
                  <p>{{ generatedNote.farmInfo.address }}</p>
                  <p>TEL: {{ generatedNote.farmInfo.tel }}</p>
                  <p>代表者: {{ generatedNote.farmInfo.representative }}</p>
                </div>
              </div>

              <div class="doc-total-box">
                <span>合計金額</span>
                <span class="val">¥{{ generatedNote.amount.toLocaleString() }}-</span>
                <span class="tax-info">（消費税込）</span>
              </div>

              <table class="doc-items-table">
                <thead>
                  <tr>
                    <th>品名</th>
                    <th>数量</th>
                    <th>単価</th>
                    <th>金額</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, idx) in generatedNote.itemDetails" :key="idx">
                    <td>{{ item.fullName }}</td>
                    <td>{{ item.quantity }}{{ item.unit }}</td>
                    <td>¥{{ Number(item.unitPrice || 0).toLocaleString() }}</td>
                    <td>¥{{ (Number(item.quantity || 0) * Number(item.unitPrice || 0)).toLocaleString() }}</td>
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
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.delivery-quick { padding: 1.5rem; padding-bottom: 100px; }
.page-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
.page-header h2 { font-size: 1.5rem; font-weight: 900; }
.page-header p { font-size: 0.85rem; color: var(--text-soft); }

.icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.harvest-link {
  padding: 1.25rem;
  border-left: 4px solid var(--accent);
  position: relative;
}

.harvest-link.active {
  border-left-color: var(--primary);
  background: hsla(142, 60%, 25%, 0.05);
}

.harvest-link .badge {
  position: absolute;
  top: -10px;
  left: 1rem;
  font-size: 0.65rem;
  font-weight: 800;
  background: var(--accent);
  color: white;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.harvest-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.harvest-info strong { display: block; font-size: 1rem; }
.harvest-info span { font-size: 0.8rem; color: var(--text-soft); }

.btn-reflect {
  width: 100%;
  padding: 0.6rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.reflected-badge {
  text-align: center;
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--primary);
  padding: 0.5rem;
}

.empty-harvest {
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-soft);
  font-size: 0.85rem;
}

.form { padding: 1.5rem; }
.form-group { margin-bottom: 1.5rem; }
.form-group label { display: block; font-size: 0.85rem; font-weight: 800; margin-bottom: 0.5rem; color: var(--text-soft); }

.items-group { margin-bottom: 2rem; }
.group-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.btn-mini-add { background: var(--primary); color: white; font-size: 0.75rem; font-weight: 800; padding: 0.3rem 0.75rem; border-radius: 6px; display: flex; align-items: center; gap: 0.25rem; }

.items-list { display: flex; flex-direction: column; gap: 0.75rem; }
.item-row { 
  position: relative;
  background: white; 
  padding: 1rem; 
  border-radius: 16px; 
  border: 1px solid var(--glass-stroke); 
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.btn-remove-corner {
  position: absolute;
  top: 0;
  right: 0;
  background: #fee2e2;
  color: #ef4444;
  width: 32px;
  height: 32px;
  border-radius: 0 16px 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.item-main { display: flex; flex-direction: column; gap: 1rem; }

/* Stage 1: Organic & Name */
.stack-row-1 { display: flex; gap: 0.5rem; align-items: center; margin-right: 24px; }
.organic-badge-btn {
  background: var(--bg-secondary);
  color: var(--text-muted);
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 900;
}
.organic-badge-btn.active { background: var(--primary); color: white; }
.item-name { 
  flex: 1;
  padding: 0.75rem !important; 
  font-size: 1.1rem !important; 
  font-weight: 800 !important; 
  background: #f8fafc !important; 
  border: 1px solid #e2e8f0 !important;
  border-radius: 12px;
}

/* Stage 2: Inputs */
.stack-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.field-box { display: flex; flex-direction: column; gap: 0.4rem; }
.field-box label { font-size: 0.75rem !important; font-weight: 800; color: var(--text-soft); margin: 0 !important; }
.glass-input {
  width: 100%;
  padding: 0.75rem !important;
  padding-right: 2.2rem !important; /* Space for unit tag */
  font-size: 1.25rem !important;
  font-weight: 800;
  text-align: right;
  background: white !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 10px;
}
.input-unit-wrap { position: relative; }
.unit-tag { 
  position: absolute; 
  right: 0.6rem; 
  top: 50%; 
  transform: translateY(-50%); 
  font-size: 0.75rem; 
  color: var(--primary); 
  font-weight: 900;
  pointer-events: none;
}

/* Stage 3: Subtotal */
.stack-row-3 {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f1f5f9;
}
.stack-row-3 .label { font-size: 0.75rem; font-weight: 800; color: var(--text-soft); }
.stack-row-3 .value { font-size: 1.25rem; font-weight: 900; color: var(--primary); }

.empty-list { text-align: center; padding: 2rem; color: var(--text-soft); font-size: 0.85rem; background: hsla(0,0%,100%,0.2); border-radius: 12px; border: 1px dashed var(--glass-border); }

.total-display {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.25rem;
  padding: 1.5rem;
  background: var(--primary);
  color: white;
  border-radius: 16px;
  box-shadow: 0 10px 20px hsla(var(--primary-hsl), 0.3);
}

.total-display .currency { font-size: 1.25rem; font-weight: 700; }
.total-display .amount { font-size: 2.25rem; font-weight: 900; letter-spacing: -1px; }
.total-display .tax-note { font-size: 0.75rem; opacity: 0.8; font-weight: 700; }

/* PDF Preview Styles */
.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  backdrop-filter: blur(12px);
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.preview-content-card {
  width: 100%;
  max-width: 600px;
  height: 90vh;
  background: #f3f4f6;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.preview-header-actions {
  padding: 1rem 1.5rem;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-wrap { display: flex; align-items: center; gap: 0.5rem; }
.preview-badge { font-size: 0.65rem; background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px; font-weight: 800; color: #6b7280; }

.btn-share-pdf {
  background: var(--primary);
  color: white;
  padding: 0.6rem 1.2rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 12px var(--primary-glow);
}

.btn-close-preview {
  background: #f3f4f6;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

.doc-preview-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.5rem;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: #4b5563;
}

.printable-document {
  width: 800px; /* A4 Ratio Base */
  min-height: 1130px; /* A4 Ratio Height */
  background: white;
  padding: 4rem;
  box-shadow: 0 20px 40px rgba(0,0,0,0.4);
  font-family: 'Hiragino Mincho ProN', 'MS Mincho', serif;
  color: #111;
  transform-origin: top center;
  flex-shrink: 0;
}

/* Auto-scale for Mobile (SCREEN) */
@media (max-width: 600px) {
  .printable-document {
    transform: scale(0.4);
    margin-bottom: -150%;
  }
}

.doc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 3px solid #111;
  padding-bottom: 1.5rem;
  margin-bottom: 3rem;
}

.doc-header h1 { font-size: 3rem; letter-spacing: 0.8rem; font-weight: 400; margin: 0; }
.doc-meta { text-align: right; font-size: 0.9rem; line-height: 1.6; }

.doc-addresses {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4rem;
}

.dest-address h2 { 
  font-size: 1.4rem; 
  border-bottom: 1px solid #111; 
  padding-bottom: 0.5rem; 
  margin-bottom: 0.75rem; 
  display: inline-block; 
  min-width: 300px; 
}
.dest-address p { font-size: 1rem; margin: 0; }

.sender-address { text-align: right; line-height: 1.5; }
.sender-address h3 { font-size: 1.25rem; margin: 0 0 0.5rem 0; }
.sender-address p { font-size: 0.9rem; margin: 0; }

.doc-total-box {
  background: #f9fafb;
  border: 1.5px solid #111;
  padding: 1.5rem;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2rem;
  margin-bottom: 3rem;
}

.doc-total-box .val { font-size: 2.2rem; font-weight: 700; border-bottom: 2px solid #111; }
.doc-total-box .tax-info { font-size: 0.9rem; font-weight: 600; }

.doc-items-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 4rem;
}

.doc-items-table th {
  border-top: 2px solid #333;
  border-bottom: 1px solid #333;
  padding: 0.5rem;
  font-size: 0.9rem;
  text-align: center;
}

.doc-items-table td {
  border-bottom: 1px solid #eee;
  padding: 0.75rem 0.5rem;
  font-size: 0.95rem;
}

.doc-items-table th:nth-child(1) { text-align: left; }
.doc-items-table td:nth-child(2), .doc-items-table td:nth-child(3), .doc-items-table td:nth-child(4) { text-align: right; }

.doc-footer {
  border-top: 1px solid #333;
  padding-top: 1rem;
  font-size: 0.85rem;
}

@media print {
  /* Hide the rest of the component content when printing */
  .page-header, .harvest-link, .form, .btn-primary, .preview-header-actions {
    display: none !important;
  }
}

select, input {
  width: 100%;
  padding: 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-stroke);
  font-size: 1rem;
  background: var(--bg-surface);
  color: var(--text-main);
}

.text-soft { color: var(--text-soft); }
.text-sm { font-size: 0.75rem; }
.w-full { width: 100%; }
.mt-2 { margin-top: 1.5rem; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.animate-pop { animation: pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes pop {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.bg-accent-grad { background: linear-gradient(135deg, var(--accent), #d97706); }

/* Auto-scale for Mobile (SCREEN ONLY) */
@media screen and (max-width: 600px) {
  .printable-document {
    transform: scale(0.42);
    margin-bottom: -150%;
  }
}
</style>

<!-- Global Style for Perfect Printing -->
<style>
@media print {
  /* 1. Page Settings */
  @page {
    margin: 0;
  }

  body {
    visibility: visible !important;
  }

  /* 3. Force the document to the very start of the print job */
  #delivery-note-doc {
    display: block !important;
    position: fixed !important; /* Use fixed to detach from normal flow */
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    height: auto !important;
    margin: 0 !important;
    padding: 1.5cm !important;
    background: white !important;
    box-shadow: none !important;
    border: none !important;
    z-index: 999999 !important; /* On top of everything */
  }

  /* 4. Aggressively hide UI wrappers that might cause extra pages */
  #app, .preview-overlay, .preview-content-card, .delivery-quick {
    background: none !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    height: auto !important;
    min-height: 0 !important;
  }

  /* 5. Clean up table rendering for some browsers */
  .doc-items-table {
    border-collapse: collapse !important;
  }
  
  /* Hide any potential popups or nav bars */
  .mobile-nav, .pc-sidebar, nav, .preview-header-actions, .btn-primary {
    display: none !important;
  }
}
</style>
