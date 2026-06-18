<script setup>
import { ref, computed } from 'vue';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { 
  FileSpreadsheet, 
  FileDown, 
  Printer, 
  ChevronRight,
  CheckCircle2,
  Clock,
  FolderArchive,
  DownloadCloud,
  Loader,
  ShieldCheck,
  Plus,
  Trash2,
  ImageIcon,
  X,
  AlertTriangle
} from 'lucide-vue-next';
import { state, actions } from '../../store';

// Lightbox state
const activePreviewUrl = ref(null);

// Accordion open state
const openSeal = ref(false);
const openCorrective = ref(false);

const documents = [
  { id: 'd1', name: '年間工程管理記録（作業報告書）', status: 'ready' },
  { id: 'd2', name: '機材清浄・洗浄記録表', status: 'ready' },
  { id: 'd3', name: '格付実績・JASマーク受払台帳', status: 'ready' },
  { id: 'd4', name: '出荷・販売記録一覧', status: 'ready' },
  { id: 'd5', name: '繰越資材・種苗（棚卸）管理台帳', status: 'ready' },
];

const handlePrint = (name) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    actions.showToast('ポップアップがブロックされました。ブラウザの設定で許可してください。', 'warning');
    return;
  }

  const farm = state.farmInfo || {};
  const fields = state.masters.m_field || [];
  const equipments = state.masters.m_equipment || [];
  
  let html = '';
  let title = '';
  let orientation = 'portrait'; // portrait or landscape

  if (name.includes('年間工程管理記録')) {
    orientation = 'portrait';
    title = '年間工程管理記録（栽培管理台帳）';
    const workRecords = [...(state.records.t_work_record || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const rows = workRecords.map(r => {
      const fieldName = fields.find(f => String(f.id) === String(r.fieldId))?.name || '';
      const eqNames = (r.equipmentIds || []).length > 0
        ? (r.equipmentIds || []).map(id => equipments.find(e => e.id === id)?.name || '').filter(Boolean).join(', ')
        : (r.equipmentNames || '');
      const workContent = r.content || '';
      const isMaterialOp = /施肥|農薬|防除|消毒|薬剤/.test(workContent);
      const csvSeeds = (r.seeds || []).filter(s => !s.taskType);
      const manualSeeds = (r.seeds || []).filter(s => !!s.taskType);
      const seedNames = [
        ...manualSeeds.map(s => `${s.taskType}:${s.name}(${s.quantity || '-'})`),
        ...(!isMaterialOp ? csvSeeds.map(s => `${s.name}(${s.quantity || '-'})`) : [])
      ].join(', ');
      const matNames = [
        ...(isMaterialOp ? csvSeeds.map(s => `${s.name}(${s.quantity || '-'})`) : []),
        ...(r.materials || []).map(m => `${m.name}(${m.quantity || '-'})`)
      ].join(', ');
      const isWashed = r.isWashed || !!r.cleaningMethod;
      const washDisplay = r.washMethod || r.cleaningMethod || (isWashed ? '水洗い' : '');

      return `
        <tr>
          <td style="text-align:center;">${(r.date || '').split('-').slice(1).join('/')}</td>
          <td><strong>${fieldName}</strong></td>
          <td>${r.content || '-'}</td>
          <td>${seedNames || '-'}</td>
          <td>${matNames || '-'}</td>
          <td>${eqNames || '-'}</td>
          <td style="text-align:center;">${isWashed ? (washDisplay || '水洗い') : '-'}</td>
          <td>${r.workerName || '-'}</td>
        </tr>
      `;
    }).join('');

    html = `
      <div class="jas-document landscape">
        <div class="jas-top-bar">
          <div class="title-section">
            <h1>年間工程管理記録（作業報告書）</h1>
            <p>生産者: ${farm.name || '（農園名 未設定）'}</p>
          </div>
          <div class="meta-section">
            <p>様式No: C-31</p>
            <p>印刷日: ${new Date().toISOString().split('T')[0]}</p>
          </div>
        </div>
        <table class="jas-main-table">
          <thead>
            <tr>
              <th width="60">日分</th>
              <th width="120">圃場</th>
              <th>作業内容・工程</th>
              <th>使用種苗</th>
              <th>使用資材（肥料・農薬）</th>
              <th>使用機械・器具</th>
              <th width="80">機材洗浄</th>
              <th width="80">実施者</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="8" style="text-align:center; color:#94a3b8;">記録データがありません</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  } 
  else if (name.includes('機材清浄')) {
    title = '機材清浄・洗浄記録表';
    const workRecords = [...(state.records.t_work_record || [])]
      .filter(r => ((r.equipmentIds || []).length > 0 || !!r.equipmentNames) && (r.isWashed || !!r.cleaningMethod))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const rows = workRecords.map(r => {
      const fieldName = fields.find(f => String(f.id) === String(r.fieldId))?.name || '';
      const eqNames = (r.equipmentIds || []).length > 0
        ? r.equipmentIds.map(id => equipments.find(e => e.id === id)?.name || '').filter(Boolean).join(', ')
        : (r.equipmentNames || '');
      const isWashed = r.isWashed || !!r.cleaningMethod;
      const washDisplay = r.washMethod || r.cleaningMethod || (isWashed ? '水洗い' : '');
      return `
        <tr>
          <td style="text-align:center;">${r.date}</td>
          <td>${fieldName}</td>
          <td><strong>${eqNames}</strong></td>
          <td style="text-align:center; font-weight:bold; color:${isWashed ? '#16a34a' : '#ef4444'};">${isWashed ? '済' : '未'}</td>
          <td>${isWashed ? (washDisplay || '水洗い') : '-'}</td>
          <td>${r.workerName || '-'}</td>
        </tr>
      `;
    }).join('');

    html = `
      <div class="jas-document">
        <div class="jas-top-bar">
          <div class="title-section">
            <h1>機材清浄・洗浄記録表</h1>
            <p>生産者: ${farm.name || '（農園名 未設定）'}</p>
          </div>
          <div class="meta-section">
            <p>様式No: C-34</p>
            <p>印刷日: ${new Date().toISOString().split('T')[0]}</p>
          </div>
        </div>
        <table class="jas-main-table">
          <thead>
            <tr>
              <th width="100">使用日分</th>
              <th width="120">使用圃場</th>
              <th>使用した機械・器具名</th>
              <th width="80">洗浄記録</th>
              <th width="120">洗浄方法・手順</th>
              <th width="100">作業実施責任者</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">機材使用・洗浄記録がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  } 
  else if (name.includes('格付実績')) {
    title = '格付実績・JASマーク受払台帳';
    const sealLogs = [...(state.records.t_jas_seal_record || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const rows = sealLogs.map(s => `
      <tr>
        <td style="text-align:center;">${s.date}</td>
        <td style="text-align:center; font-weight:bold;">
          <span style="color:${s.type === 'purchase' ? '#16a34a' : s.type === 'use' ? '#2563eb' : '#dc2626'}">
            ${s.type === 'purchase' ? '入庫' : s.type === 'use' ? '貼付' : '汚損'}
          </span>
        </td>
        <td style="text-align:right; font-weight:bold;">${s.qty} 枚</td>
        <td style="font-family:monospace; text-align:center;">${s.voucherNo || '-'}</td>
        <td>${(s.remarks || '-').replace('自動貼付', '貼付')}</td>
        <td></td>
        <td></td>
      </tr>
    `).join('');

    html = `
      <div class="jas-document">
        <div class="jas-top-bar">
          <div class="title-section">
            <h1>格付実績・JASマーク受払台帳</h1>
            <p>生産者: ${farm.name || '（農園名 未設定）'}</p>
          </div>
          <div class="meta-section">
            <p>様式No: A-24</p>
            <p>印刷日: ${new Date().toISOString().split('T')[0]}</p>
          </div>
        </div>
        <div style="margin-bottom:15px; font-size:12px; background:#f8fafc; border:1px solid #cbd5e1; padding:10px; border-radius:8px;">
          <strong>【現在のマーク在庫状況】</strong> 
          購入受入累計 ${sealTotals.value.purchased}枚 | 
          貼付（使用）累計 ${sealTotals.value.used}枚 | 
          汚損廃棄: ${sealTotals.value.damaged}枚 | 
          <strong>有効在庫数: ${sealTotals.value.stock}枚</strong>
        </div>
        <table class="jas-main-table">
          <thead>
            <tr>
              <th width="100">区分</th>
              <th width="120">管理区分</th>
              <th width="100">数量（枚数）</th>
              <th width="150">紐付け伝票番号</th>
              <th>用途・対象出荷・廃棄理由等</th>
              <th width="80">格付担当者</th>
              <th width="80">出荷担当者</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">JASマーク受払記録がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  } 
  else if (name.includes('出荷・販売')) {
    title = '出荷・販売記録一覧';
    const deliveries = [...(state.records.t_delivery_note || [])].sort((a, b) => new Date(a.date) - new Date(b.date));

    const rows = deliveries.map(d => `
      <tr>
        <td style="text-align:center;">${d.date}</td>
        <td style="font-family:monospace; font-weight:bold; text-align:center;">${d.slipNo || '-'}</td>
        <td><strong>${d.partnerName || '指定なし'}</strong></td>
        <td>${(d.itemDetails || []).map(i => `${i.name} ${i.quantity}${i.unit || 'kg'}`).join('、') || d.items || '-'}</td>
        <td style="text-align:right; font-weight:bold;">¥${Number(d.amount || 0).toLocaleString()}</td>
      </tr>
    `).join('');

    html = `
      <div class="jas-document">
        <div class="jas-top-bar">
          <div class="title-section">
            <h1>有機農産物 出荷・販売管理台帳</h1>
            <p>生産者: ${farm.name || '（農園名 未設定）'}</p>
          </div>
          <div class="meta-section">
            <p>様式No: C-33</p>
            <p>印刷日: ${new Date().toISOString().split('T')[0]}</p>
          </div>
        </div>
        <table class="jas-main-table">
          <thead>
            <tr>
              <th width="100">出荷日分</th>
              <th width="120">伝票番号</th>
              <th width="180">納品先・出荷先</th>
              <th>出荷品目詳細（有機・数量・単価）</th>
              <th width="120">売上合計額</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">出荷・販売記録がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }
  else if (name.includes('繰越') || name.includes('種苗')) {
    title = '繰越資材・種苗（棚卸）管理台帳';
    
    let seedInv = [...(state.records.t_seed_inventory || [])];
    
    // リアルな購入データから一本化（過去半年以内）
    if (seedInv.length === 0) {
      const uniqueItems = new Map();
      const INVENTORY_CATEGORIES = new Set(['種苗', '肥料・農薬', '資材']);
      const INVENTORY_DOCTYPES = new Set(['種苗納品書', '肥料・農薬納品書', '資材適合書', '納品書']);
      const receipts = (state.records.t_material_receipt || []).filter(r =>
        r.materialName &&
        r.docType !== '資材・適合証明書' &&
        (INVENTORY_CATEGORIES.has(r.category) || INVENTORY_DOCTYPES.has(r.docType))
      );
      const halfYearAgo = new Date();
      halfYearAgo.setMonth(halfYearAgo.getMonth() - 6);

      receipts.forEach(r => {
        const rDate = r.date ? new Date(r.date) : null;
        if (!rDate || rDate >= halfYearAgo) {
          let cat = r.category || '資材';
          if (cat === '肥料' || cat === '農薬') cat = '肥料・農薬';

          uniqueItems.set(r.materialName, {
            materialName: r.materialName,
            category: cat,
            purchaseDate: r.date || '',
            supplier: r.supplier || r.partnerName || '自家採取',
            quantityBought: r.quantity || '不明',
            stockQuantity: '確認中 (未棚卸)',
            updatedAt: r.date || ''
          });
        }
      });
      seedInv = Array.from(uniqueItems.values());
    }

    const rows = seedInv.map(inv => `
      <tr>
        <td style="text-align:center; font-weight:bold; color:#475569;">${inv.category || '種苗'}</td>
        <td><strong>${inv.materialName}</strong></td>
        <td style="text-align:center;">${inv.purchaseDate || '不明'}</td>
        <td>${inv.supplier || '不明'}</td>
        <td style="text-align:center;">${inv.quantityBought || '-'}</td>
        <td style="text-align:center; font-weight:bold; color:#064e3b; background:#f0fdf4;">
          ${inv.stockQuantity || '0 (使い切り)'}
        </td>
        <td style="text-align:center;">${inv.updatedAt || '-'}</td>
        <td>有機JAS基準適合（非遺伝子組換え・許容資材確認済）</td>
      </tr>
    `).join('');

    html = `
      <div class="jas-document">
        <div class="jas-top-bar">
          <div class="title-section">
            <h1>繰越資材・種苗（棚卸）管理台帳</h1>
            <p>生産者: ${farm.name || '（農園名 未設定）'}</p>
          </div>
          <div class="meta-section">
            <p>様式No: C-32 (繰越管理帳)</p>
            <p>印刷日: ${new Date().toISOString().split('T')[0]}</p>
          </div>
        </div>
        <div style="margin-bottom:15px; font-size:12px; background:#f0f9ff; border:1px solid #bae6fd; padding:12px; border-radius:8px; color:#0369a1; line-height:1.6;">
          <strong>【有機JAS証明・適合性監査書類】</strong><br>
          本台帳は、受入した全ての種苗・肥料・農薬等（現在庫・繰越数量）を正確に棚卸し・証明する書類です。<br>
          受（購入）した数量、使用した数量、および手元残在庫（繰越数）が完全に一致していることを証明し、次期生産活動に引き継ぐために提出されます。
        </div>
        <table class="jas-main-table">
          <thead>
            <tr>
              <th width="100">区分</th>
              <th>資材・種苗名（品種・ロット・銘柄名）</th>
              <th width="100">受入（購入）日</th>
              <th width="150">仕入先（購入先）</th>
              <th width="100">受入総数量</th>
              <th width="120" style="background:#f3e8ff; color:#6b21a8;">現在庫（繰越数）</th>
              <th width="100">棚卸実施日</th>
              <th>適合判定・確認事項</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="8" style="text-align:center; color:#94a3b8;">棚卸および購入資材の記録がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        body { font-family: "BIZ UDPMincho", "Hiragino Mincho ProN", serif; padding: 20px; color: #1e293b; line-height: 1.5; background: #fff; }
        .jas-document { width: 100%; box-sizing: border-box; }
        .jas-top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
        .title-section h1 { font-size: 20px; font-weight: 900; margin: 0; }
        .title-section p { font-size: 12px; margin: 5px 0 0 0; color: #475569; }
        .meta-section { text-align: right; font-size: 11px; }
        .meta-section p { margin: 2px 0; }
        .jas-main-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
        .jas-main-table th, .jas-main-table td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
        .jas-main-table th { background: #f1f5f9; font-weight: 800; color: #0f172a; }
        .jas-main-table tr:nth-child(even) { background-color: #f8fafc; }
        @page { margin: 1.2cm; }
        @media print {
          body { padding: 0; }
          .jas-main-table th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      ${html}
      <script>
        window.onload = function() {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

const handleDownload = (name, type) => {
  if (type === 'PDF') {
    actions.showToast('印刷ダイアログが開きます。「PDFに保存」を選択してください', 'info');
    handlePrint(name);
    return;
  }

  // Excel (CSV) Generating Logics
  let headers = [];
  let rows = [];
  let filename = '';

  const fields = state.masters.m_field || [];
  const equipments = state.masters.m_equipment || [];

  if (name.includes('年間工程管理記録')) {
    filename = '年間工程管理記録（作業報告書）';
    headers = ['日付', '圃場', '作業内容', '使用種苗', '使用資材', '使用機材', '機材洗浄', '実施者'];
    const workRecords = [...(state.records.t_work_record || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    rows = workRecords.map(r => {
      const fieldName = fields.find(f => String(f.id) === String(r.fieldId))?.name || '';
      const eqNames = (r.equipmentIds || []).length > 0
        ? (r.equipmentIds || []).map(id => equipments.find(e => e.id === id)?.name || '').filter(Boolean).join('; ')
        : (r.equipmentNames || '');
      const workContent = r.content || '';
      const isMaterialOp = /施肥|農薬|防除|消毒|薬剤/.test(workContent);
      const csvSeeds = (r.seeds || []).filter(s => !s.taskType);
      const manualSeeds = (r.seeds || []).filter(s => !!s.taskType);
      const seedNames = [
        ...manualSeeds.map(s => `${s.taskType}:${s.name}(${s.quantity || '-'})`),
        ...(!isMaterialOp ? csvSeeds.map(s => `${s.name}(${s.quantity || '-'})`) : [])
      ].join('; ');
      const matNames = [
        ...(isMaterialOp ? csvSeeds.map(s => `${s.name}(${s.quantity || '-'})`) : []),
        ...(r.materials || []).map(m => `${m.name}(${m.quantity || '-'})`)
      ].join('; ');
      const isWashed = r.isWashed || !!r.cleaningMethod;
      const washDisplay = r.washMethod || r.cleaningMethod || (isWashed ? '水洗い' : '');
      return [
        r.date,
        fieldName,
        r.content || '',
        seedNames,
        matNames,
        eqNames,
        isWashed ? (washDisplay || '水洗い') : '未洗浄',
        r.workerName || ''
      ];
    });
  } 
  else if (name.includes('機材清浄')) {
    filename = '機材清浄・洗浄記録表';
    headers = ['使用日付', '使用圃場', '使用機械・器具名', '洗浄記録', '洗浄状況', '実施責任者'];
    const workRecords = [...(state.records.t_work_record || [])]
      .filter(r => ((r.equipmentIds || []).length > 0 || !!r.equipmentNames) && (r.isWashed || !!r.cleaningMethod))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    rows = workRecords.map(r => {
      const fieldName = fields.find(f => String(f.id) === String(r.fieldId))?.name || '';
      const eqNames = (r.equipmentIds || []).length > 0
        ? r.equipmentIds.map(id => equipments.find(e => e.id === id)?.name || '').filter(Boolean).join('; ')
        : (r.equipmentNames || '');
      const isWashed = r.isWashed || !!r.cleaningMethod;
      const washDisplay = r.washMethod || r.cleaningMethod || (isWashed ? '水洗い' : '');
      return [
        r.date,
        fieldName,
        eqNames,
        isWashed ? '済' : '未',
        isWashed ? (washDisplay || '水洗い') : '-',
        r.workerName || ''
      ];
    });
  } 
  else if (name.includes('格付実績')) {
    filename = '格付実績・JASマーク受払台帳';
    headers = ['区分', '管理区分', '数量（枚数）', '紐付け伝票番号', '用途・備考'];
    const sealLogs = [...(state.records.t_jas_seal_record || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    rows = sealLogs.map(s => [
      s.date,
      s.type === 'purchase' ? '入庫' : s.type === 'use' ? '貼付' : '汚損',
      s.qty,
      s.voucherNo || '-',
      s.remarks || '-'
    ]);
  } 
  else if (name.includes('出荷・販売')) {
    filename = '有機農産物_出荷・販売記録一覧';
    headers = ['出荷日付', '伝票番号', '納品先', '出荷品目詳細', '合計金額'];
    const deliveries = [...(state.records.t_delivery_note || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    rows = deliveries.map(d => [
      d.date,
      d.slipNo || '-',
      d.partnerName || '指定なし',
      (d.itemDetails || []).map(i => `${i.name} ${i.quantity}${i.unit || 'kg'}`).join('、') || d.items || '-',
      d.amount || 0
    ]);
  }
  else if (name.includes('繰越') || name.includes('種苗')) {
    filename = '繰越資材_種苗棚卸_管理台帳';
    headers = ['区分', '資材・種苗名', '受入日', '仕入先', '受入総数量', '現在庫（繰越数）', '棚卸日', '適合判定・確認事項'];
    
    let seedInv = [...(state.records.t_seed_inventory || [])];
    if (seedInv.length === 0) {
      const uniqueItems = new Map();
      const INVENTORY_CATEGORIES = new Set(['種苗', '肥料・農薬', '資材']);
      const INVENTORY_DOCTYPES = new Set(['種苗納品書', '肥料・農薬納品書', '資材適合書', '納品書']);
      const receipts = (state.records.t_material_receipt || []).filter(r =>
        r.materialName &&
        r.docType !== '資材・適合証明書' &&
        (INVENTORY_CATEGORIES.has(r.category) || INVENTORY_DOCTYPES.has(r.docType))
      );
      const halfYearAgo = new Date();
      halfYearAgo.setMonth(halfYearAgo.getMonth() - 6);

      receipts.forEach(r => {
        const rDate = r.date ? new Date(r.date) : null;
        if (!rDate || rDate >= halfYearAgo) {
          let cat = r.category || '資材';
          if (cat === '肥料' || cat === '農薬') cat = '肥料・農薬';

          uniqueItems.set(r.materialName, {
            materialName: r.materialName,
            category: cat,
            purchaseDate: r.date || '',
            supplier: r.supplier || r.partnerName || '自家採取',
            quantityBought: r.quantity || '不明',
            stockQuantity: '確認中 (未棚卸)',
            updatedAt: r.date || ''
          });
        }
      });
      seedInv = Array.from(uniqueItems.values());
    }

    rows = seedInv.map(inv => [
      inv.category || '種苗',
      inv.materialName,
      inv.purchaseDate || '不明',
      inv.supplier || '不明',
      inv.quantityBought || '-',
      inv.stockQuantity || '0 (使い切り)',
      inv.updatedAt || '-',
      '有機JAS基準適合（非遺伝子組換え・許容資材確認済）'
    ]);
  }

  if (headers.length === 0) return;

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const csvUrl = URL.createObjectURL(blob);
  link.href = csvUrl;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(csvUrl), 1000);
};

// ==========================================
// 1-Click JAS Audit Compiler Engine (v3.1.2 Ultimate)
// ==========================================
const isGenerating = ref(false);
const generationProgress = ref(0);
const generationStatusText = ref('');

const statusSteps = [
  '農園基本情報の読み込み中...',
  '全圃場の栽培管理記録（台帳）をスキャン中...',
  '使用資材（肥料・農薬）有機JAS適合判定中...',
  '機材洗浄のエビデンス・写真・ログを検証中...',
  '有機JASマーク受払シールシリアルの引き当て集計中...',
  '前年指摘・是正措置完了報告エビデンスを照合中...',
  'JAS提出用・統合監査報告パッケージをビルド中...'
];

// JAS Seal Ledger Totals
const sealTotals = computed(() => {
  const logs = state.records.t_jas_seal_record || [];
  const purchased = logs.filter(l => l.type === 'purchase').reduce((sum, l) => sum + Number(l.qty), 0);
  const used = logs.filter(l => l.type === 'use').reduce((sum, l) => sum + Number(l.qty), 0);
  const damaged = logs.filter(l => l.type === 'damage').reduce((sum, l) => sum + Number(l.qty), 0);
  const stock = purchased - used - damaged;
  return { purchased, used, damaged, stock };
});

const sortedSealLogs = computed(() =>
  [...(state.records.t_jas_seal_record || [])].sort((a, b) => new Date(a.date) - new Date(b.date))
);

// Interactive Seal log form
const isAddingSealLog = ref(false);
const newSealLog = ref({
  date: new Date().toISOString().split('T')[0],
  type: 'use',
  qty: 1, // 1 voucher = 1 seal used
  voucherNo: '',
  remarks: ''
});

const saveSealLog = () => {
  if (newSealLog.value.type === 'use' && !newSealLog.value.voucherNo) {
    actions.showToast('貼付（使用）の場合は、紐付ける伝票番号を入力してください', 'warning');
    return;
  }
  const log = {
    ...newSealLog.value,
    id: 'seal_' + Date.now()
  };
  if (!state.records.t_jas_seal_record) state.records.t_jas_seal_record = [];
  state.records.t_jas_seal_record.push(log);
  actions.syncToCloud();
  isAddingSealLog.value = false;
  
  // reset
  newSealLog.value = {
    date: new Date().toISOString().split('T')[0],
    type: 'use',
    qty: 1,
    voucherNo: '',
    remarks: ''
  };
};

const deleteSealLog = (id) => {
  state.records.t_jas_seal_record = state.records.t_jas_seal_record.filter(l => l.id !== id);
  actions.syncToCloud();
};

// Interactive Corrective form
const isAddingCorrective = ref(false);
const newCorrective = ref({
  date: new Date().toISOString().split('T')[0],
  issue: '',
  solution: '',
  certUrl: null,
  dateSolved: new Date().toISOString().split('T')[0]
});

const saveCorrective = () => {
  if (!newCorrective.value.issue || !newCorrective.value.solution) {
    actions.showToast('指摘内容と是正内容を入力してください', 'warning');
    return;
  }
  const log = {
    ...newCorrective.value,
    id: 'corr_' + Date.now()
  };
  if (!state.records.t_corrective_action_record) state.records.t_corrective_action_record = [];
  state.records.t_corrective_action_record.push(log);
  actions.syncToCloud();
  isAddingCorrective.value = false;
  
  // reset
  newCorrective.value = {
    date: new Date().toISOString().split('T')[0],
    issue: '',
    solution: '',
    certUrl: null,
    dateSolved: new Date().toISOString().split('T')[0]
  };
};

const deleteCorrective = (id) => {
  state.records.t_corrective_action_record = state.records.t_corrective_action_record.filter(l => l.id !== id);
  actions.syncToCloud();
};

// ===== PDF-lib 共通ユーティリティ =====
async function loadPdfBytes(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`PDF取得失敗: ${path}`);
  return await res.arrayBuffer();
}

async function openPdfForPrint(pdfDoc) {
  try {
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      actions.showToast('ポップアップがブロックされました。ブラウザで許可してください。', 'warning');
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    actions.showToast('PDF印刷エラー: ' + e.message, 'error');
  }
}

function reiwaStr(dateStr) {
  const d = new Date(dateStr);
  return {
    year:  String(d.getFullYear() - 2018),
    month: String(d.getMonth() + 1),
    day:   String(d.getDate()),
  };
}

// ===== 防虫・防鼠駆除使用資材自己宣言 (24-02) =====
const printBounch = async () => {
  try {
    const bytes = await loadPdfBytes('/forms/24-02.pdf');
    const pdfDoc = await PDFDocument.load(bytes);
    await openPdfForPrint(pdfDoc);
  } catch (e) {
    actions.showToast('PDF生成エラー: ' + e.message, 'error');
  }
};

// ===== 運送契約認書 (25-02) =====
const printUnsou = async () => {
  try {
    const bytes = await loadPdfBytes('/forms/25-02.pdf');
    const pdfDoc = await PDFDocument.load(bytes);
    await openPdfForPrint(pdfDoc);
  } catch (e) {
    actions.showToast('PDF生成エラー: ' + e.message, 'error');
  }
};

// ===== 遺伝子組換え証明書（自己宣言）23-02) =====
const printHousouzai = async () => {
  try {
    const bytes = await loadPdfBytes('/forms/23-02.pdf');
    const pdfDoc = await PDFDocument.load(bytes);
    await openPdfForPrint(pdfDoc);
  } catch (e) {
    actions.showToast('PDF生成エラー: ' + e.message, 'error');
  }
};

// ===== 種苗証明書 (08) =====
const seedCertDate = ref(new Date().toISOString().split('T')[0]);

const addSeedCertRow = () => {
  if (!state.records.t_seed_cert_rows) state.records.t_seed_cert_rows = [];
  state.records.t_seed_cert_rows.push({ cropName: '', variety: '', organic: '有機', originNo: '1', originSource: '', reasonNo: '', reason: '', id: 'sc_' + Date.now() });
  actions.syncToCloud();
};

const deleteSeedCertRow = (id) => {
  state.records.t_seed_cert_rows = (state.records.t_seed_cert_rows || []).filter(r => r.id !== id);
  actions.syncToCloud();
};

const printSeedCert = async () => {
  try {
    const [pdfBytes, fontBytes] = await Promise.all([
      loadPdfBytes('/forms/08.pdf'),
      loadPdfBytes('/fonts/NotoSansJP-Regular.otf'),
    ]);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.registerFontkit(fontkit);
    const jpFont  = await pdfDoc.embedFont(fontBytes);
    const numFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const black = rgb(0, 0, 0);
    const page = pdfDoc.getPages()[0];

    // 日付（実測: 日付枠 x=633.1, y=90、（19.3）    const { year, month, day } = reiwaStr(seedCertDate.value);
    const dOpts = { font: numFont, size: 10, color: black };
    page.drawText(year,  { x: 700, y: 101, ...dOpts });
    page.drawText(month, { x: 723, y: 101, ...dOpts });
    page.drawText(day,   { x: 746, y: 101, ...dOpts });

    // テーブルデータ行（実測座標）    // 列: 農産物名34.44-181.94, 品種名182.9-329.93,
    //         有機330.89-397.63, 由来番号=398.59-428.23,
    //         購入先428.35-602.5, 非有機番号=603.46-633.1, 理由=633.22-807.84
    // 第1行 bottom=447.22, h=15.12 -> text_y=452
    // 以降行 pitch=16.56
    const rows = state.records.t_seed_cert_rows || [];
    const ROW1_Y = 452;
    const PITCH  = 16.56;
    const COL = {
      crop:     37,   // 農産物名左端+3pt
      variety:  186,  // 品種名左端+3pt
      organic:  350,  // 有機非有機中央寄せ
      originNo: 411,  // 由来番号 中央 (398.59-428.23)
      source:   432,  // 購入先左端+3pt
      reasonNo: 616,  // 非有機理由番号 中央 (603.46-633.1)
      reason:   637,  // 理由 左端+3pt
    };
    const clip = (s, max) => (s || '').substring(0, max);

    rows.slice(0, 15).forEach((r, i) => {
      const y = ROW1_Y - i * PITCH;
      const j = { font: jpFont,  size: 7.5, color: black };
      const n = { font: numFont, size: 8,   color: black };
      if (r.cropName)     page.drawText(clip(r.cropName, 12),     { x: COL.crop,     y, ...j });
      if (r.variety)      page.drawText(clip(r.variety, 12),      { x: COL.variety,  y, ...j });
                          page.drawText(r.organic === '非有機' ? '非有機' : '有機', { x: COL.organic, y, ...j });
                          page.drawText(String(r.originNo || '1'), { x: COL.originNo, y, ...n });
      if (r.originSource) page.drawText(clip(r.originSource, 16), { x: COL.source,   y, ...j });
      if (r.reasonNo)     page.drawText(String(r.reasonNo),       { x: COL.reasonNo, y, ...n });
      if (r.reason)       page.drawText(clip(r.reason, 18),       { x: COL.reason,   y, ...j });
    });

    await openPdfForPrint(pdfDoc);
  } catch (e) {
    actions.showToast('PDF生成エラー: ' + e.message, 'error');
  }
};

const startExport = () => {
  if (isGenerating.value) return;
  isGenerating.value = true;
  generationProgress.value = 0;
  generationStatusText.value = statusSteps[0];
  
  const interval = setInterval(() => {
    generationProgress.value += 4;
    
    // Status text updates dynamically based on progress
    const stepIdx = Math.min(Math.floor((generationProgress.value / 100) * statusSteps.length), statusSteps.length - 1);
    generationStatusText.value = statusSteps[stepIdx];
    
    if (generationProgress.value >= 100) {
      clearInterval(interval);
      triggerDownload();
      setTimeout(() => {
        isGenerating.value = false;
        generationProgress.value = 0;
      }, 1200); // Complete animation display
    }
  }, 70);
};

const triggerDownload = () => {
  const farm = state.farmInfo || {};
  const fields = state.masters.m_field || [];
  const materials = state.masters.m_material || [];
  const workRecords = state.records.t_work_record || [];
  const seals = state.records.t_jas_seal_record || [];
  const correctives = state.records.t_corrective_action_record || [];
  
  let fieldRows = fields.map(f => `
    <tr>
      <td><strong>${f.name}</strong></td>
      <td>${f.cropType || '未登録'}</td>
      <td>${f.area || '未登録'}</td>
      <td>${f.conversionDate || '未登録'}</td>
      <td>${f.isOrganic ? '🟢 JAS認定済' : '転換期間中'}</td>
    </tr>
  `).join('');
  
  let materialRows = materials.map(m => `
    <tr>
      <td>${m.name}</td>
      <td>${m.category || '未設定'}</td>
      <td>${m.expiry || '未設定'}</td>
      <td>${m.certUrl ? '🟢 JAS適合証明書 登録済' : '❌証明書未登録'}</td>
    </tr>
  `).join('');

  let workRows = workRecords.map(w => {
    const fieldName = fields.find(f => f.id === w.fieldId)?.name || '未設定';
    return `
      <tr>
        <td>${w.date}</td>
        <td>${fieldName}</td>
        <td>${w.content}</td>
        <td>${w.workerName}</td>
      </tr>
    `;
  }).join('');

  let sealRows = seals.map(s => `
    <tr>
      <td>${s.date}</td>
      <td><span style="padding:4px 8px; border-radius:4px; font-weight:800; font-size:11px; background:${s.type === 'purchase' ? '#dcfce7; color:#15803d;' : s.type === 'use' ? '#eff6ff; color:#1d4ed8;' : '#fee2e2; color:#b91c1c;'}">${s.type === 'purchase' ? '入庫' : s.type === 'use' ? '貼付' : '汚損'}</span></td>
      <td><strong>${s.qty}枚</strong></td>
      <td style="font-family:monospace; font-weight:bold;">${s.voucherNo || '-'}</td>
      <td>${s.remarks}</td>
    </tr>
  `).join('');

  let correctiveRows = correctives.map(c => `
    <tr>
      <td>${c.date}</td>
      <td style="color:#b91c1c; font-weight:bold;">${c.issue}</td>
      <td>${c.solution}</td>
      <td>${c.dateSolved}</td>
      <td><span style="color:#16a34a; font-weight:bold;">🟢 改善（証拠写真提出済）</span></td>
    </tr>
  `).join('');

  const htmlContent = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>有機JAS生産工程管理記録・統合監査証明台帳</title>
  <style>
    body { font-family: "BIZ UDPMincho", "Hiragino Mincho ProN", serif; padding: 40px; color: #1e293b; line-height: 1.6; background-color: #fcfcfc; }
    .header { text-align: center; border-bottom: 3px double #0f172a; padding-bottom: 15px; margin-bottom: 30px; }
    .header h1 { font-size: 24px; font-weight: 900; margin: 0; letter-spacing: 0.1em; }
    .header p { font-size: 13px; margin: 8px 0 0 0; color: #475569; }
    
    .farm-box { border: 1px solid #cbd5e1; padding: 20px; border-radius: 12px; margin-bottom: 30px; background: #f8fafc; box-shadow: inset 0 1px 3px rgba(0,0,0,0.02); }
    .farm-box h3 { margin-top: 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; font-size: 15px; color: #0f172a; font-weight: 800; }
    .farm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 14px; }
    
    h2 { font-size: 16px; border-left: 5px solid #16a34a; padding-left: 10px; margin-top: 40px; margin-bottom: 15px; color: #0f172a; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
    th, td { border: 1px solid #cbd5e1; padding: 12px 14px; text-align: left; }
    th { background: #f1f5f9; font-weight: 800; color: #0f172a; }
    tr:nth-child(even) { background-color: #f8fafc; }
    
    .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 60px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    @media print {
      body { padding: 0; background: none; }
      .farm-box { background: none; }
      th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</` + `head>
<body>
  <div class="header">
    <h1>有機JAS生産工程管理記録・統合監査証明台帳</h1>
    <p>発行シスト: JASAGRI (Orgaly) v3.1.2 | 有機JAS監査適合エビデンス原本書類</p>
  </div>
  
  <div class="farm-box">
    <h3>認証事業者本報</h3>
    <div class="farm-grid">
      <div><strong>農園名称・屋号:</strong> ${farm.name || '（農園名 未設定）'}</div>
      <div><strong>生産管理責任者</strong> ${farm.representative || '代表者未設定'}</div>
      <div><strong>事務所所在地:</strong> ${farm.address || '所在地 未設定'}</div>
      <div><strong>連絡先（電話）:</strong> ${farm.tel || '連絡先未設定'}</div>
    </div>
  </div>

  <h2>1. 圃場（栽培地・認定申請圃場・栽培作物）一覧マスタ</h2>
  <table>
    <thead>
      <tr>
        <th>圃場先名</th>
        <th>栽培作物・作付区分</th>
        <th>栽培面積</th>
        <th>有機認定または転換開始日</th>
        <th>有機JAS認定区分</th>
      </tr>
    </thead>
    <tbody>
      ${fieldRows || '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">圃場マスタデータが登録されていません</td></tr>'}
    </tbody>
  </table>

  <h2>2. 適合資材（肥料・土壌改良資材・農薬）使用適合確認状況</h2>
  <table>
    <thead>
      <tr>
        <th>仕入先名</th>
        <th>資材区分</th>
        <th>適合確認有効期限</th>
        <th>適合証明書・エビデンス原本有無</th>
      </tr>
    </thead>
    <tbody>
      ${materialRows || '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">資材適合データが登録されていません</td></tr>'}
    </tbody>
  </table>

  <h2>3. 生産工程・防除・作業実績記録（栽培管理）</h2>
  <table>
    <thead>
      <tr>
        <th>実施・記録年月日</th>
        <th>対象圃場</th>
        <th>作業内容・投入資材</th>
        <th>作業従事者・実施責任者</th>
      </tr>
    </thead>
    <tbody>
      ${workRows || '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">現場の栽培・防除・作業実績データが登録されていません</td></tr>'}
    </tbody>
  </table>

  <h2>4. JAS格付表示・格付マーク（シール）受払管理台帳</h2>
  <div style="display:flex; justify-content:space-between; margin-bottom:15px; font-size:12px; font-weight:bold;">
    <span>【理論在庫】購入総数: ${sealTotals.value.purchased}枚| 貼付総数: ${sealTotals.value.used}枚| 汚損廃棄: ${sealTotals.value.damaged}枚| 現在庫数: ${sealTotals.value.stock}枚</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>区分',</th>
        <th>管理由分</th>
        <th>数量</th>
        <th>紐付け伝票番号（納品書等）</th>
        <th>用途・対象出荷・廃棄理由</th>
      </tr>
    </thead>
    <tbody>
      ${sealRows || '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">JASマークの受払記録がありません</td></tr>'}
    </tbody>
  </table>

  <h2>5. 有機JAS不適合是正措置・改善是正報告ログ</h2>
  <table>
    <thead>
      <tr>
        <th>指摘年月日</th>
        <th>指摘内容・・不適合事項</th>
        <th>是正措置内容・改善実績</th>
        <th>是正完了日</th>
        <th>適合判定</th>
      </tr>
    </thead>
    <tbody>
      ${correctiveRows || '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">過去の是正指摘記録はありません</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    <p>有機JAS管理支援プラットフォーム「JASAGRI」による自動コンパイル証明書。本原本は有機JAS生産工程管理記録の基準に準拠してエクスポートされた証明書類です、</p>
    <p>&copy; 2026 Orgaly (オーガリー) | 有機JASのための畑のカルテ</p>
  </div>
</body>
</html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `有機JAS統合監査証明台帳_${new Date().getFullYear()}.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
</script>

<template>
  <div class="document-center animate-slide-up">

    <!-- ===== ページヘッダー ===== -->
    <div class="dc-page-header">
      <div class="dc-page-title">
        <h2>監査帳票ドキュメントセンター</h2>
        <p>帳票の生成・台帳の管理・申請書類の印刷を一画面で行えます。</p>
      </div>
    </div>

    <!-- ===== SECTION 1: 自動生成帳票 ===== -->
    <div class="dc-section">
      <div class="dc-section-label">
        <FileSpreadsheet size="14" />
        自動生成帳票
      </div>
      <div class="doc-grid">
        <div v-for="doc in documents" :key="doc.id" class="doc-grid-card glass">
          <div class="dgc-top">
            <div class="dgc-icon"><FileSpreadsheet size="18" /></div>
            <div class="dgc-name">{{ doc.name }}</div>
          </div>
          <div class="dgc-bottom">
            <span class="status ready"><CheckCircle2 size="11" /> 最新データ反映済</span>
            <div class="dgc-actions">
              <button @click="handleDownload(doc.name, 'PDF')" class="btn-icon-text"><FileDown size="13" /> PDF</button>
              <button @click="handleDownload(doc.name, 'Excel')" class="btn-icon-text"><FileSpreadsheet size="13" /> Excel</button>
              <button @click="handlePrint(doc.name)" class="btn-icon-text primary"><Printer size="13" /> 印刷</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== SECTION 2: 統合監査台帳エクスポート===== -->
    <div class="dc-section">
      <div class="dc-section-label">
        <FolderArchive size="14" />
        統合監査台帳エクスポート      </div>
      <div class="audit-package-card card glass">
        <div class="package-header">
          <div class="package-visual"><FolderArchive size="26" /></div>
          <div class="package-info">
            <h3>JAS監査提出用・統合監査証明台帳エクスポート</h3>
            <p>栽培履歴、資材適合確認、出荷ロット、JASマーク受払、是正完了ログ一式をJAS監査審査基準に適合する形式で1枚の統合台帳ファイルとしてコンパイルします。</p>
          </div>
          <button @click="startExport" class="btn-primary btn-premium-export" :disabled="isGenerating" :class="{ 'is-loading': isGenerating }">
            <span v-if="isGenerating" class="icon-spin-container"><Loader size="16" class="animate-spin" /></span>
            <DownloadCloud v-else size="16" />
            <span>{{ isGenerating ? 'データ編集...' : `${new Date().getFullYear()}年度分生成` }}</span>
          </button>
        </div>
        <Transition name="fade">
          <div v-if="isGenerating" class="compiler-progress-container">
            <div class="progress-meta">
              <span class="status-msg"><Loader size="12" class="animate-spin inline-loader" />{{ generationStatusText }}</span>
              <span class="percent-txt">{{ generationProgress }}%</span>
            </div>
            <div class="progress-track-bg"><div class="progress-track-fill" :style="{ width: generationProgress + '%' }"></div></div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- ===== SECTION 3: 台帳管理（データ入力）===== -->
    <div class="dc-section">
      <div class="dc-section-label">
        <ShieldCheck size="14" />
        台帳管理（データ入力）      </div>

      <!-- 格付受払台帳 アコートオン -->
      <div class="accordion-card card glass mb-2">
        <button class="accordion-header" @click="openSeal = !openSeal">
          <div class="acc-left">
            <ShieldCheck class="text-primary" size="20" />
            <div>
              <span class="acc-title">格付実績・JASマーク受払台帳</span>
              <span class="acc-meta">購入 {{ sealTotals.purchased }}枚　貼分{{ sealTotals.used }}枚　在庫 <strong>{{ sealTotals.stock }}枚</strong></span>
            </div>
          </div>
          <ChevronRight size="18" :class="['acc-chevron', { open: openSeal }]" />
        </button>

        <div v-show="openSeal" class="accordion-body">
          <!-- 在庫サマリ -->
          <div class="seal-totals-grid">
            <div class="total-pill">
              <span class="l">購入（入庫）累計</span>
              <span class="v text-primary">{{ sealTotals.purchased }} 枚</span>
            </div>
            <div class="total-pill">
              <span class="l">貼付（使用）累計</span>
              <span class="v text-success">{{ sealTotals.used }} 枚</span>
            </div>
            <div class="total-pill">
              <span class="l">汚損・廃棄累計</span>
              <span class="v text-danger">{{ sealTotals.damaged }} 枚</span>
            </div>
            <div class="total-pill active">
              <span class="l">現在シール有効在庫</span>
              <span class="v">{{ sealTotals.stock }} 枚</span>
            </div>
          </div>

          <!-- 登録ボタン -->
          <div class="acc-toolbar mt-15">
            <button @click="isAddingSealLog = !isAddingSealLog" class="btn-primary btn-sm">
              <Plus size="14" /> {{ isAddingSealLog ? '閉じる' : '受払履歴を登録' }}
            </button>
          </div>

          <!-- 入力フォーム -->
          <div v-if="isAddingSealLog" class="inline-form-box mt-10 glass">
            <h4>新規受払記録の登録</h4>
            <div class="form-row">
              <div class="field">
                <label>区分',</label>
                <input v-model="newSealLog.date" type="date" class="glass" />
              </div>
              <div class="field">
                <label>管理由分</label>
                <select v-model="newSealLog.type" class="glass">
                  <option value="purchase">入庫（購入）</option>
                  <option value="use">貼付（使用）</option>
                  <option value="damage">汚損・廃棄</option>
                </select>
              </div>
              <div class="field">
                <label>数量（枚数）</label>
                <input v-model.number="newSealLog.qty" type="number" class="glass" />
              </div>
            </div>
            <div class="form-row mt-10">
              <div class="field full">
                <label>紐付け伝票番号（納品書番号等※貼付（使用）時は必須）</label>
                <input v-model="newSealLog.voucherNo" type="text" placeholder="例：DN-1001" class="glass" />
              </div>
            </div>
            <div class="form-row mt-10">
              <div class="field full">
                <label>用途・備考（対象出荷・廃棄理由等）</label>
                <input v-model="newSealLog.remarks" type="text" placeholder="例：鹿児島有機農業コープ出荷分" class="glass" />
              </div>
            </div>
            <div class="form-actions mt-15">
              <button @click="saveSealLog" class="btn-primary btn-sm">台帳へ記録する</button>
            </div>
          </div>

          <!-- テーブル -->
          <div class="table-scroll-container mt-10">
            <table class="premium-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>管理区分</th>
                  <th>数量</th>
                  <th>紐付け伝票番号</th>
                  <th>用途・対象出荷・廃棄理由</th>
                  <th style="width:50px;text-align:center;">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in sortedSealLogs" :key="log.id">
                  <td>{{ log.date }}</td>
                  <td><span class="badge" :class="log.type">{{ log.type === 'purchase' ? '入庫' : log.type === 'use' ? '貼付' : '汚損' }}</span></td>
                  <td><strong>{{ log.qty }} 枚</strong></td>
                  <td class="serial-code">{{ log.voucherNo || '-' }}</td>
                  <td>{{ log.remarks ? log.remarks.replace('\t', '\t') : '-' }}</td>
                  <td style="text-align:center;"><button @click="deleteSealLog(log.id)" class="btn-delete-icon"><Trash2 size="14" /></button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 是正措置ログ アコートオン -->
      <div class="accordion-card card glass mb-2">
        <button class="accordion-header" @click="openCorrective = !openCorrective">
          <div class="acc-left">
            <AlertTriangle class="text-warning" size="20" />
            <div>
              <span class="acc-title">前年不適合指摘・改善是正措置ログ</span>
              <span class="acc-meta">{{ (state.records.t_corrective_action_record || []).length }} 件登録済み</span>
            </div>
          </div>
          <ChevronRight size="18" :class="['acc-chevron', { open: openCorrective }]" />
        </button>

        <div v-show="openCorrective" class="accordion-body">
          <div class="acc-toolbar">
            <button @click="isAddingCorrective = !isAddingCorrective" class="btn-primary btn-sm">
            <Plus size="14" /> {{ isAddingCorrective ? '閉じる' : '是正記録を追加' }}
          </button>
          </div>

          <div v-if="isAddingCorrective" class="inline-form-box mt-10 glass">
            <h4>新規改善是正レコードの追加</h4>
            <div class="form-row">
              <div class="field"><label>指摘日</label><input v-model="newCorrective.date" type="date" class="glass" /></div>
              <div class="field"><label>是正完了日</label><input v-model="newCorrective.dateSolved" type="date" class="glass" /></div>
            </div>
            <div class="form-row mt-10">
              <div class="field full"><label>指摘事実・不適合事項</label><textarea v-model="newCorrective.issue" placeholder="例：緩衝地帯との境界への表示看板の不足等" class="glass" rows="2"></textarea></div>
            </div>
            <div class="form-row mt-10">
              <div class="field full"><label>是正・改善措置の実施内容</label><textarea v-model="newCorrective.solution" placeholder="例：大型有機圃場標識を設置して写真をOCOに送信済" class="glass" rows="2"></textarea></div>
            </div>
            <div class="form-actions mt-15">
              <button @click="saveCorrective" class="btn-primary btn-sm btn-warn">是正措置ログを保存</button>
            </div>
          </div>

          <div class="corrective-list mt-10">
            <div v-if="!(state.records.t_corrective_action_record || []).length" class="empty-state-small">是正記録はありません</div>
            <div v-for="item in state.records.t_corrective_action_record" :key="item.id" class="corrective-item glass">
              <div class="item-header">
                <span class="warning-tag">指摘日: {{ item.date }}</span>
                <span class="success-tag">是正日: {{ item.dateSolved }}</span>
                <button @click="deleteCorrective(item.id)" class="btn-delete-icon"><Trash2 size="14" /></button>
              </div>
              <div class="item-body">
                <div class="col"><h5>不適合指摘内容</h5><p>{{ item.issue }}</p></div>
                <div class="col"><h5>改善・是正措置実施内容</h5><p>{{ item.solution }}</p></div>
                <div class="img-col" v-if="item.certUrl">
                  <span @click="activePreviewUrl = item.certUrl" class="btn-preview-badge"><ImageIcon size="12" /> 是正完了証拠</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== SECTION 4: 申請書類（印刷用）===== -->
    <div class="dc-section">
      <div class="dc-section-label">
        <Printer size="14" />
        申請書類（印刷用）      </div>

      <!-- 防虫・防鼠 と 運送契約を横並び -->
      <div class="print-doc-row mb-2">
        <!-- 防虫・防鼠 -->
        <div class="print-doc-card card glass">
          <div class="pdc-header">
            <div class="pdc-badge">様式（24-02）</div>
            <h4>防虫・防鼠駆除使用資材自己宣言</h4>
            <p>空欄で印刷します。日付は手書きで記入してください。</p>
          </div>
          <div class="pdc-footer">
            <button @click="printBounch" class="btn-primary btn-sm">
              <Printer size="14" /> 印刷する
            </button>
          </div>
        </div>

        <!-- 運送契約認書 -->
        <div class="print-doc-card card glass">
          <div class="pdc-header">
            <div class="pdc-badge">様式（25-02）</div>
            <h4>運送契約認書</h4>
            <p>空欄で印刷します。日付は手書きで記入してください。</p>
          </div>
          <div class="pdc-footer">
            <button @click="printUnsou" class="btn-primary btn-sm">
              <Printer size="14" /> 印刷する
            </button>
          </div>
        </div>
      </div>

      <!-- 遺伝子組換え証明書（自己宣言）-->
      <div class="print-doc-row mb-2">
        <div class="print-doc-card card glass">
          <div class="pdc-header">
            <div class="pdc-badge">様式（23-02）</div>
            <h4>遺伝子組換え証明書（自己宣言）</h4>
            <p>空欄印刷します。日付・住所・名称・代表者は手書きで記入してください。</p>
          </div>
          <div class="pdc-footer">
            <button @click="printHousouzai" class="btn-primary btn-sm">
              <Printer size="14" /> 印刷する
            </button>
          </div>
        </div>
      </div>

      <!-- 種苗証明書（履歴）-->
      <div class="card glass mb-2">
        <div class="pdc-full-header">
          <div class="pdc-full-title">
            <div class="pdc-badge">様式（08）</div>
            <h4>種苗証明書</h4>
            <p>農産物名・品種名・種苗の由来を登録してA4横で印刷できます。</p>
          </div>
          <button @click="addSeedCertRow" class="btn-primary btn-sm">
            <Plus size="14" /> 行を追加
          </button>
        </div>

        <!-- 種苗テーブル（直接編集）-->
        <div class="table-scroll-container mt-15">
          <table class="premium-table seed-cert-table">
            <thead>
              <tr>
                <th>農産物名</th><th>品種名</th><th>有機／非有機</th><th>由来番号</th><th>購入先・入手先名</th><th>非有機理由番号</th><th>理由</th>
                <th style="width:40px;text-align:center;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!(state.records.t_seed_cert_rows || []).length">
                <td colspan="8" style="text-align:center;color:#94a3b8;">「行を追加」ボタンで種苗を入力できます</td>
              </tr>
              <tr v-for="row in (state.records.t_seed_cert_rows || [])" :key="row.id">
                <td><input v-model="row.cropName" @change="actions.syncToCloud()" class="cell-input" placeholder="農産物名" /></td>
                <td><input v-model="row.variety" @change="actions.syncToCloud()" class="cell-input" placeholder="品種名" /></td>
                <td>
                  <select v-model="row.organic" @change="actions.syncToCloud()" class="cell-select">
                    <option value="有機">有機</option>
                    <option value="非有機">非有機</option>
                  </select>
                </td>
                <td>
                  <select v-model="row.originNo" @change="actions.syncToCloud()" class="cell-select cell-select-sm">
                    <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                  </select>
                </td>
                <td><input v-model="row.originSource" @change="actions.syncToCloud()" class="cell-input" placeholder="購入先・入手先名" /></td>
                <td>
                  <select v-model="row.reasonNo" @change="actions.syncToCloud()" class="cell-select cell-select-sm">
                    <option value="">-</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option>
                  </select>
                </td>
                <td><input v-model="row.reason" @change="actions.syncToCloud()" class="cell-input" placeholder="理由（任意）" /></td>
                <td style="text-align:center;"><button @click="deleteSeedCertRow(row.id)" class="btn-delete-icon"><Trash2 size="14" /></button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 日付 & 印刷 -->
        <div class="pdc-print-bar mt-15">
          <div class="field" style="max-width:220px;">
            <label>申請日付</label>
            <input v-model="seedCertDate" type="date" class="glass" />
          </div>
          <button @click="printSeedCert" class="btn-primary btn-sm">
            <Printer size="14" /> 種苗証明書を印刷
          </button>
        </div>
      </div>
    </div>

    <!-- Lightbox -->
    <Transition name="fade">
      <div v-if="activePreviewUrl" class="premium-lightbox" @click="activePreviewUrl = null">
        <button class="lightbox-close" @click="activePreviewUrl = null"><X size="24" /> 閉じる</button>
        <div class="lightbox-content-box" @click.stop>
          <h4>有機JAS認証・監査証跡エビデンス（検証済み）</h4>
          <div class="lightbox-image-wrapper"><img :src="activePreviewUrl" alt="JAS Audit Evidence" /></div>
          <button class="btn-primary" @click="activePreviewUrl = null" style="margin-top:15px;width:120px;">閉じる</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ===== PAGE LAYOUT ===== */
.dc-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
}
.dc-page-title h2 { font-size: 1.5rem; font-weight: 900; margin-bottom: 0.25rem; }
.dc-page-title p { color: var(--text-soft); font-size: 0.875rem; }

.dc-section {
  margin-bottom: 2rem;
}
.dc-section-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
  padding-left: 0.25rem;
}

/* ===== DOC GRID ===== */
.doc-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}
.doc-grid-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: var(--radius-lg);
}
.dgc-top {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.dgc-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: rgba(22,163,74,0.08);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.dgc-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.35;
}
.dgc-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.dgc-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

/* ===== ACCORDION ===== */
.accordion-card {
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.accordion-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
}
.accordion-header:hover { background: rgba(0,0,0,0.02); }
.acc-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.acc-title {
  display: block;
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-main);
}
.acc-meta {
  display: block;
  font-size: 0.78rem;
  color: var(--text-soft);
  margin-top: 2px;
}
.acc-chevron {
  color: var(--text-muted);
  transition: transform 0.25s ease;
  flex-shrink: 0;
}
.acc-chevron.open { transform: rotate(90deg); }
.accordion-body {
  padding: 0 1.5rem 1.5rem;
  border-top: 1px solid rgba(0,0,0,0.05);
  padding-top: 1.25rem;
}
.acc-toolbar {
  display: flex;
  justify-content: flex-end;
}

/* ===== PRINT DOC CARDS ===== */
.print-doc-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.print-doc-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  gap: 1rem;
}
.pdc-badge {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 900;
  color: var(--primary);
  background: rgba(22,163,74,0.1);
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}
.pdc-header h4 { font-size: 1rem; font-weight: 800; margin-bottom: 0.4rem; }
.pdc-header p { font-size: 0.8rem; color: var(--text-soft); line-height: 1.4; }
.pdc-footer {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.pdc-date { flex: 1; }

.pdc-full-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem 0;
}
.pdc-full-title h4 { font-size: 1rem; font-weight: 800; margin-bottom: 0.4rem; }
.pdc-full-title p { font-size: 0.8rem; color: var(--text-soft); }
.card.glass > .table-scroll-container,
.card.glass > .inline-form-box,
.card.glass > .pdc-print-bar {
  padding: 0 1.5rem;
}
.pdc-print-bar {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  padding-bottom: 1.5rem;
}

.empty-state-small {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 1.5rem 0;
}

/* ===== LEGACY (kept for existing components) ===== */
.header {
  margin-bottom: 2rem;
}
.header p {
  color: var(--text-soft);
}
.doc-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
}
.doc-card {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.25rem 2rem;
}
.doc-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
}
.doc-info { flex: 1; }
.doc-info h3 {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.status {
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.status.ready { color: var(--primary); }
.status.pending { color: var(--text-muted); }

.doc-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-icon-text {
  background: var(--bg-surface);
  color: var(--text-main);
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
}

.btn-icon-text.primary {
  background: var(--primary);
  color: white;
}

/* ==========================================
 * 1-Click JAS Audit Compiler Styles
 * ========================================== */
.audit-package-card {
  padding: 1.5rem !important;
  border-left: 4px solid var(--primary) !important;
  background: linear-gradient(135deg, rgba(22, 163, 74, 0.02) 0%, rgba(22, 163, 74, 0.05) 100%) !important;
}

.package-header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.package-visual {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: rgba(22, 163, 74, 0.1);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.package-info {
  flex: 1;
}

.package-info h3 {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--text-main);
  margin-bottom: 0.25rem;
}

.package-info p {
  font-size: 0.85rem;
  color: var(--text-soft);
  line-height: 1.4;
}

.btn-premium-export {
  padding: 0.75rem 1.5rem;
  font-weight: 800;
  font-size: 0.85rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.15);
  transition: all 0.25s ease;
}

.btn-premium-export:disabled {
  background: #cbd5e1;
  color: #94a3b8;
  cursor: not-allowed;
  box-shadow: none;
}

.icon-spin-container {
  display: flex;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Compiling Progress Tracks */
.compiler-progress-container {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px dashed rgba(22, 163, 74, 0.15);
  animation: slide-down-soft 0.3s ease-out;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.status-msg {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.inline-loader {
  display: inline-block;
}

.percent-txt {
  font-size: 0.85rem;
  font-weight: 900;
  color: var(--primary);
  font-family: monospace;
}

.progress-track-bg {
  height: 6px;
  background: #f1f5f9;
  border-radius: var(--radius-full);
  overflow: hidden;
  border: 1px solid rgba(0,0,0,0.01);
}

.progress-track-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary) 0%, #4ade80 100%);
  border-radius: var(--radius-full);
  transition: width 0.1s linear;
}

/* ==========================================
 * Evidence Vault Styles
 * ========================================== */
.section-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}

.section-header h3 {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--text-main);
}

.section-header p {
  font-size: 0.8rem;
  color: var(--text-soft);
}

.evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.evidence-card {
  border-radius: var(--radius-lg);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(22, 163, 74, 0.08);
}

.badge-tag {
  font-size: 0.7rem;
  font-weight: 900;
  background: var(--primary);
  color: white;
  padding: 4px 8px;
  border-radius: 6px;
  align-self: flex-start;
}

.evidence-img {
  width: 100%;
  height: 150px;
  object-fit: cover;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: transform 0.2s ease;
}

.evidence-img:hover {
  transform: scale(1.02);
}

.evidence-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 1rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-soft);
  background: repeating-linear-gradient(45deg, #f8fafc, #f8fafc 10px, #f1f5f9 10px, #f1f5f9 20px);
  border: 1.5px dashed #cbd5e1;
  cursor: default;
}

.evidence-empty:hover {
  transform: none;
}

.card-footer-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
}

.expiry-span {
  font-weight: 700;
  color: var(--text-soft);
}

.btn-upload {
  cursor: pointer;
  background: rgba(22, 163, 74, 0.1);
  color: var(--primary);
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ==========================================
 * Seal Ledger & Forms Styles
 * ========================================== */
.seal-totals-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.total-pill {
  background: var(--bg-surface);
  border: 1px solid rgba(0,0,0,0.05);
  border-radius: var(--radius-lg);
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.total-pill.active {
  background: linear-gradient(135deg, var(--primary) 0%, #15803d 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.2);
}

.total-pill .l {
  font-size: 0.7rem;
  font-weight: 700;
  opacity: 0.8;
}

.total-pill .v {
  font-size: 1.25rem;
  font-weight: 900;
}

.inline-form-box {
  background: var(--bg-surface);
  border: 1px solid rgba(22, 163, 74, 0.15);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  animation: slide-down-soft 0.3s ease-out;
}

.inline-form-box h4 {
  font-size: 0.95rem;
  font-weight: 800;
  margin-bottom: 1rem;
  border-left: 3px solid var(--primary);
  padding-left: 6px;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field.full {
  flex: none;
  width: 100%;
}

.field label {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-soft);
}

.field input, .field select, .field textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 8px;
  font-size: 0.85rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-warn {
  background: var(--warning) !important;
  color: var(--text-main) !important;
}

/* Premium Table inside Docs */
.table-scroll-container {
  overflow-x: auto;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(0,0,0,0.04);
}

.premium-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.premium-table th, .premium-table td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid rgba(0,0,0,0.04);
}

.seed-cert-table td { padding: 4px 6px; }

.cell-input {
  width: 100%;
  min-width: 80px;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  font-size: 0.83rem;
  color: var(--text-main);
  transition: border-color 0.15s, background 0.15s;
  box-sizing: border-box;
}
.cell-input:hover { border-color: rgba(22,163,74,0.25); background: rgba(22,163,74,0.04); }
.cell-input:focus { outline: none; border-color: rgba(22,163,74,0.55); background: rgba(22,163,74,0.06); }
.cell-input::placeholder { color: #b0bec5; }

.cell-select {
  padding: 5px 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  font-size: 0.83rem;
  color: var(--text-main);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.cell-select:hover { border-color: rgba(22,163,74,0.25); background: rgba(22,163,74,0.04); }
.cell-select:focus { outline: none; border-color: rgba(22,163,74,0.55); background: rgba(22,163,74,0.06); }
.cell-select-sm { width: 60px; }

.premium-table th {
  background: var(--bg-surface);
  font-weight: 800;
}

.badge {
  font-size: 0.7rem;
  font-weight: 900;
  padding: 3px 8px;
  border-radius: 6px;
}

.badge.purchase { background: #dcfce7; color: #15803d; }
.badge.use { background: #eff6ff; color: #1d4ed8; }
.badge.damage { background: #fee2e2; color: #b91c1c; }

.serial-code {
  font-family: monospace;
  font-weight: 700;
}

.btn-delete-icon {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  transition: color 0.2s ease;
}

.btn-delete-icon:hover {
  color: #ef4444;
}

/* ==========================================
 * Corrective Actions Log
 * ========================================== */
.corrective-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.corrective-item {
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  border-left: 4px solid var(--warning);
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.warning-tag {
  font-size: 0.75rem;
  font-weight: 800;
  background: #fef3c7;
  color: #b45309;
  padding: 4px 8px;
  border-radius: 6px;
}

.success-tag {
  font-size: 0.75rem;
  font-weight: 800;
  background: #dcfce7;
  color: #15803d;
  padding: 4px 8px;
  border-radius: 6px;
  margin-left: 8px;
}

.item-body {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 1.5rem;
  align-items: center;
}

.item-body h5 {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-soft);
  margin-bottom: 4px;
}

.item-body p {
  font-size: 0.85rem;
  line-height: 1.4;
}

.btn-preview-badge {
  font-size: 0.75rem;
  font-weight: 800;
  background: var(--primary);
  color: white;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ==========================================
 * Global Premium Lightbox (DRY Component)
 * ========================================== */
.premium-lightbox {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(10px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.lightbox-close {
  position: absolute;
  top: 2rem;
  right: 2rem;
  background: white;
  color: #0f172a;
  border: none;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  font-weight: 800;
  border-radius: var(--radius-md);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.lightbox-content-box {
  background: #1e293b;
  border: 1px solid rgba(22, 163, 74, 0.25);
  border-radius: var(--radius-xl);
  padding: 2rem;
  max-width: 800px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: white;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
}

.lightbox-content-box h4 {
  font-size: 1.1rem;
  font-weight: 800;
  margin-bottom: 1.5rem;
  color: var(--primary);
}

.lightbox-image-wrapper {
  width: 100%;
  height: 400px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.05);
}

.lightbox-image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@keyframes slide-down-soft {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
