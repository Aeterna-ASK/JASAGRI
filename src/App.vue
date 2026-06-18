<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  FileText,
  Settings,
  Smartphone,
  Monitor,
  Library,
  Layers,
  FileDigit,
  ExternalLink,
  Bug,
  Truck,
  ShieldCheck,
  Plus,
  Camera,
  X,
  Tractor,
  Grape,
  Bell,
  CheckCircle2,
  AlertTriangle,
  CloudRain,
  Sun,
  Cloud,
  Droplets,
  Thermometer,
  ChevronDown,
  Menu,
  Trash2,
  Inbox,
  CalendarDays
} from 'lucide-vue-next';
import { state, actions } from './store';
import logoUrl from './assets/logo.png';

// Import Views
import MobileWorkRecord from './views/Mobile/WorkRecord.vue';
import MobileHarvestRecord from './views/Mobile/HarvestRecord.vue';
import PCDashboard from './views/PC/Dashboard.vue';
import PCDocumentCenter from './views/PC/DocumentCenter.vue';
import PCManualLibrary from './views/PC/ManualLibrary.vue';
import PCMasterManagement from './views/PC/MasterManagement.vue';
import PCDeliveryNotes from './views/PC/DeliveryNotes.vue';
import PCWorkHistory from './views/PC/WorkHistory.vue';
import PCPurchaseHistory from './views/PC/PurchaseHistory.vue';
import PCScanInbox from './views/PC/ScanInbox.vue';
import PCAnnualPlan from './views/PC/AnnualPlan.vue';
import MobileSettings from './views/Mobile/Settings.vue';
import MobilePestGuide from './views/Mobile/PestGuide.vue';
import MobileMaterialReceipt from './views/Mobile/MaterialReceipt.vue';
import MobileDeliveryQuick from './views/Mobile/DeliveryQuick.vue';
import PCAuditViewer from './views/PC/AuditViewer.vue';

const isPCSidebarOpen = ref(false); // サイドメニューはデフォルトで閉じておく（オーバーレイ表示のため）
const weatherView = ref('today'); // 'today' or 'weekly'
const isActionMenuOpen = ref(false);


// Navigation Items
const navItems = computed(() => {
  if (state.viewMode === 'mobile') {
    return [
      { id: 'dashboard', label: 'ホーム', icon: LayoutDashboard },
      { id: 'work', label: '作業', icon: ClipboardList },
      { id: 'pest', label: '防除', icon: Bug },
      { id: 'm-settings', label: '設定', icon: Settings },
    ];
  } else {
    return [
      { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
      { id: 'history', label: '作業記録', icon: ClipboardList },
      { id: 'inbox', label: 'スキャン受信トレイ', icon: Inbox },
      { id: 'masters', label: 'マスタ・資材管理', icon: Settings },
      { id: 'purchases', label: '資材購入・証憑台帳', icon: Layers },
      { id: 'delivery', label: '出荷・納品管理', icon: FileText },
      { id: 'annualplan', label: '年間生産予定表', icon: CalendarDays },
      { id: 'audit',     label: '監査管理',         icon: ShieldCheck },
      { id: 'documents', label: '監査ドキュメント', icon: FileDigit },
      { id: 'library', label: 'マニュアル・規定', icon: Library },
    ];
  }
});

const viewMode = computed(() => state.viewMode);

const toggleViewMode = () => {
  const newMode = state.viewMode === 'mobile' ? 'pc' : 'mobile';
  actions.setViewMode(newMode);
  setTab('dashboard');
};

const setTab = (id) => {
  state.activeTab = id;
  window.scrollTo({ top: 0, behavior: 'instant' });
  
  // 💡 タブを選択した瞬間にサイドバーを自動で隠す（閉じる）
  isPCSidebarOpen.value = false;
};

// Component Mapping
const activeComponent = computed(() => {
  if (state.viewMode === 'mobile') {
    if (state.activeTab === 'work') return MobileWorkRecord;
    if (state.activeTab === 'pest') return MobilePestGuide;
    if (state.activeTab === 'receipt') return MobileMaterialReceipt;
    if (state.activeTab === 'harvest') return MobileHarvestRecord;
    if (state.activeTab === 'delivery') return MobileDeliveryQuick;
    if (state.activeTab === 'm-settings') return MobileSettings;
    return null; // For dashboard-mobile or others
  } else {
    if (state.activeTab === 'dashboard') return PCDashboard;
    if (state.activeTab === 'inbox') return PCScanInbox;
    if (state.activeTab === 'masters') return PCMasterManagement;
    if (state.activeTab === 'delivery') return PCDeliveryNotes;
    if (state.activeTab === 'documents') return PCDocumentCenter;
    if (state.activeTab === 'library') return PCManualLibrary;
    if (state.activeTab === 'history') return PCWorkHistory;
    if (state.activeTab === 'purchases') return PCPurchaseHistory;
    if (state.activeTab === 'annualplan') return PCAnnualPlan;
    if (state.activeTab === 'audit')     return PCAuditViewer;
    return null;
  }
});

// --- 種苗棚卸しモーダル ---
const isSeedInventoryModalOpen = ref(false);
const seedInventoryList = ref([]);

const openSeedInventoryModal = () => {
  const uniqueItems = new Map();
  
  // 💡 過去半年（6ヶ月）前の基準日を設定
  const halfYearAgo = new Date();
  halfYearAgo.setMonth(halfYearAgo.getMonth() - 6);
  
  const isWithinHalfYear = (dateStr) => {
    if (!dateStr) return true; // 日付なしは念のため含める
    try {
      const d = new Date(dateStr);
      return d >= halfYearAgo;
    } catch {
      return true;
    }
  };
  
  // 1. 資材受入記録（t_material_receipt）から「過去半年以内」に購入された実商品を全抽出
  //    適合証明書 / その他書類（category='その他'かつ証明系 docType）は棚卸対象外とする
  const INVENTORY_CATEGORIES = new Set(['種苗', '肥料・農薬', '資材']);
  const INVENTORY_DOCTYPES = new Set(['種苗納品書', '肥料・農薬納品書', '資材適合書', '納品書']);
  const receipts = (state.records.t_material_receipt || []).filter(r =>
    r.materialName &&
    r.docType !== '資材・適合証明書' &&
    (INVENTORY_CATEGORIES.has(r.category) || INVENTORY_DOCTYPES.has(r.docType))
  );
  receipts.forEach(r => {
    if (r.materialName && isWithinHalfYear(r.date)) {
      const key = r.materialName;
      let cat = r.category || '資材';
      if (cat === '肥料' || cat === '農薬') {
        cat = '肥料・農薬';
      }
      
      if (!uniqueItems.has(key)) {
        uniqueItems.set(key, {
          materialName: r.materialName,
          category: cat,
          purchaseDate: r.date || '',
          supplier: r.supplier || r.partnerName || '未指定の仕入先',
          quantityBought: r.quantity || '不明',
          stockQuantity: ''
        });
      } else {
        // 最新の購入履歴でマージ
        const existing = uniqueItems.get(key);
        if (new Date(r.date) > new Date(existing.purchaseDate)) {
          existing.purchaseDate = r.date;
          existing.supplier = r.supplier || r.partnerName || '未指定の仕入先';
          existing.quantityBought = r.quantity || '不明';
        }
      }
    }
  });
  
  // 2. 保存済みの棚卸データ（t_seed_inventory）の在庫数をマッピング（半年より前でも、保存済みのものはリストに残す）
  const currentInventories = state.records.t_seed_inventory || [];
  currentInventories.forEach(inv => {
    if (uniqueItems.has(inv.materialName)) {
      uniqueItems.get(inv.materialName).stockQuantity = inv.stockQuantity;
    } else {
      uniqueItems.set(inv.materialName, {
        materialName: inv.materialName,
        category: inv.category || '種苗',
        purchaseDate: inv.purchaseDate || '',
        supplier: inv.supplier || '',
        quantityBought: inv.quantityBought || '',
        stockQuantity: inv.stockQuantity
      });
    }
  });
  
  seedInventoryList.value = Array.from(uniqueItems.values());
  showAddForm.value = false;
  newInventoryItem.value = { materialName: '', category: '種苗', quantityBought: '', supplier: '' };
  isSeedInventoryModalOpen.value = true;
};

// 💡 明示的なリスト除外（削除）ハンドラー
const removeInventoryItem = (materialName) => {
  seedInventoryList.value = seedInventoryList.value.filter(item => item.materialName !== materialName);
};

// 手動追加フォーム
const showAddForm = ref(false);
const newInventoryItem = ref({ materialName: '', category: '種苗', quantityBought: '', supplier: '' });

const addInventoryItem = () => {
  const name = newInventoryItem.value.materialName.trim();
  if (!name) {
    actions.showToast('資材・種苗名を入力してください', 'warning');
    return;
  }
  if (seedInventoryList.value.some(i => i.materialName === name)) {
    actions.showToast(`「${name}」はすでにリストにあります`, 'warning');
    return;
  }
  seedInventoryList.value.push({
    materialName: name,
    category: newInventoryItem.value.category || '種苗',
    quantityBought: newInventoryItem.value.quantityBought || '',
    supplier: newInventoryItem.value.supplier || '',
    purchaseDate: '',
    stockQuantity: ''
  });
  newInventoryItem.value = { materialName: '', category: '種苗', quantityBought: '', supplier: '' };
  showAddForm.value = false;
};

const saveSeedInventory = () => {
  actions.saveSeedInventories(seedInventoryList.value);
  isSeedInventoryModalOpen.value = false;
};

// 3時間ごとに防除アラートと天気を自動再取得
const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;
let refreshTimer = null;

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});

onMounted(() => {
  // Firestore同期初期化
  actions.initSync();

  if (import.meta.env.DEV) console.log('Orgaly: 起動時に最新情報を更新中...');
  actions.refreshMarketData();

  // 3時間ごとにバックグラウンドで静かに再取得
  refreshTimer = setInterval(() => {
    actions.refreshMarketData();
  }, REFRESH_INTERVAL_MS);

  // 戻るボタンの制御 (PWA/Mobile用) - ホームでも閉じないように超強化
  const pushGuardState = () => {
    if (!window.history.state || !window.history.state.orgalyGuard) {
      window.history.pushState({ orgalyGuard: true }, null, window.location.href);
    }
  };
  
  // 起動時にスタックを1件積む（popstate内で都度補充するので連打登録は不要）
  pushGuardState();

  window.onpopstate = function (event) {
    // 戻るが押されたら、何はともあれ即座にスタックを補充
    pushGuardState();

    if (isActionMenuOpen.value) {
      isActionMenuOpen.value = false;
    } else if (state.viewMode === 'mobile' && state.activeTab !== 'dashboard') {
      state.activeTab = 'dashboard';
    } else {
      // ホームにいる場合は案内を出す
      if (typeof actions?.showToast === 'function') {
        actions.showToast('アプリを終了するにはタスク一覧から閉じてください', 'info');
      }
    }
  };
});
</script>

<template>
  <div class="app-container" :class="`mode-${viewMode}`">
    <!-- Header -->
    <header :class="[viewMode === 'pc' ? 'pc-header glass' : 'header-mobile-v2', 'animate-slide-up']">
      <div v-if="viewMode === 'pc'" class="header-inner">
        <div class="header-left">
          <button class="btn-pc-menu" @click="isPCSidebarOpen = !isPCSidebarOpen">
            <Menu size="24" color="#ffffff" />
          </button>
          <img :src="logoUrl" alt="Orgaly Logo" class="global-logo-pc" @click="setTab('dashboard')" />
        </div>
        <div class="header-right">
          <div class="sync-status" :class="{ online: state.isCloudConnected, loading: state.isInitialLoading }">
            <span class="sync-dot"></span>
            <span class="sync-text">{{ state.isInitialLoading ? '同期中...' : (state.isCloudConnected ? 'クラウド接続済み' : 'オフライン') }}</span>
          </div>
          <div class="version-badge">Ver 5.3.0</div>
          <button
            v-if="state.auditMode.active"
            @click="state.activeTab = 'audit'"
            class="audit-mode-chip"
            title="監査管理画面へ"
          >📋 {{ state.auditMode.label }}</button>
          <button @click="toggleViewMode" class="btn-toggle glass">
            <component :is="viewMode === 'mobile' ? Monitor : Smartphone" size="18" />
            <span>{{ viewMode === 'mobile' ? 'PCへ切り替え' : '現場モード' }}</span>
          </button>
        </div>
      </div>
      
      <!-- Mobile V2 Header -->
      <div v-else class="header-mobile-content">
        <div class="header-bg-top"></div>
        <div class="header-mobile-top-bar">
          <div class="sync-status mini" :class="{ online: state.isCloudConnected, loading: state.isInitialLoading }">
            <span class="sync-dot"></span>
            <span class="sync-text">{{ state.isInitialLoading ? '同期中' : (state.isCloudConnected ? 'クラウド同期中' : 'オフライン') }}</span>
          </div>
          <div class="version-badge-mini">Ver 5.2.0</div>
        </div>
        <div class="logo-card-v2 glass-white animate-pop">
          <img :src="logoUrl" alt="Orgaly Logo" class="global-logo-mobile" />
        </div>
      </div>
    </header>

    <!-- Navigation (PC Sidebar) -->
    <div v-if="viewMode === 'pc'" class="pc-layout">
      <Transition name="slide-left">
        <aside class="sidebar glass" v-if="isPCSidebarOpen">
          <div class="sidebar-header pc-only">
            <button class="btn-close-sidebar" @click="isPCSidebarOpen = false"><X /></button>
          </div>
          <nav class="sidebar-nav">
            <button 
              v-for="item in navItems" 
              :key="item.id" 
              @click="setTab(item.id)"
              :class="{ active: state.activeTab === item.id }"
            >
              <component :is="item.icon" size="20" />
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <span>{{ item.label }}</span>
                <span v-if="item.id === 'inbox' && state.records.t_inbox_documents && state.records.t_inbox_documents.length" class="badge-inbox">
                  {{ state.records.t_inbox_documents.length }}
                </span>
              </div>
            </button>
          </nav>
          <div class="sidebar-divider"></div>
          <div class="header-right">
            <div class="user-badge glass">
              <div class="avatar">👨‍🌾</div>
              <span>管理者：{{ state.farmInfo.name || state.user.name }}</span>
            </div>
          </div>
        </aside>
      </Transition>
      <Transition name="fade">
        <div v-if="isPCSidebarOpen" class="sidebar-overlay" @click="isPCSidebarOpen = false"></div>
      </Transition>
    </div>

    <!-- Main Content Area -->
    <main class="main-content" :class="{ 'with-sidebar': viewMode === 'pc' && isPCSidebarOpen, 'mobile-main-v2': viewMode === 'mobile' }">
      <!-- Mobile Dashboard Special Handling -->
      <section v-if="state.viewMode === 'mobile' && state.activeTab === 'dashboard'" class="animate-slide-up">
        
        <div class="greeting-v2">
          <h2>こんにちは、{{ state.farmInfo.name || state.user.name }}さん</h2>
        </div>

        <!-- Weather Forecast Section -->
        <div class="weather-card-v2 card glass mb-2 animate-slide-up">
          <div class="weather-header">
            <div class="weather-header-left">
              <h3>天気予報</h3>
              <div class="weather-view-tabs">
                <button @click="weatherView = 'today'" :class="{ active: weatherView === 'today' }">今日</button>
                <button @click="weatherView = 'weekly'" :class="{ active: weatherView === 'weekly' }">週間</button>
              </div>
            </div>
            <div class="weather-loc">
              <span>{{ state.weather.location }}</span>
              <ChevronDown size="16" />
            </div>
          </div>
          
          <!-- Today View -->
          <div v-if="weatherView === 'today'" class="animate-fade-in">
            <div class="weather-main">
              <div class="weather-info-left">
                <span class="weather-date">{{ state.weather.date }}</span>
                <div class="weather-icon-wrap">
                  <CloudRain v-if="state.weather.summary.includes('雨')" size="64" class="icon-weather" />
                  <Sun v-else-if="state.weather.summary.includes('晴')" size="64" class="icon-weather" />
                  <Cloud v-else size="64" class="icon-weather" />
                </div>
              </div>
              <div class="weather-info-right">
                <div class="weather-summary-box">
                  <span>{{ state.weather.summary }}</span>
                </div>
                <div class="temp-box">
                  <div class="temp-high">
                    <span class="val">{{ state.weather.tempHigh }}</span><span class="unit">°C</span>
                  </div>
                  <div class="temp-low">
                    <span class="val">{{ state.weather.tempLow }}</span><span class="unit">°C</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="precipitation-grid">
              <div v-for="item in state.weather.precipitation" :key="item.time || item.id" class="precip-item">
                <span class="p-time">{{ item.time || item.id }}</span>
                <span class="p-chance">{{ item.chance }}%</span>
              </div>
            </div>
          </div>

          <!-- Weekly View -->
          <div v-else class="weather-weekly-list animate-fade-in">
            <div v-for="day in state.weather.weeklyForecast" :key="day.date" class="weekly-row">
              <div class="w-date-col">
                <span class="w-date">{{ day.date }}</span>
                <span class="w-day" :class="{ 'text-blue': day.day === '土', 'text-red': day.day === '日' }">({{ day.day }})</span>
              </div>
              <div class="w-icon-col">
                <CloudRain v-if="day.summary.includes('雨')" size="20" class="icon-weather" />
                <Sun v-else-if="day.summary.includes('晴')" size="20" class="icon-sun" />
                <Cloud v-else size="20" class="icon-cloud" />
              </div>
              <div class="w-summary-col">{{ day.summary }}</div>
              <div class="w-temp-col">
                <span class="w-high">{{ day.tempHigh }}</span>
                <span class="w-low">{{ day.tempLow }}</span>
              </div>
              <div class="w-chance-col">
                <Droplets size="12" />
                <span>{{ day.chance }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Regional Alert Section (Updated URL) -->
        <div class="regional-alert-section mb-2 animate-slide-up">
          <div class="section-title">
            <AlertTriangle size="18" class="icon-pulse" />
            <h4>鹿児島県病害虫防除アラート</h4>
            <a href="https://www.pref.kagoshima.jp/ag13/kiad/boujosho/yosatu.html" target="_blank" class="link-external"><ExternalLink size="14" /></a>
          </div>
          <div class="alert-cards-scroll">
            <div v-for="alert in state.regionalAlerts" :key="alert.id" class="alert-card-mini card glass accent">
              <span class="type">{{ alert.title }}</span>
              <span class="loc">{{ alert.location }}</span>
              <span class="date">{{ alert.date }}</span>
            </div>
          </div>
        </div>

        <!-- Action Grid V2 -->
        <div class="action-list-v2">
          <button @click="setTab('work')" class="action-btn-v2 dark-green">
            <div class="btn-icon"><Tractor size="28" /></div>
            <span>作業・機材洗浄を記録</span>
          </button>
          
          <button @click="setTab('harvest')" class="action-btn-v2 light-green">
            <div class="btn-icon"><Grape size="28" /></div>
            <span>収穫・JAS格付を記録</span>
          </button>
          
          <button @click="setTab('receipt')" class="action-btn-v2 lightest-green">
            <div class="btn-icon"><Camera size="28" /></div>
            <span>資材受入・納品書撮影</span>
          </button>
          
          <button @click="setTab('delivery')" class="action-btn-v2 orange">
            <div class="btn-icon"><Truck size="28" /></div>
            <span>納品書を発行</span>
          </button>

          <button @click="openSeedInventoryModal" class="action-btn-v2 purple">
            <div class="btn-icon"><Library size="28" /></div>
            <span>種苗棚卸（繰越在庫）</span>
          </button>
        </div>

        <!-- Audit Status -->
        <div class="audit-status-v2 glass mt-2">
          <div class="status-inner">
            <span>有機JAS監査ステータス：</span>
            <div class="status-indicator">
              <span class="dot green"></span>
              <strong>良好</strong>
            </div>
          </div>
        </div>

        <!-- View Mode Switch (Mobile to PC) -->
        <section class="view-mode-section">
          <button class="btn-switch-pc glass" @click="actions.setViewMode('pc')">
            <Monitor size="18" />
            <span>PC管理画面（タブレットモード）で表示</span>
          </button>
        </section>
      </section>
      
      <!-- Dynamic Content -->
      <component v-else :is="activeComponent" />
    </main>

    <!-- Navigation (Mobile Bottom Bar) -->
    <nav class="nav-bar glass" v-if="viewMode === 'mobile'">
      <div class="nav-bar-inner">
        <button 
          v-for="item in navItems" 
          :key="item.id" 
          @click="setTab(item.id)"
          :class="{ active: state.activeTab === item.id }"
        >
          <component :is="item.icon" size="24" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </nav>

    <footer v-if="viewMode === 'pc'" class="pc-footer glass">
      <div class="footer-inner">
        <p>&copy; 2026 Orgaly（オーガリー） | 有機JASのための畑のカルテ</p>
        <div class="footer-links">
          <span>プライバシー</span>
          <span>サポート</span>
        </div>
      </div>
    </footer>

    <!-- Global Toast -->
    <Transition name="fade">
      <div v-if="state.toast.show" class="global-toast" :class="state.toast.type">
        {{ state.toast.message }}
      </div>
    </Transition>

    <!-- Seed Inventory Modal -->
    <Transition name="fade">
      <div v-if="isSeedInventoryModalOpen" class="modal-overlay" @click="isSeedInventoryModalOpen = false"></div>
    </Transition>
    <Transition name="slide-up">
      <div v-if="isSeedInventoryModalOpen" class="inventory-modal glass-white">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <Library class="title-icon text-purple" />
            <h3>繰越資材・種苗棚卸（繰越在庫）</h3>
          </div>
          <button class="btn-close" @click="isSeedInventoryModalOpen = false"><X size="20" /></button>
        </div>
        
        <div class="modal-body">
          <p class="modal-intro mb-3">
            過去の受入（納品書）から自動抽出した「実購入の資材・種苗」一覧です。手元に残っている在庫量（繰越数）を入力してください。
          </p>
          
          <div class="inventory-cards-container">
            <div v-for="item in seedInventoryList" :key="item.materialName" class="inventory-row-card card">
              <div class="inventory-card-top">
                <div class="inventory-info-col">
                  <span class="seed-badge" :class="item.category === '肥料・農薬' ? 'fertilizer' : 'seed'">{{ item.category }}</span>
                  <h4 class="seed-title">{{ item.materialName }}</h4>
                </div>
                <button class="btn-item-delete" @click="removeInventoryItem(item.materialName)" title="リストから削除">
                  <Trash2 size="18" />
                </button>
              </div>

              <div class="seed-history-row" v-if="item.purchaseDate || item.supplier">
                <span v-if="item.purchaseDate" class="history-date">📅 {{ item.purchaseDate }}購入</span>
                <span v-if="item.supplier" class="history-supplier">🏢 {{ item.supplier }}</span>
                <span v-if="item.quantityBought" class="history-qty">📦 購入量:{{ item.quantityBought }}</span>
              </div>

              <div class="inventory-input-col">
                <label class="input-label">現在在庫（繰越数量）</label>
                <input
                  v-model="item.stockQuantity"
                  type="text"
                  placeholder="例: 3袋、50本、なし"
                  class="modern-input-sm modal-input"
                />
              </div>
            </div>
          </div>

          <!-- 手動追加トグルボタン -->
          <button class="btn-add-inventory-item" @click="showAddForm = !showAddForm">
            <Plus size="15" />
            リスト外から手動追加
          </button>

          <!-- 手動追加フォーム -->
          <Transition name="fade">
            <div v-if="showAddForm" class="add-inventory-form card">
              <h4 class="add-form-title">資材・種苗を手動で追加</h4>
              <div class="add-form-row">
                <label class="input-label">区分</label>
                <select v-model="newInventoryItem.category" class="modern-input-sm modal-input">
                  <option value="種苗">種苗</option>
                  <option value="肥料・農薬">肥料・農薬</option>
                  <option value="資材">資材</option>
                </select>
              </div>
              <div class="add-form-row">
                <label class="input-label">資材・種苗名 <span class="required-mark">*</span></label>
                <input v-model="newInventoryItem.materialName" type="text" placeholder="例: バイカル、ダーク" class="modern-input-sm modal-input" />
              </div>
              <div class="add-form-row">
                <label class="input-label">購入量（参考）</label>
                <input v-model="newInventoryItem.quantityBought" type="text" placeholder="例: 2.5kg、10本" class="modern-input-sm modal-input" />
              </div>
              <div class="add-form-row">
                <label class="input-label">仕入先（参考）</label>
                <input v-model="newInventoryItem.supplier" type="text" placeholder="例: 野菜種苗センター" class="modern-input-sm modal-input" />
              </div>
              <div class="add-form-actions">
                <button class="btn-cancel add-cancel" @click="showAddForm = false">キャンセル</button>
                <button class="btn-add-confirm" @click="addInventoryItem">
                  <Plus size="15" />
                  追加する
                </button>
              </div>
            </div>
          </Transition>
        </div>
        
        <div class="modal-footer">
          <button class="btn-cancel" @click="isSeedInventoryModalOpen = false">キャンセル</button>
          <button class="btn-save" @click="saveSeedInventory">
            <CheckCircle2 size="18" />
            棚卸しデータを保存
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
header {
  height: 72px;
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 1000;
  margin-bottom: 1.5rem;
}

.header-inner {
  width: 100%;
  padding: 0 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sync-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 700;
  color: #fff;
  margin-right: 0.5rem;
}

.sync-status.mini {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.2rem 0.5rem;
  font-size: 0.65rem;
}

.header-mobile-top-bar {
  position: absolute;
  top: 8px;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1rem;
  z-index: 10;
}

.sync-dot {
  width: 8px;
  height: 8px;
  background: #94a3b8;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.sync-status.online .sync-dot {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.sync-status.loading .sync-dot {
  background: #f59e0b;
  animation: pulse 1.5s infinite;
}

.version-badge-mini {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 800;
}

.global-logo-pc {
  height: 48px;
  width: auto;
  object-fit: contain;
}

.global-logo-mobile {
  width: 100%;
  max-width: 240px;
  height: auto;
  object-fit: contain;
}

.btn-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-full);
}

/* Navigation - Mobile Bottom Bar */
/* Premium Mobile UI Overhaul */
.nav-bar {
  position: fixed;
  bottom: 0px;
  left: 0;
  width: 100%;
  height: 76px;
  z-index: 1000;
  border-radius: 24px 24px 0 0; /* More rounded top */
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -10px 40px rgba(0,0,0,0.1);
}

.nav-bar-inner {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 100%;
  padding: 0 1rem;
}

.nav-bar button {
  flex: 1;
  display: flex !important;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--text-soft);
  font-size: 0.7rem;
  font-weight: 800;
  gap: 0.25rem;
  padding: 0.5rem 0;
  min-width: 60px;
  border: none;
  transition: all 0.2s ease;
}

.nav-bar button.active {
  color: var(--primary);
  transform: translateY(-2px);
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

/* Sidebar - PC */
.pc-layout {
  position: fixed;
  left: 1.5rem;
  top: 88px;
  bottom: 80px;
  width: 260px;
  z-index: 900;
  pointer-events: none; /* サイドバーが閉じている時にコンテンツのクリックを妨げない */
}

.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  pointer-events: auto; /* pc-layout の pointer-events:none を上書き */
}

.sidebar nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sidebar button {
  justify-content: flex-start;
  padding: 0.8rem 1.25rem;
  width: 100%;
  background: transparent;
  color: var(--text-main);
  border-radius: var(--radius-md);
}

.sidebar button:hover {
  background: var(--bg-secondary);
}

.sidebar button.active {
  background: var(--primary);
  color: white;
  box-shadow: 0 4px 12px hsla(142, 60%, 25%, 0.3);
}

.sidebar-divider {
  height: 1px;
  background: var(--glass-border);
  margin: 1.5rem 0;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-weight: 600;
}

.avatar { font-size: 1.25rem; }

/* Main Content */
.main-content {
  padding-bottom: 100px;
  transition: margin-left 0.3s ease;
}

.main-content.with-sidebar {
  margin-left: 0; /* モバイルではマージンなし（オーバーレイ） */
  max-width: 100%;
}

/* PC画面でもサイドバー表示時にメインコンテンツを縮小・移動させない（常に2枚目の全幅表示を維持） */

/* Mobile Dashboard */




.quick-stats-pro {
  display: flex;
  padding: 1.25rem;
  border-radius: var(--radius-lg);
  justify-content: space-around;
  align-items: center;
}

.glass-vibrant {
  background: hsla(0, 0%, 100%, 0.8);
  backdrop-filter: blur(16px);
  border: 1px solid hsla(0, 0%, 100%, 0.5);
  box-shadow: 0 10px 30px rgba(0,0,0,0.05);
}

.stat-item .label { display: block; font-size: 0.7rem; font-weight: 800; color: var(--text-soft); }
.stat-item .value { font-size: 1.5rem; font-weight: 900; color: var(--primary); display: flex; align-items: baseline; gap: 0.2rem; }
.stat-item .value small { font-size: 0.8rem; font-weight: 700; color: var(--text-soft); }
.divider-v { width: 1px; height: 32px; background: var(--glass-border); }

.action-grid-pro {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.dashboard-card {
  padding: 1.5rem 1rem;
  display: flex !important;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
  border-radius: var(--radius-lg);
  transition: all 0.3s ease;
}

.dashboard-card:active { transform: scale(0.96); opacity: 0.8; }

.icon-bubble {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.bg-primary-pro { background: linear-gradient(135deg, #10b981, #059669); }
.bg-accent-pro { background: linear-gradient(135deg, #d97706, #b45309); }

.card-info strong { display: block; font-size: 0.95rem; font-weight: 900; margin-bottom: 0.2rem; }
.card-info p { font-size: 0.75rem; color: var(--text-soft); font-weight: 600; }

/* Regional Alerts */
.regional-alert-section .section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  color: var(--accent);
}

.section-title h4 { font-size: 0.85rem; font-weight: 800; }
.link-external { margin-left: auto; color: var(--text-soft); }

.alert-cards-scroll {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  scrollbar-width: none;
}

.alert-card-mini {
  flex: 0 0 200px;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--accent);
}

.alert-card-mini .type { display: block; font-size: 0.85rem; font-weight: 800; }
.alert-card-mini .loc { display: block; font-size: 0.7rem; color: var(--text-soft); }
.alert-card-mini .date { font-size: 0.65rem; color: var(--text-soft); }

.icon-pulse {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
}

.quick-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.quick-stats .label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}

.quick-stats .value {
  font-size: 1.5rem;
  font-weight: 900;
  color: var(--primary);
}

.action-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
  margin-top: 2rem;
}

.primary-action {
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  color: white;
  padding: 2rem;
  flex-direction: column;
  gap: 1rem;
}

.accent-action {
  background: linear-gradient(135deg, var(--secondary), hsl(30, 20%, 45%));
  color: white;
  padding: 2rem;
  flex-direction: column;
  gap: 1rem;
}

.mt-2 { margin-top: 1.5rem; }

/* Footer */
.pc-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 60px;
  display: flex;
  align-items: center;
  z-index: 1000;
}

.footer-inner {
  width: 100%;
  padding: 0 1.5rem;
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.footer-links {
  display: flex;
  gap: 1.5rem;
}
/* Mobile V2 Enhancements */
.header-mobile-v2 {
  height: 180px;
  position: relative;
  background: transparent;
  margin-bottom: 2rem;
}

.header-bg-top {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 120px;
  background: #004d2c; /* Deep Green */
  border-bottom-left-radius: 40px;
  border-bottom-right-radius: 40px;
  z-index: 1;
}

.logo-card-v2 {
  position: absolute;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 360px;
  background: white;
  border-radius: 24px;
  padding: 1.25rem;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  z-index: 2;
  text-align: center;
}

.logo-v2 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.logo-icon-v2 {
  width: 44px;
  height: 44px;
}

.logo-text-v2 h1 {
  font-size: 1.8rem;
  font-weight: 900;
  color: #004d2c;
  line-height: 1;
}

.logo-kana {
  font-size: 0.7rem;
  font-weight: 800;
  color: #666;
  display: block;
}

.subtitle-v2 {
  font-size: 0.85rem;
  font-weight: 700;
  color: #333;
}

.mobile-main-v2 {
  padding-top: 10px;
  padding-bottom: 140px; /* ナビゲーションバーに被らないように調整 */
}

.greeting-v2 h2 {
  font-size: 1.4rem;
  font-weight: 900;
  margin-bottom: 1rem;
}

.alert-card-v2 {
  padding: 1rem;
  border-radius: 16px;
  background: #fff9c4; /* Yellow Alert */
  border: 1px solid #fbc02d;
}

.alert-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #f57f17;
  margin-bottom: 0.25rem;
}

.alert-card-v2 p {
  font-size: 0.8rem;
  font-weight: 600;
  color: #666;
}

.action-list-v2 {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.action-btn-v2 {
  width: 100%;
  padding: 1rem 1.5rem;
  border-radius: 40px;
  display: flex;
  align-items: center;
  gap: 1rem;
  color: white;
  font-size: 1.1rem;
  font-weight: 800;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.action-btn-v2.dark-green { background: #004d2c; }
.action-btn-v2.light-green { background: #a8d5a2; color: #004d2c; }
.action-btn-v2.lightest-green { background: #e1f2df; color: #004d2c; }
.action-btn-v2.orange { background: #e68a00; }
.action-btn-v2.purple { background: #7c3aed; }

.btn-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.audit-status-v2 {
  padding: 1rem;
  border-radius: 16px;
  background: white;
}

.status-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 700;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.dot.green {
  width: 12px;
  height: 12px;
  background: #10b981;
  border-radius: 50%;
}

@keyframes pop {
  0% { transform: translateX(-50%) scale(0.9); opacity: 0; }
  100% { transform: translateX(-50%) scale(1); opacity: 1; }
}

.animate-pop {
  animation: pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

.icon-shake {
  animation: shake 2s infinite;
}

/* Weather Card V2 */
.weather-card-v2 {
  padding: 0;
  overflow: hidden;
  border-radius: 20px;
}

.weather-header {
  background: #82b541; /* Apple Green from image */
  color: white;
  padding: 0.75rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.weather-header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.weather-view-tabs {
  display: flex;
  background: rgba(0,0,0,0.1);
  padding: 0.2rem;
  border-radius: 8px;
}

.weather-view-tabs button {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  color: white;
  opacity: 0.7;
}

.weather-view-tabs button.active {
  background: white;
  color: #82b541;
  opacity: 1;
}

.weather-header h3 { font-size: 0.95rem; font-weight: 900; }
.weather-loc { display: flex; align-items: center; gap: 0.25rem; font-weight: 800; font-size: 0.85rem; }

.weather-main {
  padding: 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.weather-info-left {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.weather-date { font-size: 1.4rem; font-weight: 900; color: #333; }
.icon-weather { color: #3b82f6; }

.weather-info-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.75rem;
}

.weather-summary-box {
  background: #fff9c4;
  padding: 0.2rem 1rem;
  border-radius: 4px;
  font-weight: 800;
  font-size: 1.1rem;
  color: #d97706;
}

.temp-box {
  display: flex;
  gap: 1rem;
}

.temp-high { color: #f97316; }
.temp-low { color: #3b82f6; }

.temp-high, .temp-low {
  background: #f1f5f9;
  padding: 0.5rem 0.75rem;
  border-radius: 12px;
  display: flex;
  align-items: baseline;
}

.temp-high .val, .temp-low .val { font-size: 1.5rem; font-weight: 900; }
.temp-high .unit, .temp-low .unit { font-size: 0.9rem; font-weight: 800; margin-left: 0.1rem; }

.precipitation-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: #f8fafc;
  border-top: 1px solid var(--glass-border);
}

.precip-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  border-right: 1px solid var(--glass-border);
}

.precip-item:last-child { border-right: none; }

.p-time {
  font-size: 0.75rem;
  font-weight: 800;
  color: #64748b;
  background: #e2e8f0;
  padding: 0.1rem 0.6rem;
  border-radius: 4px;
  margin-bottom: 0.4rem;
}

.p-chance { font-size: 1rem; font-weight: 900; color: #333; }

/* Weekly Weather */
.weather-weekly-list {
  display: flex;
  flex-direction: column;
}

.weekly-row {
  display: grid;
  grid-template-columns: 60px 40px 1fr 80px 50px;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f1f5f9;
}

.weekly-row:last-child { border-bottom: none; }

.w-date-col { display: flex; flex-direction: column; }
.w-date { font-size: 0.9rem; font-weight: 900; color: #333; }
.w-day { font-size: 0.7rem; font-weight: 800; }

.w-icon-col { display: flex; justify-content: center; }
.icon-sun { color: #f97316; }
.icon-cloud { color: #94a3b8; }

.w-summary-col { font-size: 0.8rem; font-weight: 700; color: #666; }

.w-temp-col {
  display: flex;
  gap: 0.75rem;
  font-weight: 900;
  font-size: 0.9rem;
}
.w-high { color: #ef4444; }
.w-low { color: #3b82f6; }

.w-chance-col {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.75rem;
  font-weight: 800;
  color: #64748b;
  justify-content: flex-end;
}

.text-blue { color: #3b82f6; }
.text-red { color: #ef4444; }

.animate-fade-in {
  animation: fadeIn 0.3s ease forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes shake {
  0%, 100% { transform: rotate(0); }
  10%, 30%, 50%, 70%, 90% { transform: rotate(-10deg); }
  20%, 40%, 60%, 80% { transform: rotate(10deg); }
}

/* PC Sidebar Tweaks */
.pc-layout {
  display: flex;
  flex: 1;
  position: relative;
}

.sidebar {
  position: fixed;
  top: 72px;
  left: 0;
  bottom: 0;
  width: 280px;
  z-index: 1500;
  border-radius: 0 24px 24px 0;
  box-shadow: 10px 0 30px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--glass-stroke);
}

.sidebar-header h3 { font-size: 1rem; font-weight: 900; color: var(--primary); }

.btn-pc-menu {
  background: var(--primary);
  color: white !important;
  border: none;
  width: 48px;
  height: 48px;
  margin-right: 1.5rem;
  border-radius: 12px;
  display: flex !important;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 2000;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.btn-pc-menu:hover {
  background: var(--primary-dark);
  transform: translateY(-1px);
}

.version-badge {
  font-size: 10px;
  color: var(--text-soft);
  margin-right: 1rem;
  opacity: 0.6;
}

.audit-mode-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  background: #dcfce7;
  color: #15803d;
  border: 1.5px solid #86efac;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
  margin-right: 0.75rem;
  animation: pulse-green 2.5s infinite;
}
.audit-mode-chip:hover { background: #bbf7d0; }

@keyframes pulse-green {
  0%   { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.35); }
  70%  { box-shadow: 0 0 0 5px rgba(22, 163, 74, 0); }
  100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  backdrop-filter: blur(4px);
  z-index: 1400;
  pointer-events: auto; /* pc-layout の pointer-events:none を上書き */
}

/* PC画面でもサイドバー表示時に背景を薄暗くするオーバーレイを表示する */

.header-left {
  display: flex;
  align-items: center;
}

/* Transitions */
.slide-left-enter-active, .slide-left-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-left-enter-from, .slide-left-leave-to {
  transform: translateX(-100%);
}

/* View Mode Switches */
.view-mode-section {
  padding: 2rem 1rem;
  display: flex;
  justify-content: center;
  margin-bottom: 100px; /* Space for bottom nav */
}

.btn-switch-pc {
  background: var(--glass);
  color: var(--primary);
  border: 1px solid var(--primary-light);
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pc-header .btn-switch-pc {
  margin-right: 1.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
}

.btn-switch-pc:active {
  background: var(--bg-secondary);
  transform: scale(0.98);
}

.badge-inbox {
  background: #ef4444;
  color: white;
  font-size: 0.7rem;
  font-weight: 900;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  margin-left: auto;
  box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
  animation: pulse-red 2s infinite;
}

@keyframes pulse-red {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  70% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

/* Toast Style */
.global-toast {
  position: fixed;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.8);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  font-weight: 800;
  z-index: 9999;
  text-align: center;
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  min-width: 280px;
}

.global-toast.success { background: #10b981; }
.global-toast.warning { background: #f59e0b; }
.global-toast.error { background: #ef4444; }

/* --- Seed Inventory Modal Styles --- */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.6); /* ダークグレーなオーバーレイ */
  backdrop-filter: blur(4px);
  z-index: 1500;
}

.inventory-modal {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 85vh;
  background: #f8fafc;
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  z-index: 1600;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -10px 25px -5px rgba(0, 0, 0, 0.15);
  border-top: 1px solid rgba(255, 255, 255, 0.8);
  overflow: hidden;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
  background: white;
}

.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.modal-title-wrap h3 {
  font-size: 1.2rem;
  font-weight: 900;
  color: var(--text-main);
  margin: 0;
}

.text-purple {
  color: #8b5cf6;
}

.btn-close {
  background: #f1f5f9;
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-close:hover, .btn-close:active {
  background: #e2e8f0;
  color: #1e293b;
  transform: scale(1.05);
}

.btn-close svg {
  width: 20px !important;
  min-width: 20px !important;
  height: 20px !important;
  display: block;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.modal-intro {
  font-size: 0.85rem;
  font-weight: 700;
  color: #475569;
  line-height: 1.5;
}

.inventory-cards-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.inventory-row-card {
  padding: 1rem;
  border-radius: 12px;
  background: white;
  border: 1.5px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.inventory-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
}

.btn-item-delete {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #94a3b8;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-item-delete svg {
  width: 18px !important;
  min-width: 18px !important;
  height: 18px !important;
  display: block;
}

.btn-item-delete:hover, .btn-item-delete:active {
  color: #ef4444;
  background: #fee2e2;
  border-color: #fca5a5;
  transform: scale(1.05);
}

/* 手動追加ボタン */
.btn-add-inventory-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.75rem;
  padding: 0.6rem 1rem;
  width: 100%;
  border: 1.5px dashed #c4b5fd;
  border-radius: 10px;
  background: #faf5ff;
  color: #7c3aed;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  justify-content: center;
  transition: all 0.2s ease;
}
.btn-add-inventory-item:hover {
  background: #ede9fe;
  border-color: #8b5cf6;
}

/* 手動追加フォームパネル */
.add-inventory-form {
  margin-top: 0.75rem;
  padding: 1rem;
  border-radius: 12px;
  background: #faf5ff;
  border: 1px solid #ddd6fe;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.add-form-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #6d28d9;
  margin: 0 0 0.25rem;
}
.add-form-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.required-mark {
  color: #ef4444;
  font-weight: 700;
}
.add-form-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
.add-cancel {
  flex: 1;
  padding: 0.6rem !important;
  font-size: 0.82rem !important;
}
.btn-add-confirm {
  flex: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.6rem 1rem;
  border-radius: 10px;
  border: none;
  background: #7c3aed;
  color: white;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;
}
.btn-add-confirm:hover {
  background: #6d28d9;
}

.inventory-info-col {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.seed-badge {
  align-self: flex-start;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  margin-bottom: 0.15rem;
}

.seed-badge.seed, .seed-badge.種苗 {
  background: #f3e8ff;
  color: #7e22ce;
}

.seed-badge.fertilizer, .seed-badge.肥料・農薬, .seed-badge.肥料, .seed-badge.農薬 {
  background: #e6f4ea;
  color: #137333;
}

.seed-badge.material, .seed-badge.資材, .seed-badge.その他 {
  background: #e8f0fe;
  color: #1a73e8;
}

.seed-title {
  font-size: 1rem;
  font-weight: 900;
  color: #1e293b;
  margin: 0;
}

.seed-history-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: #64748b;
}

.history-date {
  color: #0d9488;
}

.inventory-input-col {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.input-label {
  font-size: 0.7rem;
  font-weight: 800;
  color: #64748b;
}

.modal-input {
  width: 100%;
  background: white !important;
  border: 1.5px solid #cbd5e1 !important;
  border-radius: 8px;
  padding: 0.6rem 0.85rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #1e293b;
}

.modal-input:focus {
  border-color: #8b5cf6 !important;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15) !important;
}

.modal-footer {
  padding: 1rem 1.5rem;
  display: flex;
  gap: 1rem;
  border-top: 1px solid #e2e8f0;
  background: white;
}

.btn-cancel {
  flex: 1;
  padding: 0.85rem;
  border-radius: 12px;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.95rem;
  font-weight: 800;
  border: none;
  cursor: pointer;
}

.btn-save {
  flex: 2;
  padding: 0.85rem;
  border-radius: 12px;
  background: linear-gradient(135deg, #8b5cf6, #6d28d9);
  color: white;
  font-size: 0.95rem;
  font-weight: 800;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25);
  cursor: pointer;
}

.btn-save svg {
  width: 18px !important;
  min-width: 18px !important;
  height: 18px !important;
  display: block;
}

/* ===== 印刷時：App全体のナビ・ヘッダーを非表示 ===== */
@media print {
  .pc-header,
  .header-mobile-v2,
  .pc-layout,
  .sidebar,
  .sidebar-overlay,
  footer,
  .global-toast-container,
  .btn-toggle {
    display: none !important;
  }
  .main-content {
    padding-bottom: 0 !important;
    margin: 0 !important;
  }
}
</style>
