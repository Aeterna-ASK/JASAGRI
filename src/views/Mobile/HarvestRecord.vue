<script setup>
import { ref, computed } from 'vue';
import { Package, Hash, Save, Camera, Plus, Minus } from 'lucide-vue-next';
import { state, actions } from '../../store';

const selectedField = ref(null);
const cropName = ref('');
const harvestWeight = ref(0);
const gradedWeight = ref(0);
const wasteWeight = ref(0);
const serialStart = ref('');
const serialEnd = ref('');

const fields = computed(() => state.masters.m_field);

// --- 動的収穫対象品目フィルターシステム ---
// 圃場で「収穫開始」を作業記録してある、かつ「収穫終了」していない作物のみを抽出
const activeHarvestCrops = computed(() => {
  if (!selectedField.value) return [];
  
  const fId = selectedField.value.id;
  const workRecords = state.records.t_work_record || [];
  const activeCropNames = new Set();
  
  // 全ての種苗マスタ
  const SEED_CATEGORIES = ['種苗', '苗・種子'];
  const allSeeds = state.masters.m_material.filter(m => SEED_CATEGORIES.includes(m.category));
  
  allSeeds.forEach(m => {
    let lastStart = null;
    let lastEnd = null;
    
    // この圃場 ＆ この種苗に関わる過去作業を抽出
    const relatedRecords = workRecords.filter(r => 
      String(r.fieldId) === String(fId) && 
      (
        (r.seeds && r.seeds.some(s => s.name === m.name)) ||
        (r.content && r.content.includes(m.name))
      )
    );
    
    relatedRecords.forEach(r => {
      let isStart = false;
      let isEnd = false;
      
      if (r.seeds) {
        r.seeds.forEach(s => {
          if (s.name === m.name) {
            if (s.taskType === '収穫開始') isStart = true;
            if (s.taskType === '収穫終了') isEnd = true;
          }
        });
      }
      
      if (r.content) {
        if (r.content.includes(m.name) && r.content.includes('収穫開始')) isStart = true;
        if (r.content.includes(m.name) && r.content.includes('収穫終了')) isEnd = true;
      }
      
      const recordDate = r.date || r.createdAt || '1970-01-01';
      if (isStart) {
        if (!lastStart || new Date(recordDate) > new Date(lastStart)) {
          lastStart = recordDate;
        }
      }
      if (isEnd) {
        if (!lastEnd || new Date(recordDate) > new Date(lastEnd)) {
          lastEnd = recordDate;
        }
      }
    });
    
    // 収穫開始されており、かつそれ以降に収穫終了が記録されていない場合
    if (lastStart) {
      if (!lastEnd || new Date(lastStart) > new Date(lastEnd)) {
        activeCropNames.add(m.name);
      }
    }
  });
  
  // Zero-Stop Policy フォールバック: 1件もない場合はマスタの種苗すべてを表示
  if (activeCropNames.size === 0) {
    return allSeeds.map(m => ({ id: m.id, name: m.name }));
  }
  
  return Array.from(activeCropNames).map(name => {
    const m = allSeeds.find(seed => seed.name === name);
    return {
      id: m ? m.id : name,
      name: name
    };
  });
});

const handleSave = () => {
  if (!selectedField.value) {
    actions.showToast('圃場を選択してください', 'warning');
    return;
  }
  if (!cropName.value) {
    actions.showToast('収穫品目を選択してください', 'warning');
    return;
  }
  if (!harvestWeight.value || harvestWeight.value <= 0) {
    actions.showToast('収穫量を入力してください', 'warning');
    return;
  }
  actions.addHarvest({
    fieldId: selectedField.value.id,
    cropName: cropName.value,
    harvestWeight: harvestWeight.value,
    gradedWeight: gradedWeight.value,
    wasteWeight: wasteWeight.value,
    serialStart: serialStart.value,
    serialEnd: serialEnd.value
  });
  // Reset
  selectedField.value = null;
  cropName.value = '';
  harvestWeight.value = 0;
  gradedWeight.value = 0;
  wasteWeight.value = 0;
  serialStart.value = '';
  serialEnd.value = '';
  actions.showToast('収穫記録を保存しました', 'success');
};

const onCropChange = (event) => {
  cropName.value = event.target.value;
};

const adjustHarvest = (val) => {
  harvestWeight.value = Math.max(0, harvestWeight.value + val);
};
</script>

<template>
  <div class="mobile-view animate-slide-up">
    <!-- Step 1: Field Selection -->
    <div v-if="!selectedField" class="selection-view">
      <div class="page-title mb-3">
        <Package class="title-icon" />
        <h2>圃場を選択してください</h2>
      </div>
      <div class="selection-grid">
        <button 
          v-for="f in fields" 
          :key="f.id" 
          @click="selectedField = f"
          class="card glass grid-item"
        >
          <span class="name">{{ f.name }}</span>
        </button>
      </div>
    </div>

    <!-- Step 2: Form Input -->
    <div v-else class="entry-form card glass p-4">
      <button @click="selectedField = null" class="btn-back">
        ← {{ selectedField.name }} の収穫を記録
      </button>

      <div class="form-group mt-3">
        <label class="label-sm">収穫品目を選択</label>
        <div class="select-wrap mb-3">
          <select @change="onCropChange($event)" class="modern-select">
            <option value="">-- 手動で直接入力する（マスタ外） --</option>
            <option v-for="c in activeHarvestCrops" :key="c.id" :value="c.name" :selected="cropName === c.name">
              {{ c.name }}
            </option>
          </select>
        </div>
        
        <label class="label-sm">品名（自由記入欄）</label>
        <input v-model="cropName" type="text" placeholder="例：完熟ブルーベリー" class="modern-input" />
      </div>

      <div class="form-group">
        <label class="label-sm">総収穫量 (kg)</label>
        <div class="stepper">
          <button @click="adjustHarvest(-1)" class="stepper-btn"><Minus size="18" /></button>
          <input v-model="harvestWeight" type="number" class="stepper-input" />
          <button @click="adjustHarvest(1)" class="stepper-btn"><Plus size="18" /></button>
        </div>
      </div>

      <div class="form-group">
        <label class="label-sm">廃棄・ロス量 (kg)</label>
        <input v-model="wasteWeight" type="number" placeholder="0" class="modern-input" />
      </div>

      <div class="actions">
        <button 
          @click="handleSave" 
          :disabled="!selectedField || !cropName || harvestWeight <= 0" 
          class="btn-primary btn-mobile-action"
        >
          <Save size="18" />
          収穫を完了して保存
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--primary);
}

.title-icon {
  color: var(--primary);
}

.btn-back {
  background: transparent;
  color: var(--primary);
  padding: 0;
  margin-bottom: 1rem;
  font-size: 1.1rem;
  font-weight: 800;
  border: none;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
}

.step-label {
  font-weight: 700;
  margin-bottom: 1rem;
  color: var(--primary);
}

.selection-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.grid-item {
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: white;
  border: 1px solid var(--glass-stroke);
  font-weight: 800;
  font-size: 1.05rem;
  color: var(--text-main);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.form-group {
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
}

.label-sm {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-soft);
  margin-bottom: 0.5rem;
  display: block;
}

/* くっきり高コントラストな外枠線 ＆ 白背景 */
.modern-input,
.modern-select {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: #ffffff !important;
  border: 1.5px solid #cbd5e1 !important;
  color: var(--text-main) !important;
  font-size: 0.95rem;
  font-weight: 700;
  transition: all 0.2s ease-out;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);
}

.modern-input:focus,
.modern-select:focus {
  outline: none;
  border-color: #10b981 !important;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
}

/* プルダウン装飾 */
.select-wrap {
  position: relative;
  width: 100%;
}

.select-wrap::after {
  content: '▼';
  font-size: 0.6rem;
  color: var(--text-soft);
  right: 1.2rem;
  top: 50%;
  transform: translateY(-50%);
  position: absolute;
  pointer-events: none;
}

.modern-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding-right: 2.5rem;
}

/* ステッパー (数量増減) も白地 ＆ くっきり枠線に調和 */
.stepper {
  display: flex;
  align-items: center;
  border-radius: 8px;
  border: 1.5px solid #cbd5e1;
  background: white;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);
}

.stepper-btn {
  width: 50px;
  height: 50px;
  border-radius: 0;
  background: #f8fafc;
  border: none;
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
}

.stepper-btn:hover {
  background: #f1f5f9;
}

.stepper-input {
  flex: 1;
  border: none !important;
  text-align: center;
  font-size: 1.3rem;
  font-weight: 800;
  height: 50px;
  color: var(--text-main);
  background: white;
}

.stepper-input:focus {
  outline: none;
}

.btn-mobile-action {
  width: 100%;
  padding: 1.1rem;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: white;
  font-size: 1.1rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  box-shadow: 0 8px 20px var(--primary-glow);
  border: none;
  cursor: pointer;
}

.btn-mobile-action:disabled {
  opacity: 0.5;
  filter: grayscale(1);
  cursor: not-allowed;
}

.mb-3 { margin-bottom: 1rem; }
.mt-3 { margin-top: 1rem; }
.p-4 { padding: 1.25rem; }
</style>
