<script setup>
import { computed, ref } from 'vue';
import { 
  BarChart3, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Activity,
  Banknote
} from 'lucide-vue-next';
import { state, actions } from '../../store';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
} from 'chart.js';
import { Bar, Line } from 'vue-chartjs';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

// KPIs
const now = new Date();
const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const lastMonthPrefix = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
const currentYearStr = String(now.getFullYear());

const calcRevenue = (notes) => notes.reduce((sum, n) => sum + (Number(n.amount) || 0), 0);
const calcVolume = (notes) => notes.reduce((sum, n) => sum + (n.itemDetails || []).filter(i => (i.unit || '').toLowerCase() === 'kg').reduce((s, i) => s + (Number(i.quantity) || 0), 0), 0);

const currentMonthNotes = computed(() => (state.records.t_delivery_note || []).filter(n => (n.date || '').startsWith(currentMonthPrefix)));
const lastMonthNotes = computed(() => (state.records.t_delivery_note || []).filter(n => (n.date || '').startsWith(lastMonthPrefix)));
const currentYearNotes = computed(() => (state.records.t_delivery_note || []).filter(n => (n.date || '').startsWith(currentYearStr)));

const currentMonthRevenue = computed(() => calcRevenue(currentMonthNotes.value));
const lastMonthRevenue = computed(() => calcRevenue(lastMonthNotes.value));
const currentYearRevenue = computed(() => calcRevenue(currentYearNotes.value));

const currentMonthVolume = computed(() => calcVolume(currentMonthNotes.value));
const lastMonthVolume = computed(() => calcVolume(lastMonthNotes.value));

const revenueGrowth = computed(() => lastMonthRevenue.value === 0 ? 0 : Math.round(((currentMonthRevenue.value - lastMonthRevenue.value) / lastMonthRevenue.value) * 100));
const volumeGrowth = computed(() => lastMonthVolume.value === 0 ? 0 : Math.round(((currentMonthVolume.value - lastMonthVolume.value) / lastMonthVolume.value) * 100));

// Alerts
const unresolvedIssuesCount = computed(() => {
  const list = state.records.t_corrective_action_record || [];
  return list.filter(item => !item.dateSolved).length;
});

const validMaterialCertsCount = computed(() => {
  const list = state.masters.m_material || [];
  const todayStr = new Date().toISOString().split('T')[0];
  return list.filter(item => item.certUrl && (!item.expiry || item.expiry >= todayStr)).length;
});

// Chart Data (Last 6 Months)
const chartData = computed(() => {
  const labels = [];
  const revenueData = [];
  const volumeData = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    labels.push(`${d.getMonth() + 1}月`);
    
    const notes = (state.records.t_delivery_note || []).filter(n => (n.date || '').startsWith(prefix));
    revenueData.push(calcRevenue(notes));
    volumeData.push(calcVolume(notes));
  }

  return {
    labels,
    datasets: [
      {
        type: 'bar',
        label: '売上 (円)',
        backgroundColor: '#3b82f6',
        yAxisID: 'y',
        data: revenueData,
        borderRadius: 4,
        barThickness: 30
      },
      {
        type: 'line',
        label: '出荷量 (kg)',
        borderColor: '#10b981',
        backgroundColor: '#10b981',
        yAxisID: 'y1',
        data: volumeData,
        tension: 0.3,
        borderWidth: 3
      }
    ]
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'top' },
    tooltip: {
      callbacks: {
        label: function(context) {
          let label = context.dataset.label || '';
          if (label) label += ': ';
          if (context.parsed.y !== null) {
            label += context.dataset.yAxisID === 'y' 
              ? `¥${context.parsed.y.toLocaleString()}`
              : `${context.parsed.y.toLocaleString()} kg`;
          }
          return label;
        }
      }
    }
  },
  scales: {
    y: { 
      type: 'linear', 
      display: true, 
      position: 'left', 
      title: { display: false, text: '売上 (円)' },
      ticks: { callback: (value) => `¥${value.toLocaleString()}` }
    },
    y1: { 
      type: 'linear', 
      display: true, 
      position: 'right', 
      grid: { drawOnChartArea: false }, 
      title: { display: false, text: '出荷量 (kg)' },
      ticks: { callback: (value) => `${value} kg` }
    }
  }
};

// Recent Activity
const recentWork = computed(() => {
  let records = [...(state.records.t_work_record || [])];
  records.sort((a, b) => new Date(b.date) - new Date(a.date));
  return records.slice(0, 8);
});

const getEventCategory = (content) => {
  if (content.includes('播種') || content.includes('定植')) return 'seed';
  if (content.includes('収穫') || content.includes('出荷')) return 'harvest';
  if (content.includes('防除') || content.includes('散布') || content.includes('肥料') || content.includes('農薬')) return 'pest';
  return 'other';
};

const getCategoryLabel = (content) => {
  if (content.includes('播種') || content.includes('定植')) return '播種・定植';
  if (content.includes('収穫')) return '収穫実績';
  if (content.includes('出荷')) return '出荷管理';
  if (content.includes('防除') || content.includes('散布')) return '防除・散布';
  if (content.includes('肥料')) return '肥料投入';
  return 'その他作業';
};
</script>

<template>
  <div class="pc-dashboard animate-slide-up">
    <!-- Header Summary (KPIs) -->
    <div class="stats-grid">
      <!-- 今月の売上 -->
      <div class="stat-card glass p-4">
        <div class="flex items-center gap-4">
          <div class="stat-icon bg-blue-100 text-blue-600">
            <Banknote size="24" />
          </div>
          <div>
            <span class="label text-gray-500 text-sm font-medium">今月の売上（税込）</span>
            <div class="value text-2xl font-bold">¥{{ currentMonthRevenue.toLocaleString() }}</div>
            <div class="trend flex items-center gap-1 text-sm font-medium mt-1" :class="revenueGrowth >= 0 ? 'text-green-600' : 'text-red-500'">
              <component :is="revenueGrowth >= 0 ? TrendingUp : TrendingDown" size="14" />
              <span>前月比 {{ revenueGrowth >= 0 ? '+' : '' }}{{ revenueGrowth }}%</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 今月の出荷量 -->
      <div class="stat-card glass p-4">
        <div class="flex items-center gap-4">
          <div class="stat-icon bg-emerald-100 text-emerald-600">
            <Activity size="24" />
          </div>
          <div>
            <span class="label text-gray-500 text-sm font-medium">今月の出荷量</span>
            <div class="value text-2xl font-bold">{{ currentMonthVolume.toLocaleString() }} kg</div>
            <div class="trend flex items-center gap-1 text-sm font-medium mt-1" :class="volumeGrowth >= 0 ? 'text-green-600' : 'text-red-500'">
              <component :is="volumeGrowth >= 0 ? TrendingUp : TrendingDown" size="14" />
              <span>前月比 {{ volumeGrowth >= 0 ? '+' : '' }}{{ volumeGrowth }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 今年の累計売上 -->
      <div class="stat-card glass p-4">
        <div class="flex items-center gap-4">
          <div class="stat-icon bg-purple-100 text-purple-600">
            <BarChart3 size="24" />
          </div>
          <div>
            <span class="label text-gray-500 text-sm font-medium">{{ currentYearStr }}年 累計売上</span>
            <div class="value text-2xl font-bold">¥{{ currentYearRevenue.toLocaleString() }}</div>
            <div class="trend flex items-center gap-1 text-sm font-medium mt-1 text-gray-400">
              <span>納品書ベースで集計</span>
            </div>
          </div>
        </div>
      </div>

      <!-- アラート -->
      <div class="stat-card glass p-4 border-l-4" :class="unresolvedIssuesCount > 0 ? 'border-red-500' : 'border-blue-500'">
        <div class="flex items-center gap-4">
          <div class="stat-icon" :class="unresolvedIssuesCount > 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'">
            <AlertTriangle size="24" v-if="unresolvedIssuesCount > 0" />
            <CheckCircle size="24" v-else />
          </div>
          <div>
            <span class="label text-gray-500 text-sm font-medium">システム状況</span>
            <div v-if="unresolvedIssuesCount > 0">
              <div class="value text-lg font-bold text-red-600">未対応の指摘事項: {{ unresolvedIssuesCount }}件</div>
              <div class="trend flex items-center gap-1 text-sm font-medium mt-1 text-red-500">
                <span>至急対応が必要です</span>
              </div>
            </div>
            <div v-else>
              <div class="value text-lg font-bold text-green-600">すべて正常</div>
              <div class="trend flex items-center gap-1 text-sm font-medium mt-1 text-gray-400">
                <span>有効な資材証明: {{ validMaterialCertsCount }}件</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="main-grid">
      <!-- Left Column: Trend Chart -->
      <div class="column">
        <section class="card glass chart-card" style="min-height: 400px; display: flex; flex-direction: column;">
          <div class="section-header" style="margin-bottom: 1.5rem;">
            <BarChart3 size="20" class="text-primary" />
            <h3>売上・出荷量 推移（過去6ヶ月）</h3>
          </div>
          <div style="flex: 1; position: relative; min-height: 350px;">
            <Bar :data="chartData" :options="chartOptions" />
          </div>
        </section>
      </div>

      <!-- Right Column: Recent Activity -->
      <div class="column">
        <section class="card glass activity-log" style="height: 100%;">
          <div class="section-header">
            <Clock size="20" />
            <h3>最近の現場活動</h3>
            <button @click="actions.setActiveTab('history')" class="btn-text ml-auto">すべて表示 <ArrowRight size="14" /></button>
          </div>
          <div class="activity-list mt-2">
            <div v-if="state.records.t_work_record.length === 0" class="empty">
              記録がまだありません
            </div>
            <div v-for="w in recentWork" :key="w.id" class="activity-item group">
              <div class="time">{{ w.date }}</div>
              <div class="content flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="category-pill" :class="getEventCategory(w.content)">
                    {{ getCategoryLabel(w.content) }}
                  </span>
                  <strong class="text-gray-800">{{ state.masters.m_field.find(f => f.id === w.fieldId)?.name }}</strong>
                </div>
                <p class="text-gray-600 text-sm leading-relaxed">{{ w.content }}</p>
                <div class="flex items-center gap-2 mt-2">
                  <span class="worker bg-gray-100 px-2 py-1 rounded text-xs font-medium text-gray-500">
                    <Clock size="10" class="inline mr-1" />{{ w.workerName }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  border-radius: 12px;
  background: white;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-grid {
  display: grid;
  grid-template-columns: 2fr 1.2fr;
  gap: 1.5rem;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.section-header h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1e293b;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.activity-item:hover {
  background: white;
  border-color: #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
}

.activity-item .time {
  font-size: 0.8rem;
  font-weight: 700;
  color: #64748b;
  min-width: 80px;
  padding-top: 0.25rem;
}

.category-pill {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  background: #f1f5f9;
  color: #64748b;
}

.category-pill.seed { background: #dcfce7; color: #166534; }
.category-pill.harvest { background: #dbeafe; color: #1e40af; }
.category-pill.pest { background: #fef3c7; color: #92400e; }

.btn-text {
  background: transparent;
  color: var(--primary);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.btn-text:hover {
  text-decoration: underline;
}

/* Tailwinds Utility Fallbacks */
.flex { display: flex; }
.items-center { align-items: center; }
.gap-1 { gap: 0.25rem; }
.gap-2 { gap: 0.5rem; }
.gap-4 { gap: 1rem; }
.p-4 { padding: 1rem; }
.px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.mt-1 { margin-top: 0.25rem; }
.mt-2 { margin-top: 0.5rem; }
.mb-1 { margin-bottom: 0.25rem; }
.ml-auto { margin-left: auto; }
.flex-1 { flex: 1; }
.inline { display: inline; }
.mr-1 { margin-right: 0.25rem; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }
.text-2xl { font-size: 1.5rem; line-height: 2rem; }
.font-medium { font-weight: 500; }
.font-bold { font-weight: 700; }
.rounded { border-radius: 0.25rem; }
.border-l-4 { border-left-width: 4px; }
.border-red-500 { border-left-color: #ef4444; }
.border-blue-500 { border-left-color: #3b82f6; }
.text-gray-400 { color: #9ca3af; }
.text-gray-500 { color: #6b7280; }
.text-gray-600 { color: #4b5563; }
.text-gray-800 { color: #1f2937; }
.text-blue-600 { color: #2563eb; }
.text-emerald-600 { color: #059669; }
.text-purple-600 { color: #9333ea; }
.text-red-500 { color: #ef4444; }
.text-red-600 { color: #dc2626; }
.text-green-600 { color: #16a34a; }
.bg-blue-100 { background-color: #dbeafe; }
.bg-emerald-100 { background-color: #d1fae5; }
.bg-purple-100 { background-color: #f3e8ff; }
.bg-red-100 { background-color: #fee2e2; }
.bg-gray-100 { background-color: #f3f4f6; }
.leading-relaxed { line-height: 1.625; }
</style>
