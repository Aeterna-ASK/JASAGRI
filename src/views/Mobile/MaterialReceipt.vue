<script setup>
import { ref, computed } from 'vue';
import { 
  Truck, Camera, Save, Plus, ImageIcon, RotateCcw, Trash2, 
  Sparkles, Scan, FileText, CheckCircle2, X, PlusCircle, AlertCircle, RefreshCw
} from 'lucide-vue-next';
import { state, actions } from '../../store';

// --- 通常（写真なし）手動登録用ステート ---
const isManualFormOpen = ref(false); // 手動フォームのアコーディオン
const selectedPartnerId = ref('');
const selectedMaterialId = ref('');
const quantity = ref('');
const certUrl = ref(null);

// --- キュー仕分け登録モーダル用ステート ---
const isSortModalOpen = ref(false);
const activeQueueItem = ref(null);
const sortSupplier = ref('');
const selectedSortPartnerId = ref(''); // 紐付ける仕入先マスタID
const sortDate = ref('');
const sortItems = ref([]); // { materialName, quantity, category, selectedMaterialId }

const partners = computed(() => (state.masters.m_partner || []).filter(p => p.partnerType === '仕入先' || p.category === '仕入先'));
const materials = computed(() => state.masters.m_material || []);
const queue = computed(() => state.records.t_receipt_queue || []);

// カテゴリに応じた資材マスタの動的絞り込み
const filteredMaterials = (category) => {
  if (!category) return materials.value;
  return materials.value.filter(m => {
    const mCat = m.category || '';
    if (category === '肥料・農薬') {
      return mCat.includes('肥料') || mCat.includes('農薬') || mCat.includes('肥料・農薬');
    }
    if (category === '種苗' || category === '苗・種子') {
      return mCat === '種苗' || mCat === '苗・種子';
    }
    return mCat.includes(category) || category.includes(mCat);
  });
};

// 処理中の件数
const processingCount = computed(() => queue.value.filter(q => q.status === 'processing').length);

// --- 手動（写真なし）の保存処理 ---
const handleManualSave = () => {
  const partnerNameVal = partners.value.find(p => p.id === selectedPartnerId.value)?.name || '未指定の仕入先';
  actions.addMaterialReceipt({
    partnerId: selectedPartnerId.value,
    partnerName: partnerNameVal,
    supplier: partnerNameVal,
    materialId: selectedMaterialId.value,
    materialName: materials.value.find(m => m.id === selectedMaterialId.value)?.name || '未指定の資材',
    quantity: quantity.value,
    certUrl: certUrl.value,
    date: new Date().toISOString().split('T')[0],
    isOcrProcessed: false
  });

  // Reset
  selectedPartnerId.value = '';
  selectedMaterialId.value = '';
  quantity.value = '';
  certUrl.value = null;
  isManualFormOpen.value = false;

  actions.showToast('資材受入記録を台帳に登録しました！', 'success');
};

// --- 【神機能】カメラで連続撮影ストック（非同期バックグラウンドOCR） ---
const handleContinuousCapture = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment'; // スマホのカメラを最優先で自動起動
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 1. 即プレビュー用のローカルBlob URLを作成
    const tempUrl = URL.createObjectURL(file);
    
    // 2. 超軽量Base64にクライアントサイド圧縮変換（Firestoreサイズ制限対策＆Geminiへの送信最適化）
    const compressAndEncodeFile = (f) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(f);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800; // OCR文字認識に十分な高解像度
            let width = img.width;
            let height = img.height;
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // 品質0.6（約100KB〜150KB）にJPEG圧縮
            const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
            resolve(base64);
          };
        };
      });
    };

    try {
      const base64Str = await compressAndEncodeFile(file);
      
      // ストックキューに非同期追加（UIは一瞬で解放され、間髪入れずに次の撮影が可能！）
      URL.revokeObjectURL(tempUrl);
      actions.addReceiptToQueue({
        photoUrl: `data:image/jpeg;base64,${base64Str}`,
        base64: base64Str,
        mimeType: 'image/jpeg'
      });
    } catch (error) {
      console.error('Image compression failed:', error);
      actions.showToast('画像の処理に失敗しました。', 'error');
    }
  };
  input.click();
};

// --- 🌟【本格・実稼働機能】スマホで撮影した証明書・納品書をPCの受信トレイ（Inbox）へFirestore経由で直接送信 (v4.1.0) ---
const handleSendToPcInbox = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment'; // モバイルのカメラを自動起動
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    actions.showToast('画像を処理・PC受信トレイへ送信中...', 'info');

    // クライアントサイドでの画像圧縮 (Firestore制限および転送速度最適化)
    const compressAndEncodeFile = (f) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(f);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800; // OCR解析とプレビューに十分な高解像度
            let width = img.width;
            let height = img.height;
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // 0.6の圧縮率でBase64データURLを生成
            const base64DataUrl = canvas.toDataURL('image/jpeg', 0.6);
            resolve(base64DataUrl);
          };
        };
      });
    };

    try {
      const base64Str = await compressAndEncodeFile(file);
      const fileNameLower = file.name ? file.name.toLowerCase() : '';
      const isCert = fileNameLower.includes('cert') || fileNameLower.includes('証明') || fileNameLower.includes('jas');

      // PCのスキャン受信トレイ（t_inbox_documents）に直接追加してクラウド（Firestore）にリアルタイム同期！
      actions.addInboxDocument({
        fileName: file.name || `mobile_scan_${Date.now().toString().slice(-6)}.jpg`,
        fileUrl: base64Str, // 本物の画像データ
        suggestedType: isCert ? 'マスタ証明書' : '納品書',
        parsedData: {
          date: new Date().toISOString().split('T')[0],
          materialName: '',
          category: isCert ? '肥料' : '資材',
          partnerName: '',
          quantity: '1'
        }
      });
    } catch (error) {
      console.error('Failed to send file to PC inbox:', error);
      actions.showToast('PC受信トレイへの転送に失敗しました。', 'error');
    }
  };
  input.click();
};

// --- キュー仕分けモーダルの開閉 ---
const openSortModal = (item) => {
  if (item.status === 'processing') {
    actions.showToast('現在、Gemini 2.5 Flashが納品書を解析中です。少々お待ちください...', 'info');
    return;
  }

  activeQueueItem.value = item;
  sortSupplier.value = item.supplier || '';
  sortDate.value = item.date || new Date().toISOString().split('T')[0];
  
  // AIが検出した仕入先名から取引先マスタを自動照合してバインド
  const supplierName = sortSupplier.value.trim();
  const matchedPartner = partners.value.find(p => 
    p.name.includes(supplierName) || 
    supplierName.includes(p.name) ||
    p.name.replace(/合資会社|株式会社|有限会社/g, '').trim().includes(supplierName.replace(/合資会社|株式会社|有限会社/g, '').trim())
  );
  selectedSortPartnerId.value = matchedPartner ? matchedPartner.id : '';

  // AIが抽出した各品目について、マスタから最も部分一致する資材を自動紐付け初期化
  sortItems.value = (item.items || []).map(it => {
    let matchedId = '';
    if (it.materialName) {
      const found = materials.value.find(m => 
        m.name.includes(it.materialName) || it.materialName.includes(m.name)
      );
      if (found) matchedId = found.id;
    }
    return {
      materialName: it.materialName || '',
      quantity: it.quantity || '',
      category: it.category || '肥料・農薬',
      selectedMaterialId: matchedId
    };
  });

  if (sortItems.value.length === 0) {
    sortItems.value.push({ materialName: '', quantity: '', category: '肥料・農薬', selectedMaterialId: '' });
  }

  isSortModalOpen.value = true;
};

const closeSortModal = () => {
  isSortModalOpen.value = false;
  activeQueueItem.value = null;
  selectedSortPartnerId.value = '';
};

// 行操作
const addSortItem = () => {
  sortItems.value.push({ materialName: '', quantity: '', category: '肥料・農薬', selectedMaterialId: '' });
};

const removeSortItem = (index) => {
  sortItems.value.splice(index, 1);
};

// --- 【神機能】ストックから複数商品を一括台帳登録 ---
const handleRegisterFromQueue = () => {
  if (!activeQueueItem.value) return;

  let partnerIdVal = selectedSortPartnerId.value;
  let supplierName = '';

  if (partnerIdVal) {
    // 既存マスタから名前を取得
    supplierName = partners.value.find(p => p.id === partnerIdVal)?.name || '未指定の仕入先';
  } else {
    // マスタ未登録の場合、AI検出（または手動調整）の名前で新規マスタ自動作成（おもてなし）
    supplierName = sortSupplier.value.trim() || '未指定の仕入先';
    const newPartner = actions.addMasterItem('m_partner', {
      name: supplierName,
      partnerType: '仕入先',
      category: '仕入先'
    });
    partnerIdVal = newPartner?.id || '';
  }

  // 抽出・編集された複数資材アイテムを1つずつ addMaterialReceipt で台帳登録
  sortItems.value.forEach(it => {
    let matId = it.selectedMaterialId;
    let matName = '';

    if (matId) {
      matName = materials.value.find(m => m.id === matId)?.name || '指定の資材';
    } else {
      // マスタに紐付いていない場合、臨時の資材マスタを自動作成して紐付ける（おもてなし）
      matName = it.materialName || '未指定の自動検出資材';
      const newMat = actions.addMasterItem('m_material', {
        name: matName,
        category: it.category,
        unit: '袋'
      });
      matId = newMat?.id || '';
    }

    actions.addMaterialReceipt({
      partnerId: partnerIdVal,
      partnerName: supplierName,
      supplier: supplierName,
      materialId: matId,
      materialName: matName,
      quantity: it.quantity || '1',
      certUrl: activeQueueItem.value.photoUrl,
      date: sortDate.value,
      isOcrProcessed: true
    });
  });

  // キューからこのストックアイテムを削除
  actions.deleteReceiptFromQueue(activeQueueItem.value.id);
  
  closeSortModal();
  actions.showToast('納品書の複数商品を一括で台帳に登録しました！', 'success');
};

const handleDiscardFromQueue = () => {
  if (!activeQueueItem.value) return;
  if (confirm('この納品書ストックを削除しますか？\n（資材受入台帳には登録されません）')) {
    actions.deleteReceiptFromQueue(activeQueueItem.value.id);
    closeSortModal();
    actions.showToast('納品書ストックを破棄しました', 'info');
  }
};
</script>

<template>
  <div class="receipt-record animate-slide-up">
    <!-- Header -->
    <div class="page-header">
      <div class="icon-wrap bg-primary-grad">
        <Truck size="24" />
      </div>
      <div>
        <h2>資材受入・納品書ストック</h2>
        <p>連続撮影 ➔ AI一括解析 ➔ あとで確認仕分け登録</p>
      </div>
    </div>

    <!-- Active Stream Queue Info -->
    <div v-if="processingCount > 0" class="ocr-global-badge animate-pulse">
      <RefreshCw size="14" class="spin-icon" />
      <span>AIが {{ processingCount }} 件の納品書をバックグラウンドで解析中...</span>
    </div>

    <!-- 1. 連続撮影ストッカー大ボタン (連続撮影＆ノンブロッキング) -->
    <div class="capture-trigger-section">
      <button @click="handleContinuousCapture" class="btn-heavy-capture glass-panel shadow-lg">
        <div class="shining-circle-icon">
          <Camera size="32" />
        </div>
        <span class="main-title">納品書を連続撮影・保存</span>
        <span class="sub-desc">AIがバックグラウンドで同時並行解析します</span>
      </button>
    </div>

    <!-- 🌟【本格実稼働機能：PC受信トレイへの直接転送 (v4.1.0)】 -->
    <div class="capture-trigger-section">
      <button @click="handleSendToPcInbox" class="btn-heavy-capture btn-pc-inbox glass-panel shadow-lg">
        <div class="shining-circle-icon bg-blue-icon">
          <Scan size="32" />
        </div>
        <span class="main-title text-blue">📷 撮影してPCの受信トレイへ直接送信</span>
        <span class="sub-desc">PCの大画面で適合証明書や納品書として詳しく登録・仕分けできます</span>
      </button>
    </div>

    <!-- 2. 【未処理ストック】要確認・仕分け待ちセクション -->
    <div class="section-title-wrap">
      <h3>確認待ちの納品書ストック ({{ queue.length }}件)</h3>
      <span class="info-help">タップすると中身を確認して台帳登録できます</span>
    </div>

    <div v-if="queue.length === 0" class="empty-queue-card glass-panel text-center">
      <ImageIcon size="32" class="text-soft mb-1" />
      <p>ストックされている納品書はありません</p>
      <span class="sub">上のボタンから納品書をパシャパシャ撮影してストックしてください</span>
    </div>

    <!-- 横スクロール納品書ストックリスト -->
    <div v-else class="queue-scroll-container">
      <div 
        v-for="item in queue" 
        :key="item.id" 
        @click="openSortModal(item)"
        class="queue-card glass-panel shadow-md animate-pop"
        :class="{ 'border-processing': item.status === 'processing', 'border-ready': item.status === 'ready' }"
      >
        <div class="queue-img-wrap">
          <img :src="item.photoUrl" alt="Receipt" />
          <div class="queue-badge" :class="item.status">
            <span v-if="item.status === 'processing'">
              <RefreshCw size="10" class="spin-icon" /> 解析中
            </span>
            <span v-else-if="item.status === 'ready'">
              <Sparkles size="10" /> 解析完了 ({{ item.items?.length || 0 }})
            </span>
            <span v-else>
              <AlertCircle size="10" /> 解析失敗
            </span>
          </div>
        </div>
        <div class="queue-info">
          <p class="supplier-name truncate">{{ item.supplier }}</p>
          <span class="date-str">{{ item.date }}</span>
        </div>
      </div>
    </div>

    <!-- 3. 【手動登録】写真がない場合の手動アコーディオン -->
    <div class="manual-accordion-wrap mt-2">
      <button @click="isManualFormOpen = !isManualFormOpen" class="accordion-header glass-panel">
        <Plus size="16" />
        <span>写真を撮らずに手動で資材受入を登録する</span>
      </button>

      <div v-if="isManualFormOpen" class="form card glass-panel shadow-lg mt-1 animate-slide-down">
        <div class="form-group">
          <label>仕入先（取引先マスタ）</label>
          <div class="select-wrap">
            <select v-model="selectedPartnerId" class="glass">
              <option value="">仕入先を選択してください</option>
              <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>受入資材</label>
          <div class="select-wrap">
            <select v-model="selectedMaterialId" class="glass">
              <option value="">資材を選択してください</option>
              <option v-for="m in materials" :key="m.id" :value="m.id">[{{ m.category }}] {{ m.name }}</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>数量・単位</label>
          <input v-model="quantity" type="text" placeholder="例：20kg, 10箱" class="glass" />
        </div>

        <button 
          @click="handleManualSave" 
          :disabled="!selectedPartnerId || !selectedMaterialId || !quantity" 
          class="btn-primary w-full shadow-lg mt-1"
        >
          <Save size="16" /> 受入台帳に手動登録
        </button>
      </div>
    </div>

    <!-- 4. 【仕分け登録モーダル】キューアイテムの確認モーダル -->
    <div v-if="isSortModalOpen" class="sort-modal-overlay">
      <div class="sort-modal-content glass-panel animate-pop shadow-2xl">
        <div class="sort-modal-header">
          <div class="title-with-icon">
            <Sparkles size="18" class="text-primary animate-pulse" />
            <h4>納品書の中身を確認・仕分け登録</h4>
          </div>
          <button @click="closeSortModal" class="btn-close-modal">
            <X size="20" />
          </button>
        </div>

        <div class="sort-modal-body">
          <!-- Left: Document Image -->
          <div class="sort-modal-left">
            <div class="sort-image-wrap">
              <img :src="activeQueueItem?.photoUrl" alt="Receipt Evidence" />
            </div>
          </div>

          <!-- Right: AI parsed Items Forms -->
          <div class="sort-modal-right">
            <!-- Header Meta -->
            <div class="supplier-split-fields">
              <div class="form-group">
                <label>仕入先 (取引先マスタ選択)</label>
                <div class="select-wrap">
                  <select v-model="selectedSortPartnerId" class="glass highlight-select">
                    <option value="">マスタ未登録 (「{{ sortSupplier || '未指定' }}」で新規マスタ自動登録)</option>
                    <option v-for="p in partners" :key="p.id" :value="p.id">
                      {{ p.name }}
                    </option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label>AI検出名の微調整 (マスタ未登録時に新規登録されます)</label>
                <input v-model="sortSupplier" type="text" class="glass font-bold" placeholder="仕入先名" />
              </div>
            </div>

            <div class="form-group">
              <label>受入日</label>
              <input v-model="sortDate" type="date" class="glass" />
            </div>

            <!-- Items Table list -->
            <div class="items-table-section">
              <div class="items-header-wrap">
                <label>検出された購入資材商品 (複数登録対応)</label>
                <button @click="addSortItem" class="btn-add-row">
                  <PlusCircle size="14" /> 追加
                </button>
              </div>

              <div class="items-list">
                <div 
                  v-for="(it, index) in sortItems" 
                  :key="index" 
                  class="item-row glass-panel shadow-sm"
                >
                  <div class="row-top">
                    <span class="row-index">#{{ index + 1 }}</span>
                    <button @click="removeSortItem(index)" class="btn-remove-row text-danger">
                      <Trash2 size="14" /> 削除
                    </button>
                  </div>

                  <div class="row-full-field">
                    <span class="field-lbl">納品書上の資材名 (AI検出)</span>
                    <input v-model="it.materialName" type="text" class="glass" placeholder="商品名" />
                  </div>

                  <div class="row-divider"></div>

                  <div class="row-triple-fields">
                    <div class="row-field flex-qty">
                      <span class="field-lbl">数量</span>
                      <input v-model="it.quantity" type="text" class="glass" placeholder="例：20袋" />
                    </div>

                    <div class="row-field flex-cat">
                      <span class="field-lbl">カテゴリ</span>
                      <div class="select-wrap">
                        <select v-model="it.category" class="glass">
                          <option value="肥料・農薬">肥料・農薬 (JAS)</option>
                          <option value="苗・種子">種苗・苗（苗・種子）</option>
                          <option value="機材">機材 (農機具)</option>
                          <option value="資材">資材</option>
                          <option value="その他">その他</option>
                        </select>
                      </div>
                    </div>

                    <div class="row-field flex-master">
                      <span class="field-lbl">🌱 適合資材マスタを選択</span>
                      <div class="select-wrap">
                        <select v-model="it.selectedMaterialId" class="glass highlight-select">
                          <option value="">マスタ未登録 (新規自動追加)</option>
                          <option v-for="m in filteredMaterials(it.category)" :key="m.id" :value="m.id">
                            [{{ m.category }}] {{ m.name }}
                          </option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="sort-modal-footer">
          <button @click="handleDiscardFromQueue" class="btn-discard">
            <Trash2 size="16" /> 破棄
          </button>
          <button @click="handleRegisterFromQueue" class="btn-submit-sort">
            <CheckCircle2 size="16" /> {{ sortItems.length }}件の資材受入を一括登録
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.receipt-record { padding: 1.5rem; padding-bottom: 120px; position: relative; }
.page-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
.page-header h2 { font-size: 1.4rem; font-weight: 900; margin: 0; }
.page-header p { font-size: 0.8rem; color: var(--text-soft); margin: 0; }

.icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}
.bg-primary-grad { background: linear-gradient(135deg, #10b981, #059669); }
.bg-blue-grad { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.bg-gray-grad { background: linear-gradient(135deg, #6b7280, #4b5563); }

/* --- 連続撮影・重厚ストッカーボタン --- */
.capture-trigger-section {
  margin-bottom: 1.5rem;
}
.btn-heavy-capture {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2.2rem 1.5rem;
  text-align: center;
  border-radius: var(--radius-lg);
  border: 1px dashed var(--primary);
  background: hsla(var(--primary-hsl), 0.05);
  box-shadow: 0 8px 32px rgba(16, 185, 129, 0.08);
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  cursor: pointer;
}
.btn-heavy-capture:active {
  transform: scale(0.96);
  background: hsla(var(--primary-hsl), 0.1);
}
.shining-circle-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: 0.75rem;
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
  position: relative;
}
.shining-circle-icon::after {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 2px solid #10b981;
  opacity: 0.4;
  animation: pulse-ring 2s infinite;
}
@keyframes pulse-ring {
  0% { transform: scale(0.95); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 0.2; }
  100% { transform: scale(0.95); opacity: 0.5; }
}
.btn-heavy-capture .main-title {
  font-size: 1.1rem;
  font-weight: 900;
  color: var(--text-main);
  margin-bottom: 0.25rem;
}
.btn-heavy-capture .sub-desc {
  font-size: 0.75rem;
  color: var(--text-soft);
}

.ocr-global-badge {
  background: hsla(var(--primary-hsl), 0.15);
  border: 1px solid var(--primary);
  color: var(--primary);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  font-weight: 800;
  margin-bottom: 1.2rem;
}
.spin-icon {
  animation: spin 1.5s linear infinite;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* --- 横スクロールストックキュー --- */
.section-title-wrap {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.75rem;
}
.section-title-wrap h3 {
  font-size: 1rem;
  font-weight: 900;
  margin: 0;
  color: var(--text-main);
}
.section-title-wrap .info-help {
  font-size: 0.7rem;
  color: var(--text-soft);
}
.empty-queue-card {
  padding: 2.5rem 1.5rem;
  text-align: center;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-stroke);
  background: hsla(0, 0%, 100%, 0.02);
}
.empty-queue-card p {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--text-soft);
  margin: 0;
}
.empty-queue-card .sub {
  font-size: 0.7rem;
  color: var(--text-muted);
  display: block;
  margin-top: 0.25rem;
  line-height: 1.3;
}

.queue-scroll-container {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  padding: 0.5rem 0.25rem;
  margin-bottom: 1.5rem;
  scroll-snap-type: x mandatory;
}
.queue-scroll-container::-webkit-scrollbar {
  height: 4px;
}
.queue-scroll-container::-webkit-scrollbar-thumb {
  background: var(--glass-stroke);
  border-radius: 4px;
}
.queue-card {
  flex: 0 0 140px;
  scroll-snap-align: start;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--glass-stroke);
  transition: all 0.3s ease;
  cursor: pointer;
}
.queue-card:active {
  transform: scale(0.95);
}
.border-processing {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}
.border-ready {
  border-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}
.queue-img-wrap {
  height: 110px;
  position: relative;
  background: #000;
}
.queue-img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.85;
}
.queue-badge {
  position: absolute;
  bottom: 6px;
  left: 6px;
  right: 6px;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 800;
  text-align: center;
  color: white;
  backdrop-filter: blur(4px);
}
.queue-badge.processing { background: rgba(37, 99, 235, 0.9); }
.queue-badge.ready { background: rgba(5, 150, 105, 0.9); }
.queue-badge.error { background: rgba(220, 38, 38, 0.9); }

.queue-info {
  padding: 0.5rem;
  background: var(--bg-surface-glass);
}
.queue-info .supplier-name {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
}
.queue-info .date-str {
  font-size: 0.6rem;
  color: var(--text-soft);
  display: block;
}

/* --- 手動登録アコーディオン --- */
.accordion-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-stroke);
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--text-soft);
  background: hsla(0, 0%, 100%, 0.01);
  cursor: pointer;
}
.form {
  padding: 1.25rem;
  border-radius: var(--radius-md);
}
.form-group { margin-bottom: 1rem; }
.form-group label { display: block; font-size: 0.8rem; font-weight: 800; margin-bottom: 0.4rem; color: var(--text-soft); }

select, input {
  width: 100%;
  padding: 0.85rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-stroke);
  font-size: 0.9rem;
  background: var(--bg-surface);
  color: var(--text-main);
  transition: all 0.3s ease;
}

/* --- 【極上仕分けモーダル】 --- */
.sort-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.96); /* 濃い紺色・高不透明で下の画面を完璧にシャットアウト */
  backdrop-filter: blur(12px);
  z-index: 9999; /* 最前面へ */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}
.sort-modal-content {
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: #111827 !important; /* 完全に不透明なリッチな超ダークグレー */
  color: #f3f4f6 !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
}
.sort-modal-header {
  padding: 1.2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1f2937 !important;
}
.title-with-icon {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #10b981;
}
.title-with-icon h4 {
  font-size: 1.1rem;
  font-weight: 900;
  margin: 0;
  color: #ffffff !important;
}
.btn-close-modal {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #ffffff;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-close-modal:hover {
  background: rgba(255, 255, 255, 0.2);
}

.sort-modal-body {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: 1.1fr 1.3fr;
  gap: 1.5rem;
  padding: 1.5rem;
  background: #111827 !important;
}

/* Left side picture */
.sort-modal-left {
  display: flex;
  flex-direction: column;
}
.sort-image-wrap {
  position: sticky;
  top: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  max-height: 380px;
  background: #000;
}
.sort-image-wrap img {
  width: 100%;
  height: auto;
  max-height: 380px;
  object-fit: contain;
  display: block;
}

/* Right side Forms list */
.sort-modal-right {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* モーダル内インプットの視認性向上 */
.sort-modal-right input,
.sort-modal-right select {
  background: #1f2937 !important;
  color: #ffffff !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  padding: 0.8rem;
  font-weight: 700;
}
.sort-modal-right input:focus,
.sort-modal-right select:focus {
  border-color: #10b981 !important;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.3) !important;
}

.items-table-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  padding: 1rem;
  margin-top: 0.5rem;
}
.items-header-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.items-header-wrap label {
  font-size: 0.85rem;
  font-weight: 900;
  color: #ffffff !important;
  margin: 0;
}
.btn-add-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border: 1px solid #10b981;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-add-row:hover {
  background: rgba(16, 185, 129, 0.3);
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 0.25rem;
}
.item-row {
  padding: 0.75rem;
  background: #1f2937 !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}
.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 0.25rem;
}
.row-index {
  font-size: 0.75rem;
  font-weight: 900;
  color: #10b981;
}
.btn-remove-row {
  background: none;
  border: none;
  display: flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.7rem;
  font-weight: 800;
  cursor: pointer;
  color: #ef4444;
}
.text-danger { color: #ef4444; }

.row-full-field {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.row-full-field input {
  width: 100%;
  padding: 0.75rem !important;
  font-size: 0.9rem !important;
  font-weight: 800;
  background: #111827 !important;
  color: #ffffff !important;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
}

.row-divider {
  border-bottom: 1px dashed rgba(255, 255, 255, 0.15);
  margin: 0.75rem 0;
}

.row-triple-fields {
  display: grid;
  grid-template-columns: 1fr 1.1fr 1.9fr; /* 数量、カテゴリ、適合マスタの極美レスポンシブ比率 */
  gap: 0.5rem;
}

.row-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.field-lbl {
  font-size: 0.65rem;
  color: #9ca3af;
  font-weight: 800;
}
.row-field input, .row-field select {
  padding: 0.6rem !important;
  font-size: 0.8rem !important;
  border-radius: 6px;
  background: #111827 !important; /* 行内入力欄は少し暗めにして階層をつける */
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  color: #ffffff !important;
}
.highlight-select {
  border-color: rgba(16, 185, 129, 0.4) !important;
}
.mt-05 { margin-top: 0.5rem; }

/* Modal Footer */
.sort-modal-footer {
  padding: 1.2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: #1f2937 !important;
}
.btn-discard {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid #ef4444;
  padding: 0.75rem 1.2rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-discard:hover {
  background: rgba(239, 68, 68, 0.25);
}
.btn-submit-sort {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  border: none;
  padding: 0.85rem;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-weight: 900;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
  cursor: pointer;
  transition: all 0.2s;
}
.btn-submit-sort:hover {
  filter: brightness(1.1);
}

.supplier-split-fields {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 1rem;
}

/* Responsive Grid for mobile */
@media (max-width: 768px) {
  .sort-modal-overlay {
    padding: 0 !important; /* モバイルでは余白をなくす */
  }
  .sort-modal-content {
    max-height: 100vh !important;
    height: 100vh !important;
    border-radius: 0 !important; /* 全画面表示 */
    border: none !important;
  }
  .sort-modal-body {
    grid-template-columns: 1fr !important;
    gap: 1rem !important;
    padding: 1rem !important;
    overflow-y: auto !important;
  }
  .sort-image-wrap {
    max-height: 200px !important;
    position: relative !important;
  }
  .sort-image-wrap img {
    max-height: 200px !important;
  }
  .items-list {
    max-height: none !important; /* スクロール二重化を避けるためモバイルは展開 */
    overflow-y: visible !important;
  }
  .supplier-split-fields {
    grid-template-columns: 1fr !important;
    gap: 0.75rem !important;
  }
}

/* 🌟【PC受信トレイ転送用追加プレミアムスタイル (v4.1.0)】 */
.bg-blue-icon {
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4) !important;
}
.bg-blue-icon::after {
  border-color: #3b82f6 !important;
}
.text-blue {
  color: #3b82f6 !important;
}
.btn-pc-inbox {
  border-color: #3b82f6 !important;
  background: hsla(217, 91%, 60%, 0.05) !important;
  box-shadow: 0 8px 32px rgba(59, 130, 246, 0.08) !important;
  margin-top: 1rem;
}
</style>
