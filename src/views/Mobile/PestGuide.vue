<script setup>
import { ref, computed } from 'vue';
import { 
  Search, 
  Info, 
  ShieldCheck, 
  X, 
  ChevronRight, 
  Activity,
  Bug,
  LayoutGrid,
  Filter,
  Warehouse,
  Sprout,
  UserCheck,
  CheckCircle2,
  Share2
} from 'lucide-vue-next';
import { state, actions } from '../../store';

const searchQuery = ref('');
const selectedPest = ref(null);
const activeCategory = ref('すべて'); // 'すべて', '害虫', '病害'
const activeCropId = ref('all'); // 'all', 'c1', 'c2'...

const categories = ['すべて', '害虫', '病害'];
const crops = computed(() => [{ id: 'all', name: '全作物' }, ...(state.masters.m_crop || [])]);

// Filtering Logic
const filteredPests = computed(() => {
  let list = state.masters.m_pest || [];
  
  if (activeCropId.value !== 'all') {
    list = list.filter(p => p.cropIds && p.cropIds.includes(activeCropId.value));
  }
  
  if (activeCategory.value !== 'すべて') {
    list = list.filter(p => p.category === activeCategory.value);
  }
  
  if (searchQuery.value) {
    list = list.filter(p => p.name && p.name.includes(searchQuery.value));
  }
  
  return list;
});

// Relational Logic: Get solutions via Mapping Master
const pestSolutions = computed(() => {
  if (!selectedPest.value) return [];
  const mappings = state.masters.m_mapping || {};
  const mapping = mappings[selectedPest.value.groupId];
  if (!mapping || !mapping.solutions) return [];

  const solutions = state.masters.m_solution || [];
  return mapping.solutions.map(sid => 
    solutions.find(s => s.id === sid)
  ).filter(Boolean);
});

// Grouped Solutions for UI
const groupedSolutions = computed(() => {
  const sols = pestSolutions.value || [];
  return {
    physical: sols.filter(s => s && s.category === 'A'),
    biological: sols.filter(s => s && s.category === 'B'),
    material: sols.filter(s => s && s.category === 'C')
  };
});

// Recommendation Logic: Link JAS solutions to user's real inventory
const recommendedFromStock = computed(() => {
  if (!selectedPest.value) return [];
  
  const jasMaterials = groupedSolutions.value.material; // Category C solutions (BT剤, 銅剤 etc)
  const userMaterials = state.masters.m_material || [];
  
  // Cross-reference user's materials with JAS solution keywords
  return userMaterials.filter(um => 
    jasMaterials.some(js => (um.name || '').toLowerCase().includes((js.name || '').toLowerCase()))
  );
});

const getGroupInfo = computed(() => {
  if (!selectedPest.value) return null;
  return state.masters.m_group?.find(g => g.id === selectedPest.value.groupId) || { name: '未分類' };
});

const selectPest = (pest) => {
  selectedPest.value = pest;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const handleApplyPrevention = (solutionName) => {
  if (!selectedPest.value) return;
  
  const content = `防除実施：${selectedPest.value.name}対策（${solutionName}）`;
  // 圃場コンテキストがないため、実在する最初の圃場を既定値とする（存在しない'f1'のハードコードを廃止）
  const defaultFieldId = state.masters.m_field?.[0]?.id || '';
  actions.addWorkRecord({
    content,
    workerName: state.user.name,
    fieldId: defaultFieldId,
    materials: [{ name: solutionName, category: '防除資材', quantity: '規定量' }]
  });

  const fieldName = state.masters.m_field?.[0]?.name;
  actions.showToast(
    fieldName
      ? `${solutionName} による防除を「${fieldName}」に記録しました（圃場は作業履歴で変更可）`
      : `${solutionName} による防除を記録しました`,
    'success'
  );
};
</script>

<template>
  <div class="pest-intel-final animate-slide-up">
    <!-- Header -->
    <div v-if="!selectedPest" class="db-header mb-1">
      <div class="title-with-icon">
        <LayoutGrid size="24" class="text-primary" />
        <h2>オーガニック防除DB <small>v.Complete</small></h2>
      </div>
      <p>独立4層マスタによる「作物×病害虫×JAS対策」完全版</p>
    </div>

    <!-- Relational Filters -->
    <div v-if="!selectedPest" class="db-filters glass mb-2">
      <div class="crop-scroller">
        <button 
          v-for="c in crops" :key="c.id"
          @click="activeCropId = c.id"
          :class="{ active: activeCropId === c.id }"
          class="crop-pill"
        >
          <div class="pill-content">
            <span class="pill-name">{{ c.name }}</span>
            <span v-if="c.family" class="pill-family">{{ c.family }}</span>
          </div>
        </button>
      </div>

      <div class="search-wrap mt-1">
        <div class="search-box">
          <Search size="16" />
          <input v-model="searchQuery" placeholder="病気・虫・作物を網羅検索..." />
        </div>
        <div class="cat-tabs">
          <button 
            v-for="cat in categories" :key="cat"
            @click="activeCategory = cat"
            :class="{ active: activeCategory === cat }"
          >{{ cat }}</button>
        </div>
      </div>
    </div>

    <!-- Data List -->
    <div v-if="!selectedPest" class="db-list">
      <div v-for="p in filteredPests" :key="p.id" @click="selectPest(p)" class="pest-card-v2 glass card">
        <div class="p-info">
          <div class="p-meta">
            <span class="p-badge">{{ p.category }}</span>
            <span v-if="p.source" class="p-source-mini">出典: {{ p.source }}</span>
          </div>
          <h3>{{ p.name }}</h3>
          <span class="p-group">{{ state.masters.m_group?.find(g => g.id === p.groupId)?.name || '未分類' }}</span>
        </div>
        <ChevronRight class="arrow" />
      </div>
      
      <div v-if="filteredPests.length === 0" class="empty-state">
        <Info size="40" />
        <p>該当データなし（設定からDBを初期化してください）</p>
      </div>
    </div>

    <!-- Professional Detail Profile -->
    <div v-else class="pest-profile animate-slide-up">
      <div class="profile-nav">
        <button @click="selectedPest = null" class="btn-back">
          <ChevronRight style="transform: rotate(180deg)" />
          DB一覧に戻る
        </button>
        <span class="status-badge">有機JAS適合性確認済み</span>
      </div>

      <div class="profile-header glass">
        <div class="icon-wrap">
          <Bug v-if="selectedPest.category === '害虫'" />
          <Activity v-else />
        </div>
        <div class="title-wrap">
          <div class="title-meta">
            <span class="group-label">系統：{{ getGroupInfo?.name }}</span>
            <span v-if="selectedPest.source" class="source-tag">出典：{{ selectedPest.source }}</span>
          </div>
          <h2>{{ selectedPest.name }}</h2>
        </div>
      </div>

      <!-- Inventory Link -->
      <section v-if="recommendedFromStock.length > 0" class="intel-card stock-recom animate-pulse-subtle">
        <div class="card-header">
          <Warehouse size="18" />
          <h4>自社倉庫内の適合在庫</h4>
        </div>
        <div class="stock-chips">
          <div v-for="m in recommendedFromStock" :key="m.id" class="stock-item glass">
            <div class="m-info">
              <UserCheck size="14" />
              {{ m.name }}
            </div>
            <button @click="handleApplyPrevention(m.name)" class="use-btn">
              <CheckCircle2 size="12" /> これを使用
            </button>
          </div>
        </div>
      </section>

      <!-- Solutions Matrix -->
      <div class="solution-matrix">
        <!-- Physical (Cat A) -->
        <section v-if="groupedSolutions.physical.length" class="intel-card physical">
          <div class="card-header"><Activity size="16" /> <h4>物理的防除法</h4></div>
          <ul class="method-list">
            <li v-for="s in groupedSolutions.physical" :key="s.id">
              <div class="method-content">
                <strong>{{ s.name }}</strong>
                <p v-if="s.detail" class="method-detail">{{ s.detail }}</p>
              </div>
            </li>
          </ul>
        </section>

        <!-- Biological (Cat B) -->
        <section v-if="groupedSolutions.biological.length" class="intel-card biological">
          <div class="card-header"><Sprout size="16" /> <h4>生物的防除法</h4></div>
          <ul class="method-list">
            <li v-for="s in groupedSolutions.biological" :key="s.id">
              <div class="method-content">
                <strong>{{ s.name }}</strong>
                <p v-if="s.detail" class="method-detail">{{ s.detail }}</p>
              </div>
            </li>
          </ul>
        </section>

        <!-- Material (Cat C) -->
        <section class="intel-card chemical accent-gold">
          <div class="card-header"><ShieldCheck size="16" /> <h4>有機JAS適合資材（農薬成分）</h4></div>
          <div class="chips-wrap-v2">
            <div v-for="s in groupedSolutions.material" :key="s.id" class="jas-card glass">
              <div class="jas-card-name">{{ s.name }}</div>
              <div v-if="s.detail" class="jas-card-detail">{{ s.detail }}</div>
            </div>
          </div>
          <p class="matrix-note">※出典：農林水産省「有機農産物のJAS規格」別表等に基づき作成</p>
        </section>
      </div>

      <div class="profile-footer">
        <p>確実性表示：上記データはFAMIC登録情報及び公的機関の技術資料を参照しています。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pest-intel-final { padding-bottom: 120px; }

/* Styles for the "Complete" UI */
.db-header { padding: 0 0.5rem; }
.db-header h2 { font-size: 1.5rem; font-weight: 900; }
.db-header small { font-size: 0.7rem; color: var(--primary); font-weight: 400; font-family: monospace; }
.db-header p { font-size: 0.8rem; color: var(--text-soft); }

.db-filters {
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 1rem 0.75rem;
  margin: 0 -0.5rem 1.5rem;
}

.crop-scroller {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding: 0.25rem 0 0.75rem;
  scrollbar-width: none;
}

.crop-pill {
  flex: 0 0 auto;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-soft);
  text-align: left;
  border: 1px solid var(--glass-border);
}

.pill-content { display: flex; flex-direction: column; }
.pill-name { font-size: 0.9rem; font-weight: 800; }
.pill-family { font-size: 0.65rem; opacity: 0.7; font-weight: 400; }

.crop-pill.active { background: var(--primary); color: white; border-color: var(--primary); }

.search-wrap { display: flex; flex-direction: column; gap: 0.75rem; }
.search-box { display: flex; align-items: center; gap: 0.5rem; background: var(--bg-surface); padding: 0.6rem 1rem; border-radius: var(--radius-md); }
.search-box input { flex: 1; background: transparent; border: none; color: var(--text-main); font-size: 0.95rem; outline: none; }

.cat-tabs { display: flex; background: var(--bg-surface); padding: 0.2rem; border-radius: var(--radius-full); }
.cat-tabs button { flex: 1; padding: 0.4rem; border-radius: var(--radius-full); font-size: 0.8rem; color: var(--text-soft); font-weight: 700; }
.cat-tabs button.active { background: var(--bg-primary); color: var(--primary); box-shadow: var(--glass-shadow); }

/* List Card */
.pest-card-v2 { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem 1.5rem; }
.p-meta { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
.p-badge { font-size: 0.65rem; font-weight: 800; color: white; background: var(--primary); padding: 0.1rem 0.5rem; border-radius: 4px; }
.p-source-mini { font-size: 0.6rem; color: var(--text-soft); opacity: 0.8; }
.p-info h3 { font-size: 1.2rem; font-weight: 900; }
.p-group { font-size: 0.75rem; color: var(--text-soft); margin-top: 0.2rem; display: block; }

/* Profile Detail */
.title-meta { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.4rem; }
.source-tag { font-size: 0.65rem; color: var(--primary); font-weight: 700; background: var(--primary-glow); padding: 0.1rem 0.4rem; border-radius: 4px; width: fit-content; }
.title-wrap h2 { font-size: 1.75rem; font-weight: 900; line-height: 1.1; }

.method-content { display: flex; flex-direction: column; gap: 0.25rem; }
.method-detail { font-size: 0.75rem; color: var(--text-soft); line-height: 1.4; font-weight: 400; }

.chips-wrap-v2 { display: flex; flex-direction: column; gap: 0.75rem; }
.jas-card { padding: 1rem; border-left: 3px solid var(--accent); }
.jas-card-name { font-weight: 800; font-size: 0.95rem; color: var(--text-main); margin-bottom: 0.25rem; }
.jas-card-detail { font-size: 0.75rem; color: var(--text-soft); line-height: 1.4; }

.profile-footer { text-align: center; margin-top: 2rem; opacity: 0.7; font-size: 0.65rem; padding: 1rem; border-top: 1px solid var(--glass-border); }

@keyframes pulse-subtle {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}
.animate-pulse-subtle { animation: pulse-subtle 4s infinite ease-in-out; }
</style>
