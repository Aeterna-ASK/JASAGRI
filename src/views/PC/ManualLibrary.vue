<script setup>
import { 
  FileText, 
  Download,
  Upload,
  Plus,
  ShieldCheck,
  X,
  Edit,
  History,
  AlertCircle,
  Save,
  CheckCircle,
  Clock,
  BookOpen,
  ArrowRight,
  UserCheck,
  Check,
  FileCode,
  FileEdit,
  RefreshCw,
  ChevronDown
} from 'lucide-vue-next';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { state, actions } from '../../store';

// 農水省JAS公式連携ステート
const isSyncingMaff = ref(false);
const showMaffNews = ref(false);

const syncMaffInfo = async () => {
  isSyncingMaff.value = true;
  await actions.syncMaffJasInfo();
  isSyncingMaff.value = false;
};

const truncateString = (str, num) => {
  if (!str) return '';
  if (str.length <= num) return str;
  return str.slice(0, num) + '...';
};

// 選択中のドキュメント
const selectedDocId = ref('doc1_1');
const selectedCatId = ref('cat1');

// 現在選択されているドキュメントオブジェクト
const selectedDoc = computed(() => {
  for (const cat of state.documents || []) {
    const doc = cat.items.find(item => item.id === selectedDocId.value);
    if (doc) return doc;
  }
  return null;
});

// オンライン編集状態
const isEditingText = ref(false);
const editText = ref('');
const editName = ref('');
const editOriginalRevisionDate = ref('');
const editReviewDate = ref('');
const editSummary = ref('');
const editAuditPoints = ref('');
const applyDatesToAll = ref(false); // 全マニュアル一括適用フラグ

// 改訂履歴（バージョンアップ）モーダル
const isRevising = ref(false);
const revVersion = ref('');
const revComment = ref('');
const revAuthor = ref('');

// タイムライン個別編集ステート
const isEditingHistory = ref(false);
const editingHistoryIndex = ref(-1);
const editHistVersion = ref('');
const editHistAuthor = ref('');
const editHistDate = ref('');
const editHistComment = ref('');

// 新規ドキュメント追加モーダル
const isAddingDoc = ref(false);
const addCatId = ref('');
const newDocName = ref('');
const newDocSummary = ref('');
const newDocText = ref('');
const newDocAuditPoints = ref('');

// 一括製本印刷ステート
const isBulkPrinting = ref(false);

// 全マニュアル（1章〜8章＋別紙等）の履歴データをクロノロジカルに全走査して結合・ソート
const compiledHistory = computed(() => {
  const list = [];
  const seen = new Set();
  
  if (!state.documents) return list;
  
  state.documents.forEach(cat => {
    cat.items.forEach(item => {
      if (item.history) {
        item.history.forEach(h => {
          const key = `${h.version}-${h.date}-${h.author}-${h.comment}`;
          if (!seen.has(key)) {
            seen.add(key);
            // どの章の改訂履歴かを分かりやすく頭に添える
            const shortName = (item.name || '').split('：')[0];
            list.push({
              docName: item.name,
              version: h.version,
              date: h.date,
              author: h.author,
              comment: `【${shortName}】 ${h.comment}`
            });
          }
        });
      }
    });
  });
  
  // 日付の降順（新しいものが上）でソート
  return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
});

// ドキュメント選択アクション
const selectDoc = (catId, docId) => {
  selectedCatId.value = catId;
  selectedDocId.value = docId;
  isEditingText.value = false;
};

// 編集の開始
const startEdit = () => {
  if (!selectedDoc.value) return;
  editText.value = selectedDoc.value.text;
  editName.value = selectedDoc.value.name;
  editOriginalRevisionDate.value = selectedDoc.value.originalRevisionDate || '';
  editReviewDate.value = selectedDoc.value.reviewDate || '';
  editSummary.value = selectedDoc.value.summary || '';
  editAuditPoints.value = selectedDoc.value.auditPoints || '';
  applyDatesToAll.value = false; // 初期状態は個別更新
  isEditingText.value = true;
};

// 簡易保存（バージョン変更なし）
const quickSave = () => {
  if (!selectedDoc.value) return;
  
  // 個別ドキュメントの更新
  actions.updateDocument(selectedCatId.value, selectedDocId.value, {
    text: editText.value,
    name: editName.value,
    originalRevisionDate: editOriginalRevisionDate.value,
    reviewDate: editReviewDate.value,
    summary: editSummary.value,
    auditPoints: editAuditPoints.value
  });

  // 「すべての章・別紙に一括適用」がチェックされている場合
  if (applyDatesToAll.value) {
    actions.updateAllDocumentsDates(editOriginalRevisionDate.value, editReviewDate.value);
  }

  isEditingText.value = false;
  actions.showToast(
    applyDatesToAll.value 
      ? 'マニュアル原本の改定日・見直し日を全章に一括適用し、本文を更新しました' 
      : '文書の内容および属性を更新しました', 
    'success'
  );
};

// 改訂（バージョンアップ）の開始
const startRevision = () => {
  if (!selectedDoc.value) return;
  const currentVer = selectedDoc.value.version;
  // 自動的にマイナーバージョンを1上げる (v1.0.0 -> v1.1.0 など)
  try {
    const parts = currentVer.replace('v', '').split('.');
    if (parts.length === 3) {
      parts[1] = parseInt(parts[1]) + 1;
      parts[2] = 0;
      revVersion.value = `v${parts.join('.')}`;
    } else {
      revVersion.value = currentVer + '.1';
    }
  } catch (e) {
    revVersion.value = 'v2.0.0';
  }
  
  revComment.value = '';
  revAuthor.value = state.user.name || '';
  isRevising.value = true;
};

// 改訂履歴をコミット
const commitRevision = () => {
  if (!selectedDoc.value) return;
  if (!revVersion.value || !revComment.value) {
    actions.showToast('バージョンと改訂理由を入力してください', 'warning');
    return;
  }

  // ドキュメント属性の更新
  actions.updateDocument(selectedCatId.value, selectedDocId.value, {
    text: isEditingText.value ? editText.value : selectedDoc.value.text,
    name: isEditingText.value ? editName.value : selectedDoc.value.name,
    originalRevisionDate: isEditingText.value ? editOriginalRevisionDate.value : (selectedDoc.value.originalRevisionDate || '平成24年11月1日・令和3年10月1日'),
    reviewDate: isEditingText.value ? editReviewDate.value : (selectedDoc.value.reviewDate || '令和8年5月15日'),
    summary: isEditingText.value ? editSummary.value : (selectedDoc.value.summary || ''),
    auditPoints: isEditingText.value ? editAuditPoints.value : (selectedDoc.value.auditPoints || '')
  });

  // 新改訂履歴を追加
  actions.addDocumentRevision(selectedCatId.value, selectedDocId.value, {
    version: revVersion.value,
    comment: revComment.value,
    author: revAuthor.value || '管理者',
    text: isEditingText.value ? editText.value : selectedDoc.value.text
  });

  // 「すべての章・別紙に一括適用」がチェックされている場合
  if (applyDatesToAll.value) {
    actions.updateAllDocumentsDates(
      isEditingText.value ? editOriginalRevisionDate.value : (selectedDoc.value.originalRevisionDate || '平成24年11月1日・令和3年10月1日'),
      isEditingText.value ? editReviewDate.value : (selectedDoc.value.reviewDate || '令和8年5月15日')
    );
  }

  isRevising.value = false;
  isEditingText.value = false;
  actions.showToast(
    applyDatesToAll.value
      ? '改訂履歴を記録し、原本日付を全章へ一括適用しました'
      : '新しいバージョンを承認・記録しました', 
    'success'
  );
};

// タイムライン項目の編集開始
const openEditHistory = (index, historyItem) => {
  editingHistoryIndex.value = index;
  editHistVersion.value = historyItem.version;
  editHistAuthor.value = historyItem.author;
  editHistDate.value = historyItem.date;
  editHistComment.value = historyItem.comment;
  isEditingHistory.value = true;
};

// タイムライン編集の保存
const saveHistoryEdit = () => {
  if (editingHistoryIndex.value === -1) return;
  actions.updateDocumentHistory(selectedCatId.value, selectedDocId.value, editingHistoryIndex.value, {
    version: editHistVersion.value,
    author: editHistAuthor.value,
    date: editHistDate.value,
    comment: editHistComment.value
  });
  isEditingHistory.value = false;
  actions.showToast('タイムライン履歴を更新しました', 'success');
};

// 承認ステータスの切り替え
const toggleStatus = () => {
  if (!selectedDoc.value) return;
  const newStatus = selectedDoc.value.status === 'approved' ? 'draft' : 'approved';
  actions.updateDocumentStatus(selectedCatId.value, selectedDocId.value, newStatus, state.user.name);
  actions.showToast(`文書を「${newStatus === 'approved' ? '承認済み' : '下書き'}」に変更しました`, 'success');
};

// 新規文書作成の開始
const openAddDoc = (catId) => {
  addCatId.value = catId;
  newDocName.value = '';
  newDocSummary.value = '';
  newDocText.value = '';
  newDocAuditPoints.value = '';
  isAddingDoc.value = true;
};

// 新規文書の保存
const saveNewDoc = () => {
  if (!newDocName.value) {
    actions.showToast('文書タイトルを入力してください', 'warning');
    return;
  }

  const payload = {
    name: newDocName.value,
    summary: newDocSummary.value,
    text: newDocText.value,
    auditPoints: newDocAuditPoints.value
  };

  const newDoc = actions.uploadDocument(addCatId.value, payload);
  if (newDoc) {
    selectedCatId.value = addCatId.value;
    selectedDocId.value = newDoc.id;
  }

  isAddingDoc.value = false;
  actions.showToast('新規マニュアルを登録しました', 'success');
};

// 福山黒酢マニュアルへの一括置換・同期
const handleResetManual = () => {
  const confirmed = confirm('現在のマニュアル全データを、福山黒酢（AGRI KAKUIDA）の実地監査通過マニュアル（v2.6.0）に一括置換し、クラウドデータベース（Firestore）へ強制同期します。よろしいですか？\n※個別に編集された内容は上書きされます。');
  if (confirmed) {
    const success = actions.resetDocumentsToDefault();
    if (success) {
      selectDoc('cat1', 'doc1_1');
    }
  }
};

// 選択中の章のみ個別に印刷
const printSelectedDoc = () => {
  isBulkPrinting.value = false;
  document.body.classList.remove('all-manual-print-active');
  document.body.classList.add('selected-chapter-print-active');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
};

// マニュアル全章（1章〜8章＋別紙全て）を表紙・目次・全体履歴付きで一括印刷・製本
const printAllDocs = () => {
  document.body.classList.add('all-manual-print-active');
  isBulkPrinting.value = true;
  actions.showToast('マニュアル全巻（表紙・目次・履歴付き）の結合プレビューを出力します...', 'info');
  
  // ダブルRAF（requestAnimationFrame）によって、ブラウザに「クラス適用済みのペイント描画」を100%完了させてから印刷を開く（白紙バグへの究極対策）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
};

// 印刷完了またはキャンセル時の安全クリーンアップ処理
const handleAfterPrint = () => {
  document.body.classList.remove('all-manual-print-active');
  document.body.classList.remove('selected-chapter-print-active');
  isBulkPrinting.value = false;
};

onMounted(() => {
  window.addEventListener('afterprint', handleAfterPrint);
});

onUnmounted(() => {
  window.removeEventListener('afterprint', handleAfterPrint);
});
</script>

<template>
  <div class="manual-library-v2 animate-slide-up">
    <!-- Header Controls -->
    <div class="lib-header">
      <div class="header-info">
        <div class="title-wrap">
          <BookOpen class="text-primary" size="28" />
          <h2>有機JAS規定・マニュアル管理ライブラリ <small>v.Pro</small></h2>
        </div>
        <p>有機JAS監査の「規定類」の要件に準拠し、最新マニュアル・改訂履歴（タイムライン）・監査対策を一括管理します。</p>
      </div>
      <div class="header-actions">
        <button @click="handleResetManual" class="btn-reset-fukuyama glass">
          <ShieldCheck size="18" class="text-accent-gold" />
          <span>福山黒酢マニュアル一括同期</span>
        </button>
        <button @click="printSelectedDoc" class="btn-audit-print select-only glass">
          <CheckCircle size="18" />
          <span>選択中の章のみ印刷</span>
        </button>
        <button @click="printAllDocs" class="btn-audit-print bulk-all glass animate-pulse-subtle">
          <FileText size="18" class="text-accent-gold" />
          <span>全章一括印刷（表紙・目次付き）</span>
        </button>
      </div>
    </div>

    <!-- 2 Column Master-Detail Layout -->
    <div class="library-layout-grid">
      
      <!-- Left Column: Categories and Document Lists -->
      <div class="left-pane">
        <!-- 農林水産省 有機JAS公式連携モジュール -->
        <div class="maff-sync-card glass">
          <div class="maff-header">
            <div class="maff-badge-wrap">
              <span class="maff-badge">農林水産省 告示連動</span>
            </div>
            <button @click="syncMaffInfo" class="btn-maff-sync" :disabled="isSyncingMaff">
              <RefreshCw :class="{ 'animate-spin': isSyncingMaff }" size="14" />
              <span>{{ isSyncingMaff ? '同期中...' : '最新同期' }}</span>
            </button>
          </div>
          <h3 class="maff-title">有機農産物 基準・告示</h3>
          <p class="maff-sync-date">最終同期：{{ state.maffJasInfo ? state.maffJasInfo.lastSynced : '未同期' }}</p>
          
          <div v-if="state.maffJasInfo" class="maff-pdf-links">
            <a v-for="link in state.maffJasInfo.links" :key="link.id" :href="link.url" target="_blank" class="maff-pdf-link" :title="link.name">
              <Download size="14" class="pdf-icon" />
              <div class="link-info">
                <span class="link-label">【{{ link.type }}】{{ truncateString(link.name, 15) }}</span>
                <span class="pdf-size">{{ link.size }}</span>
              </div>
            </a>
          </div>

          <div class="maff-news-toggle" @click="showMaffNews = !showMaffNews">
            <span>農水省最新お知らせ・改正動向</span>
            <ChevronDown :class="{ 'rotate-180': showMaffNews }" class="chevron-icon" size="16" />
          </div>

          <div v-if="showMaffNews && state.maffJasInfo" class="maff-news-list animate-slide-down">
            <div v-for="ann in state.maffJasInfo.announcements" :key="ann.id" class="maff-news-item">
              <div class="news-meta">
                <span class="news-date">{{ ann.date }}</span>
                <a :href="ann.url" target="_blank" class="news-link-btn">公式PDF</a>
              </div>
              <h5 class="news-title">{{ ann.title }}</h5>
              <p class="news-desc">{{ ann.desc }}</p>
            </div>
          </div>
        </div>

        <div v-for="cat in state.documents" :key="cat.id" class="category-block glass">
          <div class="cat-header">
            <h3>{{ cat.title }}</h3>
            <button @click="openAddDoc(cat.id)" class="btn-add-doc">
              <Plus size="16" />
              <span>規定追加</span>
            </button>
          </div>

          <div class="doc-list">
            <div 
              v-for="item in cat.items" 
              :key="item.id" 
              class="doc-item-card"
              :class="{ active: selectedDocId === item.id }"
              @click="selectDoc(cat.id, item.id)"
            >
              <div class="doc-card-header">
                <FileText class="doc-icon" size="20" />
                <span class="doc-version">{{ item.version }}</span>
                <span class="status-dot-badge" :class="item.status">
                  {{ item.status === 'approved' ? '承認済' : '下書き' }}
                </span>
              </div>
              <h4 class="doc-title">{{ item.name }}</h4>
              <p class="doc-summary">{{ item.summary }}</p>
              <div class="doc-card-footer">
                <span class="doc-date"><Clock size="12" /> {{ item.date }}</span>
                <span class="doc-size">{{ item.size }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Interactive Wiki & Version Timeline -->
      <div class="right-pane">
        <div v-if="selectedDoc" class="wiki-container glass animate-fade-in">
          
          <!-- Wiki Header -->
          <div class="wiki-header">
            <div class="wiki-title-area">
              <div class="wiki-meta-tags">
                <span class="ver-tag">{{ selectedDoc.version }}</span>
                <span class="status-badge" :class="selectedDoc.status" @click="toggleStatus" title="クリックしてステータス切り替え">
                  {{ selectedDoc.status === 'approved' ? '正式承認済み' : '下書き・調整中' }}
                </span>
                <span class="approved-by-tag" v-if="selectedDoc.status === 'approved'">
                  <UserCheck size="12" /> 承認者: {{ selectedDoc.approvedBy }}
                </span>
              </div>
              <h2>{{ selectedDoc.name }}</h2>
              
              <!-- 原本改定日 & 見直し日表示バー -->
              <div class="wiki-dates-bar">
                <span class="meta-date-item">
                  <strong>原本改定日:</strong> {{ selectedDoc.originalRevisionDate || '平成24年11月1日・令和3年10月1日' }}
                </span>
                <span class="meta-date-item">
                  <strong>見直し日:</strong> {{ selectedDoc.reviewDate || '令和8年5月15日' }}
                </span>
              </div>
            </div>
            
            <div class="wiki-actions">
              <button v-if="!isEditingText" @click="startEdit" class="btn-wiki-edit glass">
                <Edit size="16" />
                <span>オンライン編集</span>
              </button>
              <template v-else>
                <button @click="quickSave" class="btn-wiki-save-quick">
                  <Check size="16" />
                  <span>内容のみ保存</span>
                </button>
                <button @click="startRevision" class="btn-wiki-save-ver">
                  <History size="16" />
                  <span>改訂(履歴を記録)</span>
                </button>
                <button @click="isEditingText = false" class="btn-wiki-cancel">
                  <X size="16" />
                </button>
              </template>
            </div>
          </div>

          <!-- Audit Instruction Banner (おもてなし・監査対策) -->
          <div class="audit-banner">
            <div class="banner-icon-wrap">
              <AlertCircle size="22" />
            </div>
            <div class="banner-body">
              <h4>JAS監査員への対応ポイント</h4>
              <p>{{ selectedDoc.auditPoints }}</p>
            </div>
          </div>

          <!-- Wiki Editor / Text Content Area -->
          <div class="wiki-content-area">
            <div v-if="isEditingText" class="editor-wrap animate-fade-in">
              <div class="editor-meta-grid">
                <div class="form-group">
                  <label>文書名（タイトル）</label>
                  <input v-model="editName" type="text" class="glass" />
                </div>
                
                <div class="form-group-row">
                  <div class="form-group">
                    <label>原本改定日</label>
                    <input v-model="editOriginalRevisionDate" type="text" class="glass" placeholder="例: 平成24年11月1日・令和3年10月1日" />
                  </div>
                  <div class="form-group">
                    <label>見直し日</label>
                    <input v-model="editReviewDate" type="text" class="glass" placeholder="例: 令和8年5月15日" />
                  </div>
                </div>

                <!-- まとめて一括変更できるチェックボックス -->
                <div class="form-group-apply-wrapper">
                  <label class="glass-checkbox-label">
                    <input v-model="applyDatesToAll" type="checkbox" class="glass-checkbox-input" />
                    <span class="checkbox-highlight-text">
                      ← この改定日・見直し日を <strong>すべての章・別紙（全1章〜8章＋別紙含む全マニュアル）にまとめて一括適用</strong> する
                    </span>
                  </label>
                </div>

                <div class="form-group mt-05">
                  <label>概要（サマリー）</label>
                  <input v-model="editSummary" type="text" class="glass" />
                </div>

                <div class="form-group">
                  <label>JAS監査員への対応ポイント</label>
                  <textarea v-model="editAuditPoints" class="glass" style="height: 60px;"></textarea>
                </div>
              </div>

              <div class="form-group mt-1">
                <label>文書の本文（規定・マニュアル手順書）</label>
                <textarea v-model="editText" class="wiki-textarea" placeholder="マークダウンや規定テキストを入力してください..."></textarea>
              </div>
              <p class="editor-note">※「内容のみ保存」は版数を上げずにタイトル、日付、本文、監査対策を一括更新します。「改訂」は理由を記述して正式な改訂履歴ログを残します。</p>
            </div>
            
            <div v-else class="preview-wrap">
              <div class="wiki-rendered-text">
                {{ selectedDoc.text }}
              </div>
            </div>
          </div>

          <!-- Revision History Timeline (改訂履歴) -->
          <div class="revision-history-section">
            <div class="section-title">
              <History size="18" />
              <h3>改訂履歴・バージョン管理タイムライン</h3>
            </div>
            
            <div class="history-timeline">
              <div v-for="(h, idx) in selectedDoc.history" :key="idx" class="timeline-item">
                <div class="timeline-badge">
                  <span class="num">{{ h.version }}</span>
                </div>
                <div class="timeline-panel card glass">
                  <div class="timeline-header">
                    <div class="timeline-header-left">
                      <span class="author"><span class="avatar">👨‍🌾</span> {{ h.author }}</span>
                      <span class="date">{{ h.date }}</span>
                    </div>
                    <button @click="openEditHistory(idx, h)" class="btn-edit-history-item" title="履歴（タイムライン名称・コメント）を修正する">
                      <Edit size="12" />
                      <span>編集</span>
                    </button>
                  </div>
                  <div class="timeline-body">
                    <p>{{ h.comment }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- No Doc Selected State -->
        <div v-else class="empty-detail-state glass">
          <BookOpen size="48" class="text-muted" />
          <h3>表示するドキュメントがありません</h3>
          <p>左側のリストから確認したいマニュアル・規定を選択してください。</p>
        </div>
      </div>

    </div>

    <!-- Modal: Document Revision Comment Modal -->
    <div v-if="isRevising" class="modal-overlay">
      <div class="modal-card premium-modal scale-up">
        <div class="modal-header">
          <h3>新しい版（バージョン）の承認と改訂履歴の追加</h3>
          <button @click="isRevising = false" class="btn-close"><X /></button>
        </div>
        
        <div class="form-content">
          <p class="form-desc">この編集を有機JAS管理規則の「正式改訂」として適用します。監査員の追跡のため、明確な理由を記入してください。</p>
          
          <div class="form-group-row">
            <div class="form-group">
              <label>改訂後のバージョン</label>
              <input v-model="revVersion" type="text" class="glass" placeholder="例: v1.1.0" />
            </div>
            <div class="form-group">
              <label>改訂・承認責任者</label>
              <input v-model="revAuthor" type="text" class="glass" />
            </div>
          </div>
          
          <div class="form-group">
            <label>改訂理由（※監査の際に変更理由として提出される重要な説明です）</label>
            <textarea v-model="revComment" class="glass" placeholder="例: 令和8年有機資材適合リストの改定に伴い、使用可能な防除用木酢液の条件を詳細化した。"></textarea>
          </div>

          <div class="modal-footer-btns">
            <button @click="isRevising = false" class="btn-cancel-modal">キャンセル</button>
            <button @click="commitRevision" class="btn-commit-modal">
              <CheckCircle size="18" /> 正式改訂を承認・保存
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Edit History Item Modal -->
    <div v-if="isEditingHistory" class="modal-overlay">
      <div class="modal-card premium-modal scale-up">
        <div class="modal-header">
          <h3>改訂履歴（タイムライン項目）の修正</h3>
          <button @click="isEditingHistory = false" class="btn-close"><X /></button>
        </div>
        
        <div class="form-content">
          <p class="form-desc">選択したタイムライン履歴の表示内容（バージョン・改訂/承認者・改訂日・理由）を変更します。</p>
          
          <div class="form-group-row">
            <div class="form-group">
              <label>バージョン</label>
              <input v-model="editHistVersion" type="text" class="glass" />
            </div>
            <div class="form-group">
              <label>改訂・承認責任者</label>
              <input v-model="editHistAuthor" type="text" class="glass" />
            </div>
          </div>

          <div class="form-group">
            <label>改訂日</label>
            <input v-model="editHistDate" type="text" class="glass" placeholder="例: 2026-05-07" />
          </div>
          
          <div class="form-group">
            <label>改訂理由（コメント・内容）</label>
            <textarea v-model="editHistComment" class="glass" style="height: 100px;"></textarea>
          </div>

          <div class="modal-footer-btns">
            <button @click="isEditingHistory = false" class="btn-cancel-modal">キャンセル</button>
            <button @click="saveHistoryEdit" class="btn-commit-modal">
              <CheckCircle size="18" /> 変更を保存
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Add New Document Modal -->
    <div v-if="isAddingDoc" class="modal-overlay">
      <div class="modal-card premium-modal scale-up">
        <div class="modal-header">
          <h3>新規JASマニュアル・規定の登録</h3>
          <button @click="isAddingDoc = false" class="btn-close"><X /></button>
        </div>
        
        <div class="form-content">
          <div class="form-group">
            <label>文書のタイトル</label>
            <input v-model="newDocName" type="text" class="glass" placeholder="例: 有機肥料受入及び保管管理手順書" />
          </div>

          <div class="form-group">
            <label>概要（一言サマリー）</label>
            <input v-model="newDocSummary" type="text" class="glass" placeholder="例: 搬入時の一般資材混入や汚染を防ぐための保管方法について規定。" />
          </div>

          <div class="form-group">
            <label>JAS監査対策・チェックポイント</label>
            <textarea v-model="newDocAuditPoints" class="glass" style="height: 80px;" placeholder="例: 監査員には保管場所の区画写真と、一般肥料が混在していない現地状況を見せることで適合性を示せます。"></textarea>
          </div>

          <div class="form-group">
            <label>文書の本文（規定の条文）</label>
            <textarea v-model="newDocText" class="glass" style="height: 180px;" placeholder="【〇〇マニュアル】\n\n第1条..."></textarea>
          </div>

          <div class="modal-footer-btns">
            <button @click="isAddingDoc = false" class="btn-cancel-modal">キャンセル</button>
            <button @click="saveNewDoc" class="btn-commit-modal">
              <Save size="18" /> 新規文書を登録
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 印刷用原本一括レイアウト (全巻製本PDFエクスポート) -->
    <div class="all-manuals-print-container">
      
      <!-- 1. 表紙ページ (Cover Page) -->
      <div class="print-cover-page">
        <div class="cover-crown">
          <span class="crown-badge">有機JAS管理原本規定類</span>
        </div>

        <div class="cover-main-title">
          <h1>有機農産物 生産行程管理者</h1>
          <div class="subtitle">【有機JAS 組織管理・生産工程管理マニュアル全巻】</div>
        </div>

        <div class="cover-company-card">
          <div class="label">原本保管場所 / 組織認定事業者名：</div>
          <div class="company-name">株式会社 AGRI KAKUIDA</div>
          <p class="address"><span class="geo">〒899-4462</span> 鹿児島県霧島市福山町福山大田311-2</p>
        </div>

        <div class="cover-dates-box">
          <div class="date-row">
            <span class="label">原本改定日：</span>
            <span class="val">{{ selectedDoc?.originalRevisionDate || '平成24年11月1日・令和3年10月1日' }}</span>
          </div>
          <div class="date-row">
            <span class="label">最 終 見 直 し 日：</span>
            <span class="val">{{ selectedDoc?.reviewDate || '令和8年5月15日' }}</span>
          </div>
        </div>

        <!-- 改定履歴・改定内容一覧テーブル -->
        <div class="cover-history-section">
          <h3>【改定履歴・改定内容一覧】</h3>
          <p class="history-desc">※本マニュアルの全章・別紙にわたる改定内容を、最新順に統括集約した監査用証跡一覧です。</p>
          <table class="print-history-table">
            <thead>
              <tr>
                <th style="width: 12%">版数</th>
                <th style="width: 15%">改定日</th>
                <th style="width: 25%">改訂・承認責任者</th>
                <th style="width: 48%">改定理由・改定内容</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(h, hidx) in compiledHistory" :key="hidx">
                <td class="text-center font-bold">{{ h.version }}</td>
                <td class="text-center">{{ h.date }}</td>
                <td>{{ h.author }}</td>
                <td>{{ h.comment }}</td>
              </tr>
              <tr v-if="compiledHistory.length === 0">
                <td colspan="4" class="text-center text-muted" style="padding: 1.5rem;">登録されている改定履歴はありません。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2. 目次ページ (Table of Contents) -->
      <div class="print-toc-page">
        <div class="toc-header">
          <h2>有機JAS管理マニュアル 目次</h2>
          <div class="header-line"></div>
        </div>
        <div class="toc-list">
          <template v-for="cat in state.documents" :key="cat.id">
            <div class="toc-cat-group">
              <h3 class="toc-cat-title">{{ cat.title }}</h3>
              <div class="toc-items">
                <div v-for="item in cat.items" :key="item.id" class="toc-item">
                  <span class="toc-item-title">{{ item.name }}</span>
                  <span class="toc-item-dots"></span>
                  <span class="toc-item-ver">{{ item.version }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- 3. 各章の本文 (Body chapters bound sequentially with page-breaks) -->
      <div class="print-body-sections">
        <template v-for="cat in state.documents" :key="cat.id">
          <div v-for="item in cat.items" :key="item.id" class="print-chapter-block">
            <div class="chapter-print-header">
              <span class="header-left">有機JAS原本書類 | 株式会社 AGRI KAKUIDA</span>
              <span class="header-right">原本改定日: {{ item.originalRevisionDate || '平成24年11月1日・令和3年10月1日' }}</span>
            </div>
            
            <h2 class="chapter-print-title">{{ item.name }}</h2>
            
            <div class="chapter-print-meta-grid">
              <div class="meta-box">
                <span class="label">版数 / ステータス:</span>
                <span class="val">{{ item.version }} ({{ item.status === 'approved' ? '正式承認済' : '下書き' }})</span>
              </div>
              <div class="meta-box">
                <span class="label">見直し日:</span>
                <span class="val">{{ item.reviewDate || '令和8年5月15日' }}</span>
              </div>
            </div>

            <!-- JAS監査チェックポイントをマニュアルの各章の冒頭に差し込み（監査のおもてなし） -->
            <div class="chapter-print-audit-card">
              <h4>【JAS監査員への適合性提示の要点】</h4>
              <p>{{ item.auditPoints }}</p>
            </div>

            <!-- 本文 -->
            <div class="chapter-print-content">
              {{ item.text }}
            </div>
          </div>
        </template>
      </div>

    </div>

  </div>
</template>

<style scoped>
.manual-library-v2 {
  padding-bottom: 60px;
}

.lib-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.header-info .title-wrap {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.header-info h2 {
  font-size: 1.75rem;
  font-weight: 900;
}

.header-info small {
  font-size: 0.8rem;
  color: var(--primary);
  font-family: monospace;
}

.header-info p {
  color: var(--text-soft);
  font-size: 0.9rem;
}

.btn-audit-print {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-full);
  font-weight: 800;
  font-size: 0.85rem;
  color: var(--primary);
  border: 1px solid var(--primary-light);
}

/* 2 Column Layout */
.library-layout-grid {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 2rem;
  align-items: start;
}

/* Left Pane Styles */
.left-pane {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.category-block {
  padding: 1.5rem;
  border-radius: 20px;
}

.category-block .cat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.category-block .cat-header h3 {
  font-size: 1rem;
  font-weight: 900;
  color: var(--primary);
}

.btn-add-doc {
  background: transparent;
  color: var(--primary);
  font-weight: 800;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  transition: background 0.2s;
}

.btn-add-doc:hover {
  background: var(--primary-glow);
}

.doc-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.doc-item-card {
  padding: 1.25rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid var(--glass-border);
  cursor: pointer;
  transition: all 0.25s ease;
}

.doc-item-card:hover {
  background: rgba(255, 255, 255, 0.75);
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0,0,0,0.03);
}

.doc-item-card.active {
  background: white;
  border-color: var(--primary);
  box-shadow: 0 10px 25px rgba(16, 185, 129, 0.1);
}

.doc-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.doc-icon {
  color: var(--primary);
}

.doc-version {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--text-soft);
  font-weight: 700;
  background: var(--bg-surface);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.status-dot-badge {
  font-size: 0.65rem;
  font-weight: 900;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  margin-left: auto;
}

.status-dot-badge.approved {
  background: #e1f2df;
  color: #15803d;
}

.status-dot-badge.draft {
  background: #fef3c7;
  color: #b45309;
}

.doc-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-main);
  line-height: 1.3;
  margin-bottom: 0.4rem;
}

.doc-summary {
  font-size: 0.75rem;
  color: var(--text-soft);
  line-height: 1.4;
  margin-bottom: 0.75rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.doc-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.7rem;
  color: var(--text-muted);
  font-weight: 700;
}

.doc-date {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

/* Right Pane: Wiki System */
.right-pane {
  position: sticky;
  top: 90px;
}

.wiki-container {
  padding: 2.5rem;
  border-radius: 24px;
  min-height: 600px;
  display: flex;
  flex-direction: column;
}

.wiki-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid var(--glass-border);
  padding-bottom: 1.5rem;
  margin-bottom: 1.5rem;
}

.wiki-title-area h2 {
  font-size: 1.75rem;
  font-weight: 900;
  color: var(--text-main);
  margin-top: 0.5rem;
}

.wiki-meta-tags {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.ver-tag {
  font-family: monospace;
  font-size: 0.8rem;
  font-weight: 800;
  color: white;
  background: #334155;
  padding: 0.15rem 0.6rem;
  border-radius: 6px;
}

.status-badge {
  font-size: 0.75rem;
  font-weight: 900;
  padding: 0.15rem 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.status-badge:hover {
  filter: brightness(0.95);
  transform: translateY(-1px);
}

.status-badge.approved {
  background: #10b981;
  color: white;
}

.status-badge.draft {
  background: #f59e0b;
  color: white;
}

.approved-by-tag {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-soft);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

/* Action Buttons */
.wiki-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-wiki-edit {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 800;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  color: var(--text-main);
}

.btn-wiki-save-quick {
  background: var(--bg-surface);
  border: 1px solid var(--glass-border);
  color: var(--primary);
  font-size: 0.85rem;
  font-weight: 800;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.btn-wiki-save-ver {
  background: var(--primary);
  color: white;
  font-size: 0.85rem;
  font-weight: 800;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  box-shadow: 0 4px 12px var(--primary-glow);
}

.btn-wiki-cancel {
  background: #f1f5f9;
  color: #64748b;
  padding: 0.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
}

/* Audit Checklist Banner */
.audit-banner {
  background: #fffbeb;
  border: 1px solid #fef3c7;
  border-left: 5px solid #d97706;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.banner-icon-wrap {
  color: #d97706;
  display: flex;
  align-items: flex-start;
}

.banner-body h4 {
  font-size: 0.9rem;
  font-weight: 900;
  color: #b45309;
  margin-bottom: 0.25rem;
}

.banner-body p {
  font-size: 0.8rem;
  color: #78350f;
  line-height: 1.5;
  font-weight: 600;
}

/* Rendered Wiki Text Area */
.wiki-content-area {
  flex: 1;
  margin-bottom: 3rem;
}

.wiki-rendered-text {
  font-size: 1.05rem;
  color: #1e293b;
  line-height: 1.7;
  white-space: pre-wrap;
  font-weight: 400;
}

/* Editor form styles */
.editor-wrap {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.wiki-textarea {
  width: 100%;
  height: 350px;
  padding: 1.25rem;
  border-radius: 16px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.6;
  color: #333;
  resize: vertical;
}

.wiki-textarea:focus {
  border-color: var(--primary);
  outline: none;
  background: white;
}

.editor-note {
  font-size: 0.75rem;
  color: var(--text-soft);
  font-style: italic;
}

/* Timeline System */
.revision-history-section {
  border-top: 1px solid var(--glass-border);
  padding-top: 2rem;
}

.revision-history-section .section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  color: var(--text-main);
}

.revision-history-section .section-title h3 {
  font-size: 1.1rem;
  font-weight: 900;
}

.history-timeline {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: relative;
  padding-left: 1.5rem;
}

.history-timeline::before {
  content: '';
  position: absolute;
  top: 5px;
  bottom: 5px;
  left: 7px;
  width: 2px;
  background: var(--glass-border);
}

.timeline-item {
  position: relative;
}

.timeline-badge {
  position: absolute;
  left: -22px;
  top: 12px;
  background: white;
  border: 2px solid var(--primary);
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

.timeline-badge .num {
  display: none;
}

.timeline-panel {
  padding: 1rem 1.25rem;
  border-radius: 12px;
  background: rgba(255,255,255,0.4);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.4rem;
}

.timeline-header .author {
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--text-main);
}

.timeline-header .date {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-weight: 700;
}

.timeline-body p {
  font-size: 0.8rem;
  color: var(--text-soft);
  line-height: 1.4;
}

/* Empty detail state */
.empty-detail-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5rem;
  border-radius: 24px;
  text-align: center;
}

.empty-detail-state h3 {
  font-size: 1.25rem;
  font-weight: 800;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}

.empty-detail-state p {
  color: var(--text-soft);
  font-size: 0.9rem;
}

/* Modal and Overlays */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2500;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.premium-modal {
  width: 100%;
  max-width: 600px;
  padding: 2.5rem;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.3);
}

.form-desc {
  font-size: 0.85rem;
  color: var(--text-soft);
  line-height: 1.4;
  margin-bottom: 1.5rem;
}

.form-group-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.modal-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--glass-border);
}

.btn-cancel-modal {
  padding: 0.75rem 1.5rem;
  background: #f1f5f9;
  color: #475569;
  border-radius: 12px;
  font-weight: 800;
  font-size: 0.9rem;
}

.btn-commit-modal {
  padding: 0.75rem 1.5rem;
  background: var(--primary);
  color: white;
  border-radius: 12px;
  font-weight: 800;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 12px var(--primary-glow);
}

/* 農林水産省有機JAS公式連携モジュール スタイル */
.maff-sync-card {
  padding: 1.5rem;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(244, 63, 94, 0.01) 100%);
  border: 1.5px solid rgba(16, 185, 129, 0.15);
  box-shadow: 0 10px 30px rgba(16, 185, 129, 0.02);
  margin-bottom: 1.5rem;
}

.maff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.maff-badge {
  font-size: 0.65rem;
  font-weight: 900;
  color: #047857;
  background: #d1fae5;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-sm);
  letter-spacing: 0.05em;
}

.btn-maff-sync {
  background: white;
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #059669;
  font-size: 0.7rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(16, 185, 129, 0.05);
  cursor: pointer;
}

.btn-maff-sync:hover:not(:disabled) {
  background: #f0fdf4;
  border-color: #059669;
  transform: translateY(-1px);
}

.btn-maff-sync:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.maff-title {
  font-size: 1.15rem;
  font-weight: 900;
  color: #065f46;
  margin-bottom: 0.25rem;
}

.maff-sync-date {
  font-size: 0.7rem;
  color: var(--text-soft);
  font-weight: 700;
  margin-bottom: 1rem;
}

.maff-pdf-links {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.maff-pdf-link {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.85rem;
  background: white;
  border: 1px solid rgba(16, 185, 129, 0.1);
  border-radius: 10px;
  color: #0f172a;
  text-decoration: none;
  transition: all 0.2s ease;
}

.maff-pdf-link:hover {
  border-color: #10b981;
  background: #f0fdf4;
  transform: translateX(2px);
  box-shadow: 0 4px 8px rgba(16, 185, 129, 0.03);
}

.pdf-icon {
  color: #10b981;
  flex-shrink: 0;
}

.link-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.link-label {
  font-size: 0.8rem;
  font-weight: 800;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-size {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-weight: 800;
  background: #f1f5f9;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}

.maff-news-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0.5rem 0.25rem 0.5rem;
  border-top: 1px dashed rgba(16, 185, 129, 0.15);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 900;
  color: #047857;
  transition: color 0.2s;
}

.maff-news-toggle:hover {
  color: #059669;
}

.chevron-icon {
  transition: transform 0.3s ease;
}

.rotate-180 {
  transform: rotate(180deg);
}

.maff-news-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  max-height: 250px;
  overflow-y: auto;
}

.maff-news-item {
  padding-bottom: 0.75rem;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.05);
}

.maff-news-item:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.news-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.2rem;
}

.news-date {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-weight: 700;
}

.news-link-btn {
  font-size: 0.65rem;
  font-weight: 900;
  color: #10b981;
  text-decoration: none;
  background: #e0f2fe;
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
}

.news-link-btn:hover {
  background: #bae6fd;
}

.news-title {
  font-size: 0.75rem;
  font-weight: 800;
  color: #1e293b;
  line-height: 1.3;
  margin-bottom: 0.2rem;
}

.news-desc {
  font-size: 0.7rem;
  color: var(--text-soft);
  line-height: 1.4;
  font-weight: 500;
}

/* プレミアムアクションコントロール */
.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.btn-reset-fukuyama {
  padding: 0.6rem 1.2rem;
  font-size: 0.85rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.08);
  border: 1.5px solid rgba(16, 185, 129, 0.3);
  color: #047857;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-reset-fukuyama:hover {
  background: rgba(16, 185, 129, 0.16);
  border-color: #10b981;
  color: #065f46;
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.15);
}

.text-accent-gold {
  color: #d97706;
  filter: drop-shadow(0 0 2px rgba(217, 119, 6, 0.5));
}

/* 原本改定日・見直し日表示バー */
.wiki-dates-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-top: 0.75rem;
  padding: 0.5rem 0.85rem;
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.12);
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--text-soft);
  width: fit-content;
}

.meta-date-item strong {
  color: var(--primary);
  margin-right: 0.25rem;
}

/* 編集用メタグリッド */
.editor-meta-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: rgba(16, 185, 129, 0.02);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.editor-meta-grid .form-group label {
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--primary);
  margin-bottom: 0.35rem;
  display: block;
}

.editor-meta-grid .glass {
  background: white !important;
  border: 1px solid #cbd5e1 !important;
  color: #1e293b !important;
  padding: 0.6rem 0.85rem !important;
  border-radius: 8px !important;
  font-size: 0.9rem !important;
  width: 100%;
}

.editor-meta-grid .glass:focus {
  border-color: var(--primary) !important;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1) !important;
}

/* タイムライン履歴個別編集ボタン */
.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.timeline-header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn-edit-history-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  font-weight: 800;
  color: #64748b;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-edit-history-item:hover {
  background: #e2e8f0;
  color: var(--primary);
  border-color: var(--primary-light);
}

.mt-1 {
  margin-top: 1rem;
}

/* 一括適用チェックボックス・おもてなしスタイル */
.form-group-apply-wrapper {
  margin: 0.5rem 0 0.85rem 0;
  padding: 0.85rem 1.25rem;
  background: rgba(16, 185, 129, 0.03);
  border: 1px dashed rgba(16, 185, 129, 0.35);
  border-radius: 10px;
  display: flex;
  align-items: center;
}

.glass-checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  user-select: none;
  font-size: 0.82rem;
  color: #334155;
  width: 100%;
}

.glass-checkbox-input {
  appearance: none;
  width: 18px;
  height: 18px;
  border: 2px solid #cbd5e1;
  border-radius: 4px;
  outline: none;
  background: white;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s;
}

.glass-checkbox-input:checked {
  background: var(--primary) !important;
  border-color: var(--primary) !important;
}

.glass-checkbox-input:checked::after {
  content: '';
  position: absolute;
  width: 5px;
  height: 9px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  top: 2px;
}

.checkbox-highlight-text {
  line-height: 1.4;
}

.checkbox-highlight-text strong {
  color: var(--primary);
  font-weight: 800;
}
</style>

<!-- 印刷プレビューバグの100%解決とマニュアル専用のプロ仕様印刷定義 (非scoped) -->
<!-- 印刷プレビューバグの100%解決とマニュアル専用のプロ仕様印刷定義 (非scoped) -->
<style>
/* 画面表示時は一括印刷用コンテナを完全に非表示 */
body:not(.all-manual-print-active) .all-manuals-print-container {
  display: none !important;
}

body.all-manual-print-active .all-manuals-print-container {
  display: block !important;
}

/* 一括印刷がアクティブな場合、通常のWikiコンテナやサイドバーを非表示にする */
body.all-manual-print-active .wiki-container,
body.all-manual-print-active .left-pane,
body.all-manual-print-active .lib-header {
  display: none !important;
  height: 0 !important;
  overflow: hidden !important;
}

@media print {
  /* 一括印刷がアクティブな場合、通常のWikiコンテナやサイドバーを非表示にする（印刷時用） */
  body.all-manual-print-active .wiki-container,
  body.all-manual-print-active .left-pane,
  body.all-manual-print-active .lib-header {
    display: none !important;
    height: 0 !important;
    overflow: hidden !important;
  }

  /* 一括印刷が非活性な場合、一括コンテナは必ず非表示にする（印刷時用） */
  body:not(.all-manual-print-active) .all-manuals-print-container {
    display: none !important;
  }

  /* 一括印刷がアクティブな場合、一括コンテナを表示する（印刷時用） */
  body.all-manual-print-active .all-manuals-print-container {
    display: block !important;
  }
  /* 不要なUI要素（サイドバー、ヘッダー、メニュー、フッター等）をマニュアル印刷中のみ強制排除 */
  body.all-manual-print-active .sidebar,
  body.selected-chapter-print-active .sidebar,
  body.all-manual-print-active .sidebar-overlay,
  body.selected-chapter-print-active .sidebar-overlay,
  body.all-manual-print-active .btn-close-sidebar,
  body.selected-chapter-print-active .btn-close-sidebar,
  body.all-manual-print-active header,
  body.selected-chapter-print-active header,
  body.all-manual-print-active .pc-header,
  body.selected-chapter-print-active .pc-header,
  body.all-manual-print-active footer,
  body.selected-chapter-print-active footer,
  body.all-manual-print-active .pc-footer,
  body.selected-chapter-print-active .pc-footer,
  body.all-manual-print-active .lib-header,
  body.selected-chapter-print-active .lib-header,
  body.all-manual-print-active .left-pane,
  body.selected-chapter-print-active .left-pane,
  body.all-manual-print-active .wiki-actions,
  body.selected-chapter-print-active .wiki-actions,
  body.all-manual-print-active .btn-wiki-edit,
  body.selected-chapter-print-active .btn-wiki-edit,
  body.all-manual-print-active .btn-reset-fukuyama,
  body.selected-chapter-print-active .btn-reset-fukuyama,
  body.all-manual-print-active .btn-audit-print,
  body.selected-chapter-print-active .btn-audit-print,
  body.all-manual-print-active .global-toast,
  body.selected-chapter-print-active .global-toast,
  body.all-manual-print-active .toast,
  body.selected-chapter-print-active .toast,
  body.all-manual-print-active .modal-overlay,
  body.selected-chapter-print-active .modal-overlay,
  body.all-manual-print-active .nav-bar,
  body.selected-chapter-print-active .nav-bar {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    width: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    opacity: 0 !important;
  }

  /* Vueの入れ子・フレックスボックスによる高さいっぱいのクリッピング（真っ白バグ）を無効化 */
  html,
  body,
  #app,
  .app-container,
  .pc-layout,
  .main-content,
  .manual-library-v2,
  .library-layout-grid {
    background: #ffffff !important;
    color: #000000 !important;
    height: auto !important;
    min-height: auto !important;
    overflow: visible !important;
    display: block !important;
    position: static !important;
    width: 100% !important;
    box-shadow: none !important;
    border: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* メインコンテンツのサイドバー余白を無効化 */
  .main-content.with-sidebar {
    margin-left: 0 !important;
    padding: 0 !important;
    width: 100% !important;
  }

  /* 2カラム構成を1カラム全幅化 */
  .library-layout-grid {
    display: block !important;
    width: 100% !important;
  }

  .right-pane {
    position: static !important;
    width: 100% !important;
    display: block !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* ------------------------------------------
   * 1. 個別章印刷用のスタイル (従来)
   * ------------------------------------------ */
  body.selected-chapter-print-active .wiki-container {
    background: #ffffff !important;
    color: #000000 !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0.5cm 1cm !important;
    margin: 0 !important;
    width: 100% !important;
    min-height: auto !important;
    display: block !important;
    overflow: visible !important;
  }

  body.selected-chapter-print-active .wiki-meta-tags,
  body.selected-chapter-print-active .status-badge,
  body.selected-chapter-print-active .approved-by-tag,
  body.selected-chapter-print-active .ver-tag,
  body.selected-chapter-print-active .btn-edit-history-item {
    display: none !important;
  }

  body.selected-chapter-print-active .wiki-rendered-text {
    color: #000000 !important;
    font-size: 11pt !important;
    line-height: 1.7 !important;
    white-space: pre-wrap !important;
    font-family: "MS Mincho", "Hiragino Mincho ProN", serif !important;
  }

  body.selected-chapter-print-active .wiki-header h2 {
    color: #000000 !important;
    font-size: 20pt !important;
    font-weight: 900 !important;
    border-bottom: 2px solid #000000 !important;
    padding-bottom: 0.5rem !important;
    margin-top: 0 !important;
    margin-bottom: 1rem !important;
    font-family: "MS Gothic", "Hiragino Kaku Gothic ProN", sans-serif !important;
  }

  body.selected-chapter-print-active .wiki-dates-bar {
    background: #ffffff !important;
    border: 1px solid #000000 !important;
    padding: 0.4rem 0.6rem !important;
    margin-top: 0.5rem !important;
    margin-bottom: 1.5rem !important;
    width: 100% !important;
    display: flex !important;
    justify-content: flex-start !important;
    gap: 2rem !important;
  }

  /* ------------------------------------------
   * 2. マニュアル全巻一括製本印刷スタイル (最高プレミアム)
   * ------------------------------------------ */
  .all-manuals-print-container {
    font-family: "MS Mincho", "Hiragino Mincho ProN", serif !important;
    color: #000000 !important;
    width: 100% !important;
    background: white !important;
  }

  /* --- 2.1 表紙 (Cover Page) --- */
  .print-cover-page {
    page-break-after: always;
    min-height: 100vh;
    padding: 3.5cm 1.5cm 1.5cm 1.5cm !important;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    position: relative;
    border: 3px double #000000; /* 格式高い二重線枠 */
  }

  .cover-crown {
    margin-bottom: 2cm;
  }

  .crown-badge {
    border: 2px solid #000000;
    padding: 0.4rem 1.5rem;
    font-size: 14pt;
    font-weight: bold;
    font-family: "MS Gothic", sans-serif !important;
    letter-spacing: 0.2rem;
  }

  .cover-main-title {
    text-align: center;
    margin-bottom: 3.5cm;
  }

  .cover-main-title h1 {
    font-size: 32pt !important;
    font-weight: 900 !important;
    font-family: "MS Gothic", "Hiragino Kaku Gothic ProN", sans-serif !important;
    margin-bottom: 1rem !important;
    letter-spacing: 0.3rem;
  }

  .cover-main-title .subtitle {
    font-size: 13pt;
    font-weight: bold;
    color: #333333;
    letter-spacing: 0.05rem;
  }

  .cover-company-card {
    text-align: center;
    margin-bottom: 2cm;
    width: 80%;
    border-bottom: 1px solid #000000;
    padding-bottom: 1.5rem;
  }

  .cover-company-card .label {
    font-size: 11pt;
    margin-bottom: 0.5rem;
    color: #555555;
  }

  .cover-company-card .company-name {
    font-size: 20pt !important;
    font-weight: bold !important;
    font-family: "MS Gothic", sans-serif !important;
    margin-bottom: 0.5rem;
  }

  .cover-company-card .address {
    font-size: 10.5pt;
  }

  .cover-dates-box {
    width: 80%;
    border: 1px solid #000000;
    padding: 1rem 1.5rem;
    margin-bottom: 3cm;
  }

  .cover-dates-box .date-row {
    display: flex;
    justify-content: space-between;
    font-size: 11pt;
    line-height: 1.8;
  }

  .cover-dates-box .date-row strong,
  .cover-dates-box .date-row .label {
    font-family: "MS Gothic", sans-serif !important;
    font-weight: bold;
  }

  /* 表紙の下部：統括改定履歴一覧 */
  .cover-history-section {
    width: 100%;
    margin-top: auto;
    page-break-inside: avoid;
  }

  .cover-history-section h3 {
    font-size: 11pt !important;
    font-weight: bold !important;
    font-family: "MS Gothic", sans-serif !important;
    margin-bottom: 0.5rem !important;
    border-bottom: 1px solid #000000;
    padding-bottom: 0.2rem;
  }

  .cover-history-section .history-desc {
    font-size: 8pt;
    color: #555555;
    margin-bottom: 0.5rem;
  }

  .print-history-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0.5rem;
  }

  .print-history-table th,
  .print-history-table td {
    border: 1px solid #000000 !important;
    padding: 0.4rem 0.6rem !important;
    font-size: 8.5pt !important;
    text-align: left;
    line-height: 1.4;
  }

  .print-history-table th {
    background: #f2f2f2 !important;
    font-family: "MS Gothic", sans-serif !important;
    font-weight: bold;
  }

  /* --- 2.2 目次ページ (Table of Contents) --- */
  .print-toc-page {
    page-break-after: always;
    min-height: 100vh;
    padding: 2.5cm 2cm !important;
    box-sizing: border-box;
    border: 1px solid #e2e8f0;
  }

  .toc-header {
    text-align: center;
    margin-bottom: 2cm;
  }

  .toc-header h2 {
    font-size: 20pt !important;
    font-family: "MS Gothic", sans-serif !important;
    letter-spacing: 0.2rem;
    margin-bottom: 0.5rem;
  }

  .toc-header .header-line {
    width: 4cm;
    height: 1px;
    background: #000000;
    margin: 0 auto;
  }

  .toc-cat-group {
    margin-bottom: 1.5rem;
  }

  .toc-cat-title {
    font-size: 12pt !important;
    font-weight: bold !important;
    font-family: "MS Gothic", sans-serif !important;
    color: #000000 !important;
    border-bottom: 1px solid #000000;
    padding-bottom: 0.3rem;
    margin-bottom: 0.8rem;
  }

  .toc-items {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .toc-item {
    display: flex;
    align-items: flex-end;
    font-size: 10pt;
  }

  .toc-item-title {
    font-family: "MS Mincho", serif !important;
  }

  .toc-item-dots {
    flex: 1;
    border-bottom: 1px dotted #333333;
    margin: 0 0.5rem 0.2rem 0.5rem;
  }

  .toc-item-ver {
    font-family: "MS Gothic", sans-serif !important;
    font-weight: bold;
    min-width: 1.5cm;
    text-align: right;
  }

  /* --- 2.3 各章・別紙の本文 --- */
  .print-chapter-block {
    page-break-before: always;
    padding: 2cm 1.5cm !important;
    box-sizing: border-box;
    min-height: 100vh;
  }

  .chapter-print-header {
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #555555;
    border-bottom: 1px solid #000000;
    padding-bottom: 0.3rem;
    margin-bottom: 1.5rem;
    width: 100%;
  }

  .chapter-print-title {
    font-size: 20pt !important;
    font-weight: 900 !important;
    font-family: "MS Gothic", sans-serif !important;
    margin-bottom: 1rem !important;
    border-bottom: 2px solid #000000;
    padding-bottom: 0.5rem;
  }

  .chapter-print-meta-grid {
    display: flex;
    gap: 2rem;
    border: 1px solid #000000;
    padding: 0.5rem 1rem;
    margin-bottom: 1.5rem;
  }

  .chapter-print-meta-grid .meta-box {
    font-size: 9.5pt;
  }

  .chapter-print-meta-grid .label {
    font-weight: bold;
    font-family: "MS Gothic", sans-serif !important;
    margin-right: 0.5rem;
  }

  .chapter-print-audit-card {
    background: #f8fafc !important;
    border: 1px solid #cbd5e1 !important;
    border-left: 5px solid #000000 !important;
    padding: 0.8rem 1.2rem !important;
    margin-bottom: 1.5rem !important;
    page-break-inside: avoid;
  }

  .chapter-print-audit-card h4 {
    font-size: 9pt !important;
    font-weight: bold !important;
    font-family: "MS Gothic", sans-serif !important;
    color: #000000 !important;
    margin-bottom: 0.3rem !important;
  }

  .chapter-print-audit-card p {
    font-size: 8.5pt !important;
    color: #333333 !important;
    line-height: 1.4 !important;
    margin: 0 !important;
  }

  .chapter-print-content {
    font-size: 11pt !important;
    line-height: 1.8 !important;
    white-space: pre-wrap !important;
    font-family: "MS Mincho", "Hiragino Mincho ProN", serif !important;
    color: #000000 !important;
  }
}
</style>

