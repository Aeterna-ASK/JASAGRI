<script setup>
import { ref, computed, watch } from 'vue';
import { 
  CheckCircle2, 
  ChevronRight, 
  Save, 
  Eraser, 
  Sprout, 
  Truck, 
  Calendar as CalendarIcon,
  Plus,
  Info
} from 'lucide-vue-next';
import { state, actions } from '../../store';

const selectedField = ref(null);
const selectedWorkItems = ref([]);
const selectedEquipments = ref([]); // 追加
const isWorkDropdownOpen = ref(false);
const isEquipmentDropdownOpen = ref(false);
const manualNote = ref('');
const isWashed = ref(false);
const washMethod = ref('水洗い'); // 水洗い, 泥落とし

const excludedTopWorkTypes = ['播種', '定植', '収穫'];
const topWorkTypes = computed(() => {
  const baseTypes = state.masters.m_work_type.filter(w => !excludedTopWorkTypes.includes(w.name));
  // すでにおすすめ（suggestedSteps）に出ているものは除外して重複を防ぐ
  return baseTypes.filter(w => !suggestedSteps.value.includes(w.name));
});

const selectedCropId = ref(null);

// 品目選択時に、その品目の「重要な」工程を検索（播種、定植などを優先）
// cropId は m_crop または m_material（種苗）の両方を参照する
const resolveCrop = (cropId) => {
  if (!cropId) return null;
  return state.masters.m_crop.find(c => String(c.id) === String(cropId))
      || state.masters.m_material.find(m => String(m.id) === String(cropId))
      || null;
};

const lastStepInfo = computed(() => {
  if (!selectedField.value || !selectedCropId.value) return null;
  const crop = resolveCrop(selectedCropId.value);
  if (!crop) return null;
  
  const importantTasks = ['播種', '定植', '収穫開始'];
  
  const records = [...state.records.t_work_record]
    .filter(r => {
      if (String(r.fieldId) !== String(selectedField.value.id)) return false;
      
      // 品目一致チェック
      const isMatch = (r.cropId && String(r.cropId) === String(selectedCropId.value)) ||
                      (!r.cropId && ((r.seeds || []).some(s => s.name.includes(crop.name)) || (r.content || '').includes(crop.name)));
      
      if (!isMatch) return false;

      // 「重要な」工程が含まれているかチェック
      return importantTasks.some(task => (r.content || '').includes(task) || (r.seeds || []).some(s => s.taskType === task));
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (records.length === 0) return { status: '新規', message: `${crop.name} の過去の重要工程（播種・定植等）の記録はありません` };
  
  const last = records[0];
  // 1. 工程名を特定 (播種、定植など)
  const foundTask = importantTasks.find(task => last.content.includes(task) || (last.seeds || []).some(s => s.taskType === task)) || '前回の作業';
  
  // 2. その時の具体的な種苗名と数量を取得
  const importantSeed = (last.seeds || []).find(s => s.taskType === foundTask || importantTasks.includes(s.taskType));
  const detailName = importantSeed ? importantSeed.name : crop.name;
  const quantity = importantSeed ? importantSeed.quantity : '';
  
  const displayInfo = `${detailName} ${quantity}`.trim();
  
  return { 
    date: last.date, 
    task: foundTask,
    message: `履歴判別: ${last.date} に ${displayInfo} の ${foundTask} を実施済みです`
  };
});
const suggestedSteps = computed(() => {
  if (!selectedCropId.value) return [];
  const process = state.masters.m_process.find(p => p.cropId === selectedCropId.value);
  if (!process) return [];
  // 基本作業欄には「播種」「定植」「収穫」「施肥」「防除」などは出さない（専用セクションがあるため）
  const excludedInSuggestions = ['播種', '定植', '収穫', '収穫開始', '収穫終了', '施肥', '防除'];
  return process.steps.filter(s => !excludedInSuggestions.includes(s));
});

// Seeds Management (Revamped for Detailed Tracking)
const addedSeeds = ref([]);
const seedForm = ref({
  id: null,
  name: '',
  taskType: '播種', // 播種, 育苗, 定植, 収穫開始, 収穫終了, 自由記入
  customTaskType: '', // 自由記入欄
  quantity: '',
  source: '',
  purchaseDate: new Date().toISOString().split('T')[0],
  category: '種苗'
});

// Materials Management (Fertilizers, Pesticides)
const addedMaterials = ref([]);
const materialForm = ref({ id: '', name: '', quantity: '', category: '', source: '', purchaseDate: '' });

const workerName = ref(state.user.name);
watch(() => state.user.name, (v) => { if (v && !workerName.value) workerName.value = v; }, { immediate: true });

const fields = computed(() => state.masters.m_field);
const equipments = computed(() => state.masters.m_equipment);
const masterMaterials = computed(() => state.masters.m_material);

const SEED_CATEGORIES = ['種苗', '苗・種子'];
const masterSeeds = computed(() => masterMaterials.value.filter(m => SEED_CATEGORIES.includes(m.category)));
const masterOtherMaterials = computed(() => masterMaterials.value.filter(m => !SEED_CATEGORIES.includes(m.category)));

const addSeedToRecord = () => {
  if (!seedForm.value.name) return;
  
  let actualTaskType = seedForm.value.taskType;
  if (actualTaskType === '自由記入' || actualTaskType === 'other') {
    actualTaskType = seedForm.value.customTaskType.trim() || 'その他作業';
  }

  addedSeeds.value.push({ 
    ...seedForm.value,
    taskType: actualTaskType
  });

  seedForm.value = { 
    id: null, 
    name: '', 
    taskType: '播種', 
    customTaskType: '',
    quantity: '', 
    source: '', 
    purchaseDate: new Date().toISOString().split('T')[0], 
    category: '種苗' 
  };
};

const addMaterialToRecord = () => {
  if (!materialForm.value.name) return;
  addedMaterials.value.push({ ...materialForm.value });
  materialForm.value = { id: '', name: '', quantity: '', category: '', source: '', purchaseDate: '' };
};

const removeSeedFromRecord = (index) => addedSeeds.value.splice(index, 1);
const removeMaterialFromRecord = (index) => addedMaterials.value.splice(index, 1);

const selectSeedMaster = (m) => {
  seedForm.value.id = m.id;
  seedForm.value.name = m.name;
  
  // 種苗マスタ選択時は、その m_material ID を直接 cropId として使用する
  // （m_material が対象品目の主軸となったため、m_crop 検索は不要）
  selectedCropId.value = m.id;

  // --- 高精度な段階的表記揺れマッチングシステム ---
  // 1. 完全一致する資材受入レコードを検索
  let receipt = state.records.t_material_receipt.find(r => r.materialName === m.name);
  
  // 2. 受入記録の品名にマスタ名が含まれる、またはその逆（部分一致）
  if (!receipt) {
    receipt = state.records.t_material_receipt.find(r => 
      r.materialName && (r.materialName.includes(m.name) || m.name.includes(r.materialName))
    );
  }
  
  // 3. 品目名（例: ミニトマト、トマト）でのキーワード部分一致
  if (!receipt && crop) {
    receipt = state.records.t_material_receipt.find(r => 
      r.materialName && r.materialName.includes(crop.name)
    );
  }

  // 自動取得：最新の購入履歴から仕入先と購入日・数量を自動バインド（判別）
  if (receipt) {
    seedForm.value.source = receipt.supplier || receipt.partnerName || '';
    seedForm.value.purchaseDate = receipt.date;
    seedForm.value.quantity = receipt.quantity || ''; // 🌟購入数量を仮セット！
  } else {
    // 該当する受入記録がない場合はデフォルト値（本日および空）にリセット
    seedForm.value.source = '';
    seedForm.value.purchaseDate = new Date().toISOString().split('T')[0];
    seedForm.value.quantity = '';
  }
};

// 種苗作業のプルダウン選択時に、前回までの播種・定植の履歴を自動逆引きして特記事項にセット（JAS適合神機能の継承）
watch(() => seedForm.value.taskType, (newType) => {
  if (newType === '定植') {
    const sowingDate = getPastStepDate('播種');
    if (sowingDate) {
      manualNote.value = `播種日:${sowingDate} 定植日:${new Date().toISOString().split('T')[0]}`;
    } else {
      manualNote.value = `定植日:${new Date().toISOString().split('T')[0]}`;
    }
  } else if (newType === '播種') {
    manualNote.value = `播種日:${new Date().toISOString().split('T')[0]}`;
  } else if (newType === '収穫開始') {
    const sowingDate = getPastStepDate('播種');
    const plantingDate = getPastStepDate('定植');
    let note = '';
    if (sowingDate) note += `播種日:${sowingDate} `;
    if (plantingDate) note += `定植日:${plantingDate} `;
    note += `収穫始:${new Date().toISOString().split('T')[0]}`;
    manualNote.value = note;
  }
});

const onSeedMasterChange = (event) => {
  const mId = event.target.value;
  if (mId) {
    const m = masterSeeds.value.find(seed => String(seed.id) === String(mId));
    if (m) {
      selectSeedMaster(m);
    }
  } else {
    seedForm.value.id = null;
    seedForm.value.name = '';
  }
};

const selectMaterialMaster = (m) => {
  materialForm.value.id = m.id;
  materialForm.value.name = m.name;
  materialForm.value.category = m.category;
  
  // --- 高精度な段階的表記揺れマッチングシステム ---
  // 1. 完全一致
  let receipt = state.records.t_material_receipt.find(r => r.materialName === m.name);
  
  // 2. 部分一致（受入記録の品名にマスタ名が含まれる、またはその逆）
  if (!receipt) {
    receipt = state.records.t_material_receipt.find(r => 
      r.materialName && (r.materialName.includes(m.name) || m.name.includes(r.materialName))
    );
  }
  
  if (receipt) {
    materialForm.value.source = receipt.supplier || receipt.partnerName || '';
    materialForm.value.purchaseDate = receipt.date;
    materialForm.value.quantity = receipt.quantity || ''; // 🌟購入数量を仮セット！
  } else {
    // 該当する受入記録がない場合はデフォルト値（本日）に初期化
    materialForm.value.source = '';
    materialForm.value.purchaseDate = new Date().toISOString().split('T')[0];
    materialForm.value.quantity = '';
  }
};

const onMaterialMasterChange = (event) => {
  const mId = event.target.value;
  if (mId) {
    const m = masterOtherMaterials.value.find(mat => String(mat.id) === String(mId));
    if (m) {
      selectMaterialMaster(m);
    }
  } else {
    materialForm.value.id = '';
    materialForm.value.name = '';
    materialForm.value.category = '';
  }
};

const workContent = computed({
  get: () => {
    const items = [...selectedWorkItems.value];
    if (manualNote.value) items.push(manualNote.value);
    return items.join(', ');
  },
  set: (val) => {
    manualNote.value = val;
  }
});

const getPastStepDate = (stepName) => {
  if (!selectedField.value || !selectedCropId.value) return null;
  const crop = resolveCrop(selectedCropId.value);
  if (!crop) return null;

  const records = [...state.records.t_work_record]
    .filter(r => {
      // 圃場の一致チェック（型不問）
      if (String(r.fieldId) !== String(selectedField.value.id)) return false;
      
      // 品目の一致チェック（cropId または テキスト曖昧検索）
      if (r.cropId && String(r.cropId) === String(selectedCropId.value)) return true;
      if (!r.cropId) {
        return (r.seeds || []).some(s => s.name.includes(crop.name)) || (r.content || '').includes(crop.name);
      }
      return false;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const target = records.find(r => (r.content || '').includes(stepName) || (r.seeds || []).some(s => s.taskType === stepName));
  return target ? target.date : null;
};

const toggleWorkItem = (name) => {
  const index = selectedWorkItems.value.indexOf(name);
  if (index === -1) {
    selectedWorkItems.value.push(name);
    
    // ブラッシュアップ：特定の工程が選ばれた時に特記事項を自動生成
    if (name === '定植') {
      const sowingDate = getPastStepDate('播種');
      if (sowingDate) {
        manualNote.value = `播種日:${sowingDate} 定植日:${new Date().toISOString().split('T')[0]}`;
      }
    } else if (name === '収穫') {
      const sowingDate = getPastStepDate('播種');
      const plantingDate = getPastStepDate('定植');
      let note = '';
      if (sowingDate) note += `播種日:${sowingDate} `;
      if (plantingDate) note += `定植日:${plantingDate} `;
      note += `収穫始:${new Date().toISOString().split('T')[0]}`;
      manualNote.value = note;
    } else if (name === '播種') {
      manualNote.value = `播種日:${new Date().toISOString().split('T')[0]}`;
    }
  } else {
    selectedWorkItems.value.splice(index, 1);
  }
};

const equipmentActions = ref({});

const toggleEquipment = (e) => {
  const index = selectedEquipments.value.findIndex(item => item.id === e.id);
  if (index === -1) {
    selectedEquipments.value.push(e);
    if (!equipmentActions.value[e.id]) {
      equipmentActions.value[e.id] = [];
    }
  } else {
    selectedEquipments.value.splice(index, 1);
    delete equipmentActions.value[e.id];
  }
};

const toggleEquipmentAction = (eqId, actionName) => {
  if (!equipmentActions.value[eqId]) {
    equipmentActions.value[eqId] = [];
  }
  const actionsArr = equipmentActions.value[eqId];
  const idx = actionsArr.indexOf(actionName);
  if (idx === -1) {
    actionsArr.push(actionName);
  } else {
    actionsArr.splice(idx, 1);
  }
};

const handleSave = () => {
  if (!selectedField.value) return;

  // 空の作業記録を防ぐ：作業内容・種苗・資材・機材のいずれかが必要
  const hasContent =
    selectedWorkItems.value.length > 0 ||
    (manualNote.value && manualNote.value.trim()) ||
    addedSeeds.value.length > 0 ||
    addedMaterials.value.length > 0 ||
    selectedEquipments.value.length > 0;
  if (!hasContent) {
    actions.showToast('作業内容・種苗・資材・機材のいずれかを入力してください', 'warning');
    return;
  }

  let washText = '';
  const eqTexts = [];
  selectedEquipments.value.forEach(e => {
    const acts = equipmentActions.value[e.id] || [];
    if (acts.length > 0) {
      eqTexts.push(`${e.name}(${acts.join('/')})`);
    }
  });
  if (eqTexts.length > 0) {
    washText = ` 【機材メンテ: ${eqTexts.join(', ')}】`;
  }

  const finalContent = workContent.value + washText;

  actions.addWorkRecord({
    date: workDate.value,
    fieldId: selectedField.value.id,
    cropId: selectedCropId.value, // 重要：品目IDを保存
    content: finalContent,
    seeds: [...addedSeeds.value],
    materials: [...addedMaterials.value],
    equipmentIds: selectedEquipments.value.map(e => e.id),
    isWashed: selectedEquipments.value.some(e => (equipmentActions.value[e.id] || []).length > 0),
    washMethod: eqTexts.join(', '),
    workerName: workerName.value
  });
  
  // Reset
  selectedField.value = null;
  selectedCropId.value = null; // 品目選択をリセット
  selectedEquipments.value = [];
  selectedWorkItems.value = [];
  isWorkDropdownOpen.value = false;
  isEquipmentDropdownOpen.value = false;
  equipmentActions.value = {};
  manualNote.value = '';
  addedSeeds.value = [];
  addedMaterials.value = [];
  isWashed.value = false;
  actions.showToast('作業記録を保存しました', 'success');
};
</script>

<template>
  <div class="work-record-modern animate-slide-up">
    <!-- Step 1: Field Selection -->
    <div v-if="!selectedField" class="selection-view">
      <div class="page-title">
        <Sprout class="title-icon" />
        <h2>圃場を選択してください</h2>
      </div>
      <div class="field-grid">
        <button 
          v-for="f in fields" 
          :key="f.id" 
          @click="selectedField = f"
          class="field-card glass"
        >
          <div class="field-info">
            <h3>{{ f.name }}</h3>
            <p>{{ f.area }} / {{ f.isOrganic ? '有機JAS' : '転換期間中' }}</p>
          </div>
          <ChevronRight class="arrow" />
        </button>
      </div>
    </div>

    <!-- Step 2: Simplified Input Form -->
    <div v-else class="form-view">
      <div class="form-header">
        <button @click="selectedField = null; selectedCropId = null" class="btn-back">
          <ChevronRight style="transform: rotate(180deg)" />
          戻る
        </button>
        <div class="current-field">
          <h3>{{ selectedField.name }}</h3>
          <span class="badge">入力中</span>
        </div>
      </div>

      <div class="form-content">
        <div class="input-group full mb-4">
          <label>作業日</label>
          <input v-model="workDate" type="date" class="modern-input" />
        </div>

        <!-- Main Work Section -->
        <section class="form-section card glass">
          <div class="section-title">
            <CheckCircle2 size="18" />
            <h4>基本作業の記録</h4>
          </div>
          <div class="form-grid">
            <!-- 基本作業複数選択プルダウン -->
            <div class="input-group full">
              <label>基本作業</label>
              <div class="custom-dropdown glass">
                <div class="dropdown-trigger" @click="isWorkDropdownOpen = !isWorkDropdownOpen">
                  <span class="trigger-label text-ellipsis">
                    🎯 {{ selectedWorkItems.length > 0 ? selectedWorkItems.join(', ') : '基本作業を選択（複数選択可）' }}
                  </span>
                  <ChevronRight class="arrow-icon" :class="{ open: isWorkDropdownOpen }" size="16" />
                </div>
                <Transition name="slide-fade">
                  <div v-if="isWorkDropdownOpen" class="dropdown-menu">
                    <!-- 推奨工程（もしあれば） -->
                    <div v-if="suggestedSteps.length > 0" class="dropdown-section">
                      <div class="dropdown-section-title">🌱 作物推奨工程</div>
                      <div class="dropdown-grid">
                        <button 
                          v-for="s in suggestedSteps" 
                          :key="'s-'+s"
                          @click="toggleWorkItem(s)"
                          :class="{ selected: selectedWorkItems.includes(s) }"
                          class="dropdown-item-chip"
                        >
                          <span class="custom-checkbox" :class="{ checked: selectedWorkItems.includes(s) }"></span>
                          {{ s }}
                        </button>
                      </div>
                    </div>
                    
                    <!-- 一般作業 -->
                    <div class="dropdown-section">
                      <div class="dropdown-section-title">⚙️ 一般作業種別</div>
                      <div class="dropdown-grid">
                        <button 
                          v-for="w in topWorkTypes" 
                          :key="'w-'+w.id"
                          @click="toggleWorkItem(w.name)"
                          :class="{ selected: selectedWorkItems.includes(w.name) }"
                          class="dropdown-item-chip"
                        >
                          <span class="custom-checkbox" :class="{ checked: selectedWorkItems.includes(w.name) }"></span>
                          {{ w.name }}
                        </button>
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>

            <!-- 補足（詳細など） -->
            <div class="input-group full">
              <label>補足（任意・詳細など）</label>
              <input v-model="manualNote" placeholder="詳細を直接入力してください" class="modern-input" />
            </div>
            
            <!-- 使用機材・器具複数選択プルダウン -->
            <div class="input-group full">
              <label>使用機材・器具</label>
              <div class="custom-dropdown glass">
                <div class="dropdown-trigger" @click="isEquipmentDropdownOpen = !isEquipmentDropdownOpen">
                  <span class="trigger-label text-ellipsis">
                    🚜 {{ selectedEquipments.length > 0 ? selectedEquipments.map(e => e.name).join(', ') : '使用機材・器具を選択（複数選択可）' }}
                  </span>
                  <ChevronRight class="arrow-icon" :class="{ open: isEquipmentDropdownOpen }" size="16" />
                </div>
                <Transition name="slide-fade">
                  <div v-if="isEquipmentDropdownOpen" class="dropdown-menu">
                    <div class="dropdown-grid">
                      <button 
                        v-for="e in equipments" 
                        :key="e.id"
                        @click="toggleEquipment(e)"
                        :class="{ selected: selectedEquipments.some(item => item.id === e.id) }"
                        class="dropdown-item-chip"
                      >
                        <span class="custom-checkbox" :class="{ checked: selectedEquipments.some(item => item.id === e.id) }"></span>
                        {{ e.name }}
                      </button>
                      <button 
                        @click="selectedEquipments = []" 
                        :class="{ selected: selectedEquipments.length === 0 }"
                        class="dropdown-item-chip none-chip"
                      >
                        <span class="custom-checkbox" :class="{ checked: selectedEquipments.length === 0 }"></span>
                        なし
                      </button>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>

            <!-- 選択された各機材に対する洗浄・泥払い・メンテナンスを個別設定できるプレミアムブロック -->
            <div v-if="selectedEquipments.length > 0" class="input-group full mt-2 animate-slide-up">
              <div class="warning-inner">
                <Info size="16" />
                <span>選択した各機材の実施項目（複数選択可）</span>
              </div>
              
              <div class="equipment-actions-container">
                <div v-for="e in selectedEquipments" :key="'eq-act-'+e.id" class="eq-action-card p-3 mb-2 glass">
                  <div class="eq-action-header font-bold text-primary">⚙️ {{ e.name }}</div>
                  <div class="eq-action-chips mt-2">
                    <button 
                      v-for="act in ['洗浄', '泥払い', 'メンテナンス']" 
                      :key="act"
                      @click="toggleEquipmentAction(e.id, act)"
                      :class="{ selected: (equipmentActions[e.id] || []).includes(act) }"
                      class="eq-action-btn"
                    >
                      {{ act }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Section A: Seeds & Seedlings (Integrated Task Recording) -->
        <section class="form-section card glass">
          <div class="section-title">
            <Sprout size="18" />
            <h4>種苗の登録と作業（播種・定植等）</h4>
          </div>

          <!-- Guidance Display (Perfect position for seed registration) -->
          <div v-if="lastStepInfo" class="guidance-box mb-3 animate-slide-up">
            <div class="guidance-inner">
              <Info size="18" class="shrink-0 mt-1" />
              <span>{{ lastStepInfo.message }}</span>
            </div>
          </div>

          <div v-if="addedSeeds.length > 0" class="added-materials-list mb-2">
            <div v-for="(s, idx) in addedSeeds" :key="idx" class="tag-item glass-accent animate-slide-up">
              <div class="tag-main">
                <span class="tag-cate">{{ s.taskType }}</span>
                <span class="tag-name">{{ s.name }}</span>
                <span class="tag-qty">{{ s.quantity }}</span>
              </div>
              <div class="tag-sub info-row">
                <span>{{ s.purchaseDate }}購入</span>
                <span v-if="s.source"> @{{ s.source }}</span>
              </div>
              <button @click="removeSeedFromRecord(idx)" class="btn-tag-remove"><Eraser size="14" /></button>
            </div>
          </div>

          <div class="material-entry-form p-4 card glass-vibrant">
            <div class="input-group full mb-3">
              <label>登録済みの種苗マスタから選択（任意）</label>
              <div class="select-wrap">
                <select @change="onSeedMasterChange($event)" class="modern-select">
                  <option value="">-- 手動で直接入力する（マスタ外） --</option>
                  <option v-for="m in masterSeeds" :key="m.id" :value="m.id" :selected="seedForm.id === m.id">
                    {{ m.name }}
                  </option>
                </select>
              </div>
            </div>

            <div class="input-group full mb-3">
              <label>種苗名</label>
              <input v-model="seedForm.name" type="text" placeholder="例：シャインマスカット" class="modern-input-sm" />
            </div>

            <div class="input-group full mb-3">
              <label>今の作業の種類</label>
              <div class="select-wrap">
                <select v-model="seedForm.taskType" class="modern-select">
                  <option value="播種">播種（はしゅ）</option>
                  <option value="育苗">育苗（いくびょう）</option>
                  <option value="定植">定植（ていしょく）</option>
                  <option value="収穫開始">収穫開始</option>
                  <option value="収穫終了">収穫終了</option>
                  <option value="自由記入">その他作業（自由記入欄へ入力）</option>
                </select>
              </div>
            </div>

            <!-- 作業内容自由記入欄（「自由記入」選択時にスムーズに出現） -->
            <div v-if="seedForm.taskType === '自由記入'" class="input-group full mb-3 animate-slide-up">
              <label>作業内容（自由記入）</label>
              <input v-model="seedForm.customTaskType" type="text" placeholder="例：接ぎ木、間引き、仮植 など" class="modern-input-sm" />
            </div>

            <div class="form-grid">
              <div class="input-group">
                <label>数量・単位</label>
                <input v-model="seedForm.quantity" type="text" placeholder="100本, 2袋" class="modern-input-sm" />
              </div>
              <div class="input-group">
                <label>購入日</label>
                <input v-model="seedForm.purchaseDate" type="date" class="modern-input-sm" />
              </div>
              <div class="input-group full">
                <label>購入先（種苗業者等）</label>
                <input v-model="seedForm.source" type="text" placeholder="xx種苗、徳永商会など" class="modern-input-sm" />
              </div>
            </div>
            
            <button @click="addSeedToRecord" :disabled="!seedForm.name" class="btn-add-material mt-3">
              <Plus size="16" /> この種苗の記録をリストに追加
            </button>
          </div>
        </section>

        <!-- Section B: Other Materials (Fertilizers/Pesticides) -->
        <section class="form-section card glass">
          <div class="section-title">
            <Plus size="18" />
            <h4>資材の使用（肥料・農薬等）</h4>
          </div>

          <div v-if="addedMaterials.length > 0" class="added-materials-list mb-2">
            <div v-for="(m, idx) in addedMaterials" :key="idx" class="tag-item glass-accent-blue animate-slide-up">
              <div class="tag-main">
                <span class="tag-cate" v-if="m.category">{{ m.category }}</span>
                <span class="tag-name">{{ m.name }}</span>
                <span class="tag-qty" v-if="m.quantity">({{ m.quantity }})</span>
              </div>
              <div class="tag-sub info-row" v-if="m.source || m.purchaseDate">
                <span v-if="m.purchaseDate">{{ m.purchaseDate }}購入</span>
                <span v-if="m.source"> @{{ m.source }}</span>
              </div>
              <button @click="removeMaterialFromRecord(idx)" class="btn-tag-remove"><Eraser size="14" /></button>
            </div>
          </div>

          <div class="material-entry-form p-4 card glass-vibrant">
            <div class="input-group full mb-3">
              <label>登録済みの資材マスタから選択（任意）</label>
              <div class="select-wrap">
                <select @change="onMaterialMasterChange($event)" class="modern-select">
                  <option value="">-- 手動で直接入力する（マスタ外） --</option>
                  <option v-for="m in masterOtherMaterials" :key="m.id" :value="m.id" :selected="materialForm.id === m.id">
                    {{ m.name }}
                  </option>
                </select>
              </div>
            </div>

            <div class="form-grid">
              <div class="input-group full">
                <label>名称</label>
                <input v-model="materialForm.name" type="text" placeholder="例：有機配合肥料" class="modern-input-sm" />
              </div>
              <div class="input-group">
                <label>数量・単位</label>
                <input v-model="materialForm.quantity" type="text" placeholder="20kg, 500ml" class="modern-input-sm" />
              </div>
              <div class="input-group">
                <label>購入日</label>
                <input v-model="materialForm.purchaseDate" type="date" class="modern-input-sm" />
              </div>
              <div class="input-group full">
                <label>購入先（仕入先名）</label>
                <input v-model="materialForm.source" type="text" placeholder="コメリ、JAなど" class="modern-input-sm" />
              </div>
            </div>
            <button @click="addMaterialToRecord" :disabled="!materialForm.name" class="btn-add-material mt-3">
              <Plus size="16" /> 資材の使用をリストに追加
            </button>
          </div>
        </section>

        <!-- Submit Button -->
        <div class="form-actions">
          <button 
            @click="handleSave" 
            :disabled="!selectedField || (!workContent && addedSeeds.length === 0 && addedMaterials.length === 0 && selectedEquipments.length === 0) || (selectedEquipments.some(e => e.washRequired && (!equipmentActions[e.id] || equipmentActions[e.id].length === 0)))"
            class="btn-submit-modern"
          >
            <Save />
            記録を保存する
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.work-record-modern {
  max-width: 650px;
  margin: 0 auto;
  padding-bottom: 5rem;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
  padding: 0 0.5rem;
}

.title-icon { color: var(--primary); }
.page-title h2 { font-size: 1.5rem; font-weight: 800; }

.field-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  border-radius: var(--radius-md);
  text-align: left;
}

.field-card h3 { font-size: 1.25rem; font-weight: 700; color: var(--primary); }
.field-card p { font-size: 0.85rem; color: var(--text-soft); }
.field-card .arrow { color: var(--text-soft); opacity: 0.5; }

/* Form View */
.form-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.btn-back {
  background: transparent;
  color: var(--primary);
  padding: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
}

.current-field {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.current-field h3 { font-size: 1.5rem; font-weight: 800; }
.badge {
  background: var(--primary-glow);
  color: var(--primary);
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 700;
}

.worker-selector {
  margin-left: auto;
}

.worker-input {
  width: 80px;
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  text-align: center;
  border-radius: var(--radius-full);
  border: 1px solid var(--glass-stroke);
}

.form-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-section {
  padding: 1.5rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  color: var(--primary);
}

.section-title h4 { font-size: 1rem; font-weight: 800; }

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

.input-group.full { grid-column: span 2; }

.input-group label {
  display: block;
  font-size: 0.8rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--text-soft);
}

.modern-input {
  width: 100%;
  padding: 0.85rem 1.25rem;
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  border: 1px solid var(--glass-stroke);
  color: var(--text-main);
  font-size: 1rem;
  transition: all 0.3s ease;
}

.modern-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 4px var(--primary-glow);
}

textarea.modern-input {
  height: 100px;
  resize: none;
}

.input-with-icon {
  position: relative;
}

.input-with-icon svg {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-soft);
}

.input-with-icon input {
  padding-left: 2.75rem;
}

/* Chip Select */
.chip-select {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.chip-select button {
  background: var(--bg-surface);
  color: var(--text-main);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-full);
  font-size: 0.85rem;
  font-weight: 600;
  border: 1px solid var(--glass-stroke);
}

.chip-select button.selected {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.btn-suggest {
  background: var(--primary-glow) !important;
  color: var(--primary) !important;
  border: 1px dashed var(--primary) !important;
}

.btn-suggest.selected {
  background: var(--primary) !important;
  color: white !important;
}

.divider-v {
  width: 1px;
  background: var(--glass-stroke);
  margin: 0 0.5rem;
}

.mb-3 { margin-bottom: 1.5rem; }
.p-3 { padding: 1rem; }

/* Custom Multi-Select Dropdown Styles */
.custom-dropdown {
  position: relative;
  width: 100%;
  border-radius: 12px;
  background: white;
  border: 1px solid var(--glass-stroke);
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
}

.dropdown-trigger {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.9rem 1.25rem;
  background: white;
  cursor: pointer;
  user-select: none;
}

.trigger-label {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  max-width: 85%;
}

.arrow-icon {
  color: var(--text-soft);
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.arrow-icon.open {
  transform: rotate(90deg);
}

.dropdown-menu {
  background: #f8fafc;
  border-top: 1px solid var(--glass-stroke);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dropdown-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.dropdown-section-title {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-soft);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.dropdown-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.dropdown-item-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  background: white;
  border: 1px solid var(--glass-stroke);
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-main);
  text-align: left;
  transition: all 0.2s;
}

.dropdown-item-chip.selected {
  background: var(--primary-glow);
  border-color: var(--primary);
  color: var(--primary);
}

.dropdown-item-chip.none-chip.selected {
  background: #f1f5f9;
  border-color: #64748b;
  color: #475569;
}

/* Custom Checkbox Inner */
.custom-checkbox {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1.5px solid #cbd5e1;
  background: white;
  position: relative;
  flex-shrink: 0;
  transition: all 0.15s;
}

.dropdown-item-chip.selected .custom-checkbox {
  background: var(--primary);
  border-color: var(--primary);
}

.dropdown-item-chip.selected .custom-checkbox::after {
  content: '';
  position: absolute;
  left: 3.5px;
  top: 1px;
  width: 4px;
  height: 7px;
  border: solid white;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}

.dropdown-item-chip.none-chip.selected .custom-checkbox {
  background: #64748b;
  border-color: #64748b;
}

/* Animations */
.slide-fade-enter-active, .slide-fade-leave-active {
  transition: all 0.25s ease-out;
}
.slide-fade-enter-from, .slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

.equipment-actions-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  margin-top: 0.75rem;
}

.eq-action-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--glass-stroke);
  padding: 0.85rem 1rem;
}

.eq-action-header {
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--primary);
}

.eq-action-chips {
  display: flex;
  gap: 0.5rem;
}

.eq-action-btn {
  flex: 1;
  padding: 0.6rem 0.5rem;
  border-radius: 8px;
  background: white;
  border: 1px solid var(--glass-stroke);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-soft);
  transition: all 0.25s ease;
}

.eq-action-btn.selected {
  background: #10b981;
  color: white;
  border-color: #10b981;
  box-shadow: 0 4px 8px rgba(16, 185, 129, 0.15);
}

.warning-inner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #92400e;
  font-size: 0.85rem;
  font-weight: 800;
  background: #fffbeb;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-top: 1.5rem;
}

/* Actions */
.form-actions {
  margin-top: 2rem;
}

.btn-submit-modern {
  width: 100%;
  padding: 1.25rem;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: white;
  border-radius: var(--radius-md);
  font-size: 1.25rem;
  font-weight: 800;
  box-shadow: 0 10px 30px var(--primary-glow);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.btn-submit-modern:disabled {
  opacity: 0.5;
  filter: grayscale(1);
}

/* Materials Styling */
.added-materials-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tag-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-sm);
  border-left: 4px solid var(--primary);
  position: relative;
}

.glass-accent-blue {
  background: hsla(217, 91%, 60%, 0.08);
  border-left: 4px solid #3b82f6;
}

.btn-tag-remove {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}

.tag-source {
  font-size: 0.75rem;
  color: var(--accent);
  margin-left: 0.5rem;
  font-style: italic;
}

.tag-sub {
  font-size: 0.75rem;
  color: var(--text-soft);
  display: flex;
  gap: 0.5rem;
}

.tag-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 0.95rem;
}

.mb-3 { margin-bottom: 1rem; }
.mt-3 { margin-top: 1rem; }

.tag-cate {
  font-size: 0.65rem;
  background: var(--primary);
  color: white;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.tag-qty { color: var(--text-soft); font-size: 0.8rem; }

.btn-tag-remove { background: transparent; color: #ef4444; padding: 0.2rem; }

.material-entry-form {
  border: 1px dashed var(--glass-stroke);
}

.label-sm { font-size: 0.7rem; font-weight: 800; color: var(--text-soft); margin-bottom: 0.5rem; display: block; }

.chip-mini {
  padding: 0.35rem 0.75rem !important;
  font-size: 0.75rem !important;
}

.modern-input,
.modern-input-sm {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: #ffffff; /* 太陽光の下でも最強のコントラストを誇る白地 */
  border: 1.5px solid #cbd5e1; /* くっきりと見えるグレーの外枠線 */
  color: var(--text-main);
  font-size: 0.9rem;
  font-weight: 700;
  transition: all 0.2s ease-out;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);
}

.modern-input::placeholder,
.modern-input-sm::placeholder {
  color: #94a3b8;
  font-weight: 500;
}

.modern-input:focus,
.modern-input-sm:focus {
  outline: none;
  border-color: #10b981; /* 有機プライマリグリーンで美しく発光 */
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}

.select-wrap {
  position: relative;
  width: 100%;
}

.select-wrap::after {
  content: '▼';
  font-size: 0.6rem;
  color: var(--text-soft);
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  position: absolute;
  pointer-events: none;
}

.modern-select {
  width: 100%;
  padding: 0.75rem 2.5rem 0.75rem 1rem;
  border-radius: var(--radius-sm);
  background: white;
  border: 1px solid var(--glass-stroke);
  color: var(--text-main);
  font-size: 0.9rem;
  font-weight: 700;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  transition: all 0.25s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.modern-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-glow);
}

.btn-add-material {
  width: 100%;
  padding: 0.75rem;
  background: var(--bg-on-surface);
  color: var(--text-main);
  border: 1px solid var(--glass-stroke);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-weight: 800;
  font-size: 0.85rem;
}

/* Guidance Display Styles */
.crop-select-sticky { 
  border: 1px solid var(--glass-stroke);
  border-left: 4px solid var(--primary);
  background: white;
}
.badge-mini { font-size: 0.65rem; padding: 0.15rem 0.5rem; border-radius: 999px; font-weight: 800; }
.badge-mini.primary { background: var(--primary); color: white; }

.flex { display: flex; }
.justify-between { justify-content: space-between; }
.items-center { align-items: center; }
.m-0 { margin: 0; }
.shrink-0 { flex-shrink: 0; }

.guidance-box { background: #fffbeb; border: 2px solid #fcd34d; border-radius: 12px; padding: 1rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
.guidance-inner { display: flex; align-items: flex-start; gap: 0.75rem; color: #92400e; font-size: 0.9rem; font-weight: 800; line-height: 1.4; }
.animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>
