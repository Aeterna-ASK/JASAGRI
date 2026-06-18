<script setup>
import { ref, computed } from 'vue';
import { 
  Plus, 
  Trash2, 
  ChevronRight, 
  Package, 
  Wrench, 
  Sprout,
  Save,
  X,
  User,
  Leaf,
  Cloud,
  DownloadCloud,
  UploadCloud,
  AlertTriangle,
  ShieldCheck,
  Activity
} from 'lucide-vue-next';
import { state, actions } from '../../store';

const activeMaster = ref('m_material'); // 'm_material', 'm_equipment', 'm_work_type'
const isAdding = ref(false);

const handleForceUpload = async () => {
  if (confirm('現在の端末にあるデータをクラウドに強制保存しますか？')) {
    await actions.syncToCloud();
  }
};

const handleForceDownload = async () => {
  if (confirm('クラウド上のデータでこの端末のデータを上書きしますか？（現在の未保存データは消えます）')) {
    await actions.initSync();
  }
};

const handleInitPestDB = async () => {
  // 確認ダイアログは importProfessionalPestDB 内で表示される（二重確認を回避）
  await actions.importProfessionalPestDB();
};

const newItem = ref({
  name: '',
  crop: '',
  variety: '',
  category: '資材', // for m_material
  washRequired: false // for m_equipment
});

const mastersConfig = {
  m_material: { label: '肥料・農薬', icon: Package },
  m_seed: { label: '種子・苗', icon: Leaf },
  m_equipment: { label: '使用機材', icon: Wrench },
  m_work_type: { label: '作業項目', icon: Sprout }
};

const SEED_CATEGORIES = ['種苗', '苗・種子'];

const filteredItems = computed(() => {
  if (activeMaster.value === 'm_material') {
    return state.masters.m_material.filter(i => !SEED_CATEGORIES.includes(i.category));
  }
  if (activeMaster.value === 'm_seed') {
    return state.masters.m_material.filter(i => SEED_CATEGORIES.includes(i.category));
  }
  return state.masters[activeMaster.value] || [];
});

const handleAdd = () => {
  let payloadName = newItem.value.name;

  if (activeMaster.value === 'm_seed') {
    payloadName = newItem.value.variety 
      ? `${newItem.value.crop}（${newItem.value.variety}）`
      : newItem.value.crop;
  }

  const payload = { name: payloadName };
  
  if (activeMaster.value === 'm_material') {
    payload.category = newItem.value.category;
  } else if (activeMaster.value === 'm_seed') {
    payload.category = '苗・種子';
  } else if (activeMaster.value === 'm_equipment') {
    payload.washRequired = newItem.value.washRequired;
  }

  const targetMaster = (activeMaster.value === 'm_seed') ? 'm_material' : activeMaster.value;
  actions.addMasterItem(targetMaster, payload);
  
  isAdding.value = false;
  newItem.value = { 
    name: '', 
    crop: '', 
    variety: '', 
    category: '資材', 
    washRequired: false 
  };
};

const deleteItem = (type, id) => {
  const targetMaster = (type === 'm_seed') ? 'm_material' : type;
  actions.deleteMasterItem(targetMaster, id);
};
</script>

<template>
  <div class="mobile-settings animate-slide-up">
    <div class="settings-header">
      <h2>各種設定</h2>
      <p>プロフィールや現場マスタの管理を行います</p>
    </div>

    <!-- Profile Setting -->
    <div class="profile-section card glass mb-2">
      <div class="section-label">
        <User size="18" />
        <span>ユーザー設定</span>
      </div>
      <div class="input-group mt-1">
        <label>表示名（ホーム画面の挨拶に使用）</label>
        <input 
          :value="state.user.name" 
          @input="e => actions.updateUser({ name: e.target.value })"
          type="text" 
          placeholder="例：田中 大輔" 
          class="modern-input" 
        />
      </div>
    </div>

    <!-- Farm Information Setting -->
    <div class="profile-section card glass mb-2">
      <div class="section-label">
        <Leaf size="18" />
        <span>農園情報設定</span>
      </div>
      <div class="form-grid mt-1">
        <div class="input-group">
          <label>農園名 / 組織名</label>
          <input 
            :value="state.farmInfo.name" 
            @input="e => actions.updateFarmInfo({ name: e.target.value })"
            type="text" 
            placeholder="例：霧島オーガニックファーム" 
            class="modern-input" 
          />
        </div>
        <div class="input-group">
          <label>代表者名</label>
          <input 
            :value="state.farmInfo.representative" 
            @input="e => actions.updateFarmInfo({ representative: e.target.value })"
            type="text" 
            placeholder="例：田中 大輔" 
            class="modern-input" 
          />
        </div>
        <div class="input-group">
          <label>郵便番号</label>
          <input 
            :value="state.farmInfo.postalCode" 
            @input="e => actions.updateFarmInfo({ postalCode: e.target.value })"
            type="text" 
            placeholder="899-xxxx" 
            class="modern-input" 
          />
        </div>
        <div class="input-group">
          <label>住所</label>
          <input 
            :value="state.farmInfo.address" 
            @input="e => actions.updateFarmInfo({ address: e.target.value })"
            type="text" 
            placeholder="鹿児島県霧島市..." 
            class="modern-input" 
          />
        </div>
        <div class="input-group">
          <label>電話番号</label>
          <input 
            :value="state.farmInfo.tel" 
            @input="e => actions.updateFarmInfo({ tel: e.target.value })"
            type="tel" 
            placeholder="090-xxxx-xxxx" 
            class="modern-input" 
          />
        </div>
      </div>
    </div>

    <!-- Cloud Sync Setting -->
    <div class="profile-section card glass mb-2 accent-blue">
      <div class="section-label text-blue">
        <Cloud size="18" />
        <span>クラウド同期設定</span>
      </div>
      <div class="sync-info mt-1">
        <div class="status-row">
          <span class="dot" :class="{ green: state.isCloudConnected }"></span>
          <span>ステータス: {{ state.isCloudConnected ? '同期準備完了' : '接続待ち...' }}</span>
        </div>
        <p class="desc-text">他端末とのデータ共有がうまくいかない場合は、以下のボタンをお試しください。</p>
      </div>
      <div class="sync-actions mt-1">
        <button @click="handleForceUpload" class="btn-sync upload mb-1">
          <UploadCloud size="18" />
          <span>この端末のデータをクラウドに保存</span>
        </button>
        <button @click="handleForceDownload" class="btn-sync download">
          <DownloadCloud size="18" />
          <span>クラウドのデータをこの端末に読込</span>
        </button>
      </div>
    </div>

    <!-- Professional DB Setting -->
    <div class="profile-section card glass mb-2 accent-gold">
      <div class="section-label text-gold">
        <ShieldCheck size="18" />
        <span>専門データベース設定</span>
      </div>
      <div class="sync-info mt-1">
        <p class="desc-text">有機JAS規格に準拠した最新の防除データベース（作物×病害虫×適合資材）を構築します。</p>
      </div>
      <div class="sync-actions mt-1">
        <button @click="handleInitPestDB" class="btn-sync gold">
          <Activity size="18" />
          <span>専門防除データベースを初期化</span>
        </button>
      </div>
    </div>

    <div class="settings-divider mb-2"></div>

    <div class="settings-header">
      <h2>現場マスタ設定</h2>
      <p>現場で使用する資材や機材をアプリに登録します</p>
    </div>

    <!-- Master Tabs -->
    <div class="master-selector glass">
      <button 
        v-for="(config, key) in mastersConfig" 
        :key="key"
        @click="activeMaster = key"
        :class="{ active: activeMaster === key }"
      >
        <component :is="config.icon" size="18" />
        <span>{{ config.label }}</span>
      </button>
    </div>

    <!-- List View -->
    <div class="master-list">
      <div v-for="item in filteredItems" :key="item.id" class="list-item card glass">
        <div class="item-main">
          <div class="item-info">
            <span v-if="activeMaster === 'm_material'" class="badge-type">{{ item.category }}</span>
            <span class="item-name">{{ item.name }}</span>
          </div>
          <span v-if="item.washRequired" class="badge-mini">洗浄必須</span>
        </div>
        <button @click="deleteItem(activeMaster, item.id)" class="btn-delete">
          <Trash2 size="16" />
        </button>
      </div>

      <button @click="isAdding = true" class="btn-primary btn-mobile-action mt-2">
        <Plus />
        新しい{{ mastersConfig[activeMaster].label }}を追加
      </button>
    </div>

    <!-- Add Modal (Full Screen for Mobile) -->
    <div v-if="isAdding" class="mobile-modal-overlay glass animate-slide-up">
      <div class="mobile-modal">
        <div class="modal-header">
          <h3>{{ mastersConfig[activeMaster].label }}の新規登録</h3>
          <button @click="isAdding = false" class="btn-icon-clear"><X /></button>
        </div>
        
        <div class="form-body">
          <!-- Seed specific fields -->
          <template v-if="activeMaster === 'm_seed'">
            <div class="input-group">
              <label>作物名</label>
              <input v-model="newItem.crop" type="text" placeholder="例：トマト, ぶどう..." class="modern-input" />
            </div>
            <div class="input-group">
              <label>品種</label>
              <input v-model="newItem.variety" type="text" placeholder="例：桃太郎, シャインマスカット..." class="modern-input" />
            </div>
          </template>

          <!-- Standard name field -->
          <div v-else class="input-group">
            <label>名称</label>
            <input v-model="newItem.name" type="text" placeholder="例：菜種油粕, 播種..." class="modern-input" />
          </div>

          <div v-if="activeMaster === 'm_material'" class="input-group">
            <label>区分</label>
            <select v-model="newItem.category" class="modern-input">
              <option value="肥料">肥料</option>
              <option value="農薬">農薬</option>
              <option value="苗・種子">苗・種子</option>
              <option value="飼料">飼料</option>
              <option value="機材">機材</option>
              <option value="資材">資材</option>
              <option value="その他">その他</option>
            </select>
          </div>

          <div v-if="activeMaster === 'm_equipment'" class="checkbox-group card glass">
            <input v-model="newItem.washRequired" type="checkbox" id="m-wash" />
            <label for="m-wash">使用前に洗浄記録を必須にする</label>
          </div>

          <div class="modal-actions">
            <button 
              @click="handleAdd" 
              :disabled="activeMaster === 'm_seed' ? !newItem.crop : !newItem.name" 
              class="btn-primary btn-mobile-action"
            >
              <Save />
              この内容で登録する
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-settings {
  padding-bottom: 100px;
}

.settings-header {
  margin-bottom: 1.5rem;
}

.settings-header h2 { font-size: 1.5rem; font-weight: 800; }
.settings-header p { font-size: 0.85rem; color: var(--text-soft); }

.profile-section {
  padding: 1.5rem;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 800;
  color: var(--primary);
  margin-bottom: 0.5rem;
}

.settings-divider {
  height: 1px;
  background: var(--glass-border);
  opacity: 0.5;
}

.master-selector {
  display: flex;
  padding: 0.25rem;
  margin-bottom: 2rem;
  gap: 0.25rem;
}

.master-selector button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.75rem 0.25rem;
  background: transparent;
  color: var(--text-soft);
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: var(--radius-sm);
}

.master-selector button.active {
  background: var(--bg-primary);
  color: var(--primary);
  box-shadow: var(--glass-shadow);
}

.master-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.item-name { font-weight: 700; font-size: 1rem; }

.badge-type {
  font-size: 0.65rem;
  font-weight: 800;
  color: var(--primary);
  background: hsla(142, 60%, 25%, 0.1);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  width: fit-content;
}

.badge-mini {
  font-size: 0.65rem;
  background: hsla(42, 95%, 48%, 0.1);
  color: var(--accent);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.btn-delete {
  color: #ef4444;
  background: transparent;
  padding: 0.5rem;
}

.modern-input {
  width: 100%;
  padding: 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-stroke);
  background: var(--bg-surface);
  font-size: 1rem;
  color: var(--text-main);
}

select.modern-input {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 1rem center;
}

.mt-2 { margin-top: 2rem; }

/* Mobile Modal */
.mobile-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: var(--bg-primary);
  padding: 1.5rem;
  overflow-y: auto; /* スクロール可能にする */
  -webkit-overflow-scrolling: touch;
}

.mobile-modal {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding-bottom: 4rem; /* モーダル内下部の余白 */
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.input-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--text-soft);
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
}

.checkbox-group input { width: 20px; height: 20px; }
.checkbox-group label { font-size: 0.9rem; font-weight: 600; }

.modal-actions {
  margin-top: 2rem;
}

.btn-icon-clear {
  background: transparent;
  padding: 0.5rem;
  color: var(--text-soft);
}

/* Sync Controls */
.accent-blue {
  border-left: 4px solid #3b82f6 !important;
}

.text-blue {
  color: #3b82f6 !important;
}

.desc-text {
  font-size: 0.75rem;
  color: var(--text-soft);
  margin-top: 0.25rem;
  line-height: 1.4;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 700;
}

.dot {
  width: 8px;
  height: 8px;
  background: #94a3b8;
  border-radius: 50%;
}

.dot.green {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.btn-sync {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.8rem;
  border-radius: var(--radius-md);
  font-weight: 800;
  font-size: 0.85rem;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.btn-sync.upload {
  background: #3b82f6;
  color: white;
}

.btn-sync.download {
  background: transparent;
  border-color: #f59e0b;
  color: #f59e0b;
}

.btn-sync.gold {
  background: #f59e0b;
  color: white;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}

.accent-gold {
  border-left: 4px solid #f59e0b !important;
}

.text-gold {
  color: #f59e0b !important;
}

.btn-sync:active {
  transform: scale(0.98);
}

.mb-1 { margin-bottom: 0.5rem; }
</style>
