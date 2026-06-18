<script setup>
import { computed, ref } from 'vue';
import { 
  BarChart3, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Calendar as CalendarIcon,
  Search,
  ArrowRight
} from 'lucide-vue-next';
import { state, actions } from '../../store';


const recentWork = computed(() => {
  let records = [...(state.records.t_work_record || [])];
  records.sort((a, b) => new Date(b.date) - new Date(a.date));
  // 監査モード中は監査期間のみ表示
  if (state.auditMode.active) {
    if (state.auditMode.startDate) records = records.filter(r => (r.date || '') >= state.auditMode.startDate);
    if (state.auditMode.endDate)   records = records.filter(r => (r.date || '') <= state.auditMode.endDate);
  }
  return records.slice(0, 5);
});
// 収穫専用テーブル（モバイルから入力）
const totalHarvest = computed(() => (state.records.t_harvest || []).reduce((sum, r) => sum + (Number(r.harvestWeight) || 0), 0));
const totalGraded  = computed(() => (state.records.t_harvest || []).reduce((sum, r) => sum + (Number(r.gradedWeight)  || 0), 0));
const totalWaste   = computed(() => (state.records.t_harvest || []).reduce((sum, r) => sum + (Number(r.wasteWeight)   || 0), 0));

// 納品書ベースの累計出荷量・累計売上（監査モード対応）
const totalDeliveredKg = computed(() => {
  let notes = state.records.t_delivery_note || [];
  if (state.auditMode.active) {
    if (state.auditMode.startDate) notes = notes.filter(n => (n.date || '') >= state.auditMode.startDate);
    if (state.auditMode.endDate)   notes = notes.filter(n => (n.date || '') <= state.auditMode.endDate);
  }
  return notes.reduce((sum, note) => {
    const kg = (note.itemDetails || [])
      .filter(i => (i.unit || '').toLowerCase() === 'kg')
      .reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    return sum + kg;
  }, 0);
});

const totalDeliveryRevenue = computed(() => {
  let notes = state.records.t_delivery_note || [];
  if (state.auditMode.active) {
    if (state.auditMode.startDate) notes = notes.filter(n => (n.date || '') >= state.auditMode.startDate);
    if (state.auditMode.endDate)   notes = notes.filter(n => (n.date || '') <= state.auditMode.endDate);
  }
  return notes.reduce((sum, note) => sum + (Number(note.amount) || 0), 0);
});

// JAS Seal Ledger Totals (For stock alerts)
const sealTotals = computed(() => {
  const logs = state.records.t_jas_seal_record || [];
  const purchased = logs.filter(l => l.type === 'purchase').reduce((sum, l) => sum + Number(l.qty), 0);
  const used = logs.filter(l => l.type === 'use').reduce((sum, l) => sum + Number(l.qty), 0);
  const damaged = logs.filter(l => l.type === 'damage').reduce((sum, l) => sum + Number(l.qty), 0);
  const stock = purchased - used - damaged;
  return { purchased, used, damaged, stock };
});

// 🌟【JAS動的KPI集計エンジン (v3.1.4)】
// 1. 未対応の不適合指摘事項の件数を動的カウント（dateSolved が空のもの）
const unresolvedIssuesCount = computed(() => {
  const list = state.records.t_corrective_action_record || [];
  return list.filter(item => !item.dateSolved).length;
});

// 2. 有効な資材証明書の件数を動的カウント
const validMaterialCertsCount = computed(() => {
  const list = state.masters.m_material || [];
  const todayStr = new Date().toISOString().split('T')[0];
  return list.filter(item => item.certUrl && (!item.expiry || item.expiry >= todayStr)).length;
});

const stats = computed(() => [
  { label: '累計出荷量', value: `${totalDeliveredKg.value.toFixed(1)} kg`, icon: BarChart3, color: 'var(--primary)' },
  { label: '未対応の指摘事項', value: `${unresolvedIssuesCount.value} 件`, icon: AlertTriangle, color: 'var(--accent)' },
  { label: '有効な資材証明', value: `${validMaterialCertsCount.value} 件`, icon: CheckCircle, color: '#3b82f6' },
]);


const currentYear = ref(new Date().getFullYear());
const currentMonth = ref(new Date().getMonth()); // 0-11
const selectedDate = ref(new Date());

const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

const prevMonth = () => {
  if (currentMonth.value === 0) {
    currentMonth.value = 11;
    currentYear.value--;
  } else {
    currentMonth.value--;
  }
};

const nextMonth = () => {
  if (currentMonth.value === 11) {
    currentMonth.value = 0;
    currentYear.value++;
  } else {
    currentMonth.value++;
  }
};

const daysInMonth = computed(() => {
  const year = currentYear.value;
  const month = currentMonth.value;
  
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevTotalDays = new Date(year, month, 0).getDate();
  
  const days = [];
  
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    days.push({
      day: prevTotalDays - i,
      month: month === 0 ? 11 : month - 1,
      year: month === 0 ? year - 1 : year,
      isCurrentMonth: false
    });
  }
  
  for (let i = 1; i <= totalDays; i++) {
    days.push({
      day: i,
      month: month,
      year: year,
      isCurrentMonth: true
    });
  }
  
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({
      day: i,
      month: month === 11 ? 0 : month + 1,
      year: month === 11 ? year + 1 : year,
      isCurrentMonth: false
    });
  }
  
  return days;
});

const getEventsForDay = (y, m, d) => {
  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return (state.records.t_work_record || []).filter(r => r.date === dateStr);
};

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

const selectedEvents = computed(() => {
  const y = selectedDate.value.getFullYear();
  const m = selectedDate.value.getMonth();
  const d = selectedDate.value.getDate();
  return getEventsForDay(y, m, d);
});

const selectDay = (dayObj) => {
  selectedDate.value = new Date(dayObj.year, dayObj.month, dayObj.day);
};

const isSameDay = (dayObj, dateObj) => {
  return dayObj.year === dateObj.getFullYear() && 
         dayObj.month === dateObj.getMonth() && 
         dayObj.day === dateObj.getDate();
};

const isToday = (dayObj) => {
  const now = new Date();
  return dayObj.year === now.getFullYear() && 
         dayObj.month === now.getMonth() && 
         dayObj.day === now.getDate();
};
</script>

<template>
  <div class="pc-dashboard animate-slide-up">
    <!-- Header Summary -->
    <div class="stats-grid">
      <div v-for="s in stats" :key="s.label" class="card glass stat-card">
        <div class="stat-icon" :style="{ backgroundColor: s.color + '22', color: s.color }">
          <component :is="s.icon" size="24" />
        </div>
        <div class="stat-info">
          <span class="label">{{ s.label }}</span>
          <span class="value">{{ s.value }}</span>
        </div>
      </div>
      <div class="stat-card glass">
        <span class="label">累計出荷量</span>
        <div class="val">{{ totalDeliveredKg.toFixed(1) }} <small>kg</small></div>
        <div class="trend up" style="color:#10b981;">納品書から集計</div>
      </div>
      <div class="stat-card glass">
        <span class="label">累計売上</span>
        <div class="val" style="font-size:1.1rem;">¥{{ totalDeliveryRevenue.toLocaleString() }}</div>
        <div class="trend up" style="color:#10b981;">納品書（税込）</div>
      </div>
    </div>

    <div class="main-grid">
      <!-- Left Column: Alerts & Status -->
      <div class="column">
        <section class="card glass calendar-card">
          <div class="section-header">
            <CalendarIcon size="20" class="text-primary" />
            <h3>JAS栽培計画スケジュール</h3>
            <div class="calendar-nav ml-auto">
              <button @click="prevMonth" class="btn-arrow">&lt;</button>
              <span class="month-title">{{ currentYear }}年 {{ monthNames[currentMonth] }}</span>
              <button @click="nextMonth" class="btn-arrow">&gt;</button>
            </div>
          </div>
          
          <div class="calendar-grid">
            <!-- Week Header -->
            <div class="weekdays">
              <span v-for="d in ['日', '月', '火', '水', '木', '金', '土']" :key="d" :class="{ sat: d==='土', sun: d==='日' }">{{ d }}</span>
            </div>
            
            <!-- Days Grid -->
            <div class="days">
              <div 
                v-for="(d, idx) in daysInMonth" 
                :key="idx" 
                class="day-cell"
                :class="{ 
                  'other-month': !d.isCurrentMonth, 
                  'selected': isSameDay(d, selectedDate),
                  'today': isToday(d)
                }"
                @click="selectDay(d)"
              >
                <span class="day-num">{{ d.day }}</span>
                <!-- Dots for Events -->
                <div class="event-dots">
                  <span 
                    v-for="e in getEventsForDay(d.year, d.month, d.day).slice(0, 3)" 
                    :key="e.id" 
                    class="dot" 
                    :class="getEventCategory(e.content)"
                  ></span>
                </div>
              </div>
            </div>
          </div>
          
        </section>
      </div>

      <!-- Right Column: Selected Day Activity -->
      <div class="column">
        <section class="card glass activity-log">
          <div class="section-header">
            <Clock size="20" />
            <h3>{{ selectedDate.getFullYear() }}年{{ selectedDate.getMonth() + 1 }}月{{ selectedDate.getDate() }}日の現場活動</h3>
            <button @click="actions.setActiveTab('history')" class="btn-text">すべて表示 <ArrowRight size="14" /></button>
          </div>
          <div class="activity-list">
            <div v-if="selectedEvents.length === 0" class="empty">
              この日の活動記録はありません
            </div>
            <div v-for="e in selectedEvents" :key="e.id" class="activity-item">
              <div class="time">
                <span class="category-pill" :class="getEventCategory(e.content)">
                  {{ getCategoryLabel(e.content) }}
                </span>
              </div>
              <div class="content">
                <strong>{{ state.masters.m_field.find(f => f.id === e.fieldId)?.name || '' }}</strong>
                <p>{{ e.content }}</p>
                <span class="worker"><Clock size="12" style="display:inline; margin-right: 4px;" />担当者: {{ e.workerName }}</span>
              </div>
              <div class="status-badge washed">完了</div>
            </div>
          </div>
        </section>

        <!-- Right Column: Recent Activity (Restored) -->
        <section class="card glass activity-log" style="margin-top: 1.5rem;">
          <div class="section-header">
            <Clock size="20" />
            <h3>最近の現場活動（全体）</h3>
            <button @click="actions.setActiveTab('history')" class="btn-text">すべて表示 <ArrowRight size="14" /></button>
          </div>
          <div class="activity-list">
            <div v-if="state.records.t_work_record.length === 0" class="empty">
              記録がまだありません
            </div>
            <div v-for="w in recentWork" :key="w.id" class="activity-item">
              <div class="time" style="width: 80px;">{{ w.date }}</div>
              <div class="content">
                <strong>{{ state.masters.m_field.find(f => f.id === w.fieldId)?.name }}</strong>
                <p>{{ w.content }}</p>
                <span class="worker"><Clock size="12" style="display:inline; margin-right: 4px;" />担当者: {{ w.workerName }}</span>
              </div>
              <div class="status-badge washed">完了</div>
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
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-info .label {
  display: block;
  font-size: 0.875rem;
  color: var(--text-soft);
  font-weight: 500;
}

.stat-info .value {
  font-size: 1.5rem;
  font-weight: 800;
}

.main-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
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
  margin-bottom: 1.25rem;
}

.section-header h3 {
  font-size: 1.1rem;
  font-weight: 700;
  margin-right: auto;
}

.icon-warning { color: var(--accent); }

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.alert-item {
  padding: 1rem;
  border-radius: var(--radius-sm);
  border-left: 4px solid #ccc;
  background: var(--bg-surface);
}

.alert-item.warning { border-left-color: var(--accent); }
.alert-item.info { border-left-color: #3b82f6; }

.alert-item p {
  font-size: 0.9rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.alert-item .date {
  font-size: 0.75rem;
  color: var(--text-soft);
}

.activity-list {
  display: flex;
  flex-direction: column;
}

.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--glass-border);
}

.activity-item:last-child { border-bottom: none; }

.activity-item .time {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-soft);
  min-width: 80px;
}

.activity-item .content strong {
  display: block;
  font-size: 0.95rem;
}

.activity-item .content p {
  font-size: 0.875rem;
  color: var(--text-soft);
}

.status-badge {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-full);
}

.status-badge.washed {
  background: hsla(142, 60%, 25%, 0.1);
  color: var(--primary);
}

.btn-text {
  background: transparent;
  color: var(--primary);
  font-size: 0.85rem;
  padding: 0;
}

.placeholder-calendar {
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--text-soft);
}

/* Sync Card Styles */
.sync-card {
  border-left: 4px solid #3b82f6 !important;
  margin-bottom: 1.5rem;
}

.sync-card .section-header {
  margin-bottom: 0.75rem;
}

.sync-card .dot {
  width: 10px;
  height: 10px;
  background: #94a3b8;
  border-radius: 50%;
  margin-left: 0.5rem;
}

.sync-card .dot.green {
  background: #10b981;
  box-shadow: 0 0 10px #10b981;
}

.status-text {
  font-size: 0.85rem;
  color: var(--text-soft);
  margin-bottom: 1rem;
  font-weight: 600;
}

.sync-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.btn-sync-pc {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.6rem;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.btn-sync-pc.upload {
  background: #3b82f6;
  color: white;
}

.btn-sync-pc.download {
  background: transparent;
  border-color: #f59e0b;
  color: #f59e0b;
}

.btn-sync-pc:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.btn-sync-pc:active {
  transform: translateY(0);
}

.text-blue {
  color: #3b82f6 !important;
}

/* ==========================================
 * Premium Live Calendar Styles (v2.4.0)
 * ========================================== */
.calendar-card {
  padding-bottom: 1.5rem !important;
}

.ml-auto {
  margin-left: auto;
}

.calendar-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-arrow {
  background: rgba(0, 0, 0, 0.05);
  border: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.85rem;
  transition: all 0.2s;
  color: var(--text-main);
}
.btn-arrow:hover {
  background: var(--primary);
  color: white;
}

.month-title {
  font-size: 0.85rem;
  font-weight: 800;
  min-width: 80px;
  text-align: center;
}

.calendar-grid {
  background: var(--bg-surface, #f8fafc);
  border-radius: 12px;
  padding: 0.75rem;
  border: 1px solid var(--glass-border, #e2e8f0);
}

.weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--text-soft, #64748b);
  margin-bottom: 0.5rem;
}
.weekdays .sat { color: #2563eb; }
.weekdays .sun { color: #dc2626; }

.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}

.day-cell {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 0.2rem;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  border: 1px solid rgba(0,0,0,0.02);
}
.day-cell:hover {
  background: var(--primary-glow, #f0fdf4);
  transform: scale(1.05);
}

.day-cell.other-month {
  color: #cbd5e1;
}

.day-cell.selected {
  background: var(--primary) !important;
  color: white !important;
}

.day-cell.today {
  border: 2px solid var(--primary);
}

.day-num {
  font-size: 0.75rem;
  font-weight: 800;
}

.event-dots {
  display: flex;
  gap: 2px;
  height: 4px;
}

.event-dots .dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
}
.event-dots .dot.seed { background: #16a34a; }
.event-dots .dot.harvest { background: #3b82f6; }
.event-dots .dot.pest { background: #f59e0b; }
.event-dots .dot.other { background: #64748b; }

/* Day Details Styles */
.day-details {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed var(--glass-border, #e2e8f0);
  animation: slide-up-soft 0.3s ease-out;
}

.details-title {
  font-size: 0.8rem;
  font-weight: 800;
  color: #475569;
  margin-bottom: 0.75rem;
}

.no-events {
  font-size: 0.75rem;
  color: var(--text-soft, #64748b);
  text-align: center;
  padding: 1rem 0;
}

.event-list {
  max-height: 200px;
  overflow-y: auto;
}

.detail-event-item {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 8px;
  background: white;
  margin-bottom: 0.4rem;
  border: 1px solid var(--glass-border, #e2e8f0);
  border-left: 4px solid #64748b;
  transition: all 0.2s;
  align-items: center;
}
.detail-event-item:hover {
  transform: translateX(2px);
}

.detail-event-item.seed { border-left-color: #16a34a; }
.detail-event-item.harvest { border-left-color: #3b82f6; }
.detail-event-item.pest { border-left-color: #f59e0b; }

.category-pill {
  font-size: 0.6rem;
  font-weight: 900;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  background: #f1f5f9;
  color: #64748b;
  white-space: nowrap;
}
.category-pill.seed { background: #dcfce7; color: #166534; }
.category-pill.harvest { background: #dbeafe; color: #1e40af; }
.category-pill.pest { background: #fef3c7; color: #92400e; }

.event-main {
  flex: 1;
}
.event-main strong {
  display: block;
  font-size: 0.8rem;
  color: #1e293b;
}
.event-main p {
  font-size: 0.75rem;
  color: #475569;
  margin: 0.05rem 0;
}
.event-main .worker {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.65rem;
  color: #94a3b8;
  font-weight: 700;
}


.alert-empty {
  padding: 1.5rem;
  text-align: center;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(22, 163, 74, 0.15);
  background: rgba(22, 163, 74, 0.03);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0.5rem 0;
  animation: slide-up-soft 0.3s ease-out;
}
.alert-empty .empty-icon {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}
.alert-empty p {
  font-size: 0.85rem;
  font-weight: 800;
  color: #15803d;
  margin: 0;
}
.alert-empty .empty-desc {
  font-size: 0.725rem;
  color: #64748b;
  font-weight: 500;
  line-height: 1.4;
}

@keyframes slide-up-soft {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
