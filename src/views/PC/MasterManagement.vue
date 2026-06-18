<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { Plus, Trash2, Edit3, Image as ImageIcon, Save, X, ExternalLink, MapPin, Phone, Truck, Settings, Sprout, ShieldCheck, Package, Leaf, Home, Building2, Printer } from 'lucide-vue-next';
import { state, actions } from '../../store';

const activeTab = ref('m_material'); // 'm_material', 'm_equipment', 'm_partner', 'm_field'
const isAdding = ref(false);
const activePreviewUrl = ref(null);

const isPdfUrl = (url) => {
  if (!url) return false;
  if (url.startsWith('data:application/pdf')) return true;
  if (url.includes('.pdf')) return true;
  return false;
};

const getExpiryStatus = (expiryDate) => {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const exp = new Date(expiryDate);
  exp.setHours(0,0,0,0);
  
  const diffTime = exp - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { class: 'expired', label: '期限切れ' };
  } else if (diffDays <= 30) {
    return { class: 'warning', label: `残り${diffDays}日` };
  } else {
    return { class: 'valid', label: '証明書 閲覧' };
  }
};

const printMaster = (item) => {
  const printWindow = window.open('', '_blank');
  
  const labels = {
    crop: '作物',
    variety: '品種',
    category: '区分',
    expiry: '有効期限',
    expiryDate: '有効期限',
    washRequired: '洗浄必須',
    installDate: '導入・購入日',
    remarks: '備考',
    partnerType: '取引先区分',
    address: '住所',
    contact: '連絡先',
    cropType: '栽培作物・作付区分',
    area: '面積',
    conversionDate: '有機認定/転換開始日',
    isOrganic: '有機JAS認定済み'
  };

  let html = `
    <html>
      <head>
        <title>${item.name || 'マスタ情報'}</title>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
          .header { text-align: center; margin-bottom: 30px; }
          h1 { border-bottom: 3px solid #10b981; padding-bottom: 10px; color: #064e3b; margin-bottom: 5px; }
          .subtitle { color: #64748b; font-size: 1.1em; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          th, td { border: 1px solid #e2e8f0; padding: 12px 15px; text-align: left; }
          th { background: #f8fafc; width: 35%; color: #475569; font-weight: bold; }
          td { background: #fff; }
          .img-container { margin-top: 30px; text-align: center; }
          .img-container h3 { color: #475569; margin-bottom: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; text-align: left;}
          .img-container img { max-width: 100%; max-height: 500px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px; background: #fff; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${item.name || 'マスタ情報'}</h1>
          <div class="subtitle">マスタデータ詳細情報</div>
        </div>
        <table>
  `;
  
  const skipKeys = ['id', 'name', 'certUrl', 'jasCertUrl', 'photoUrl'];
  
  for (const [key, val] of Object.entries(item)) {
    if (skipKeys.includes(key)) continue;
    if (val === undefined || val === null || val === '') continue;
    
    let displayVal = val;
    if (typeof val === 'boolean') {
      displayVal = val ? 'はい' : 'いいえ';
    }
    
    const label = labels[key] || key;
    html += '<tr><th>' + label + '</th><td>' + displayVal + '</td></tr>';
  }

  html += `
        </table>
  `;

  const cert = item.certUrl || item.jasCertUrl;
  if (cert) {
    if (cert.startsWith('data:application/pdf') || cert.includes('.pdf')) {
      html += '<div class="img-container"><h3>証明書 / 図面 (PDF)</h3><p>PDFファイルが添付されています。印刷プレビューには表示されません。</p></div>';
    } else {
      html += '<div class="img-container"><h3>証明書 / 図面</h3><img src="' + cert + '" /></div>';
    }
  }
  
  html += '<script>\n' +
          '  window.onload = () => { setTimeout(() => { window.print(); }, 500); };\n' +
          '</' + 'script>\n' +
          '</body></html>';
  printWindow.document.write(html);
  printWindow.document.close();
};

const isEditing = ref(false);
const editingId = ref(null);

const tabs = [
  { id: 'm_material', label: '資材', icon: Package },
  { id: 'm_seed', label: '種子・苗', icon: Leaf },
  { id: 'm_equipment', label: '機材', icon: Settings },
  { id: 'm_partner', label: '取引先', icon: Truck },
  { id: 'm_field', label: '圃場', icon: Sprout },
  { id: 'farm_info', label: '農園情報', icon: Home }
];

const farmEdit = ref({ ...state.farmInfo });

// タブ切替時に最新の農園情報をフォームにコピー
watch(activeTab, (newTab) => {
  if (newTab === 'farm_info') {
    farmEdit.value = { ...state.farmInfo };
  }
});


const saveFarmInfo = () => {
  actions.updateFarmInfo(farmEdit.value);
  actions.showToast('農園情報を保存しました', 'success');
};

const newItem = ref({
  // Common
  name: '',
  // m_material & m_seed
  crop: '',
  variety: '',
  category: '資材',
  certUrl: null,
  expiry: '',
  // m_equipment
  washRequired: false,
  installDate: '',
  remarks: '',
  // m_partner
  partnerType: '仕入先',
  address: '',
  contact: '',
  // m_field
  area: '',
  conversionDate: '',
  isOrganic: true
});


// 🗺️ Google Maps API 連携用のリアクティブステート & マップ生成エンジン (v3.2.0 お絵かき設計対応)
const googleMapAddress = ref('');
const googleMapZoom = ref(17);
const googleMapType = ref('roadmap'); // デフォルトは「普通の地図 (roadmap)」
const isGeneratingMap = ref(false);
const currentCenter = ref({ lat: 31.6424, lng: 130.7813 }); // 鹿児島デフォルト

let mapInstance = null;
let drawingManagerInstance = null;
let activePolygons = [];
let activeMarkers = [];
let gmapsScriptLoaded = false;

const hasApiKey = computed(() => !!(import.meta.env.VITE_GOOGLE_MAPS_API_KEY));

// 描画オブジェクトのクリア
const clearDrawnObjects = () => {
  activePolygons.forEach(p => p.setMap(null));
  activePolygons = [];
  activeMarkers.forEach(m => m.setMap(null));
  activeMarkers = [];
  
  // マップ上の描画をクリアした際、プレビューURLも一旦戻す
  if (window.google && window.google.maps) {
    updateStaticMapFromDrawing();
  }
};

// 描画された境界線やマーカーから Google Static Maps URL（JAS適合の赤枠付き）を全自動でコンパイル
const updateStaticMapFromDrawing = () => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  if (!apiKey) return;

  const centerStr = `${currentCenter.value.lat},${currentCenter.value.lng}`;
  let staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${centerStr}&zoom=${googleMapZoom.value}&size=800x500&maptype=${googleMapType.value}&key=${apiKey}`;

  // 1. マーカー（ピン）が置かれている場合
  if (activeMarkers.length > 0) {
    const m = activeMarkers[0];
    const pos = m.getPosition();
    staticMapUrl += `&markers=color:red%7Csize:mid%7C${pos.lat()},${pos.lng()}`;
  }

  // 2. ポリゴン（赤色の境界線）が描かれている場合、静的マップへ太い赤線＆塗り潰しを合流！
  if (activePolygons.length > 0) {
    const p = activePolygons[0];
    const pathCoords = [];
    const path = p.getPath();
    for (let i = 0; i < path.getLength(); i++) {
      const coord = path.getAt(i);
      pathCoords.push(`${coord.lat()},${coord.lng()}`);
    }
    // 多角形を閉じるため最初の座標を末尾に追加
    if (pathCoords.length > 0) {
      pathCoords.push(pathCoords[0]);
    }
    
    // 境界線太さ:3, 赤色(0xff0000), 塗りつぶし透過赤(0xff000033)
    const pathStr = `color:0xff0000ff|weight:3|fillcolor:0xff000033|${pathCoords.join('|')}`;
    staticMapUrl += `&path=${encodeURIComponent(pathStr)}`;
  } else {
    // 描画がない場合は、単純に中心位置へピン留め
    staticMapUrl += `&markers=color:red%7Csize:mid%7C${centerStr}`;
  }

  newItem.value.certUrl = staticMapUrl;
};

const setupMapInstance = () => {
  nextTick(() => {
    const el = document.getElementById('jas-interactive-map');
    if (!el) return;

    if (!window.google?.maps?.drawing?.DrawingManager) {
      console.error('[JASAGRI] Drawing library not ready');
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    const searchAddress = googleMapAddress.value || newItem.value.cropType || state.farmInfo.address || '鹿児島県霧島市福山町';

    geocoder.geocode({ address: searchAddress }, (results, status) => {
      let centerCoords = { lat: 31.6424, lng: 130.7813 };
      if (status === 'OK' && results[0]) {
        centerCoords = results[0].geometry.location;
      }

      mapInstance = new window.google.maps.Map(el, {
        center: centerCoords,
        zoom: googleMapZoom.value,
        mapTypeId: googleMapType.value,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: false,
      });

      // 描画コントロール（赤い境界線 / ピン留め用）
      drawingManagerInstance = new window.google.maps.drawing.DrawingManager({
        drawingMode: null,
        drawingControl: true,
        drawingControlOptions: {
          position: window.google.maps.ControlPosition.TOP_CENTER,
          drawingModes: [
            window.google.maps.drawing.OverlayType.POLYGON,
            window.google.maps.drawing.OverlayType.MARKER
          ],
        },
        polygonOptions: {
          fillColor: '#ef4444',
          fillOpacity: 0.25,
          strokeColor: '#ef4444',
          strokeWeight: 3,
          clickable: true,
          editable: true,
          zIndex: 1,
        },
        markerOptions: {
          draggable: true
        }
      });

      drawingManagerInstance.setMap(mapInstance);

      // 🌟 既存の Static Maps URL があればポリゴン/マーカーを復元する！
      if (isEditing.value && newItem.value.certUrl && newItem.value.certUrl.includes('maps.googleapis.com')) {
        const url = decodeURIComponent(newItem.value.certUrl);
        const zoomMatch = url.match(/zoom=(\d+)/);
        if (zoomMatch && zoomMatch[1]) {
          mapInstance.setZoom(Number(zoomMatch[1]));
        }
        
        const centerMatch = url.match(/center=([\d.-]+,[\d.-]+)/);
        const pathMatch = url.match(/path=color:[^|]+\|weight:\d+\|fillcolor:[^|]+\|(.+?)(&|$)/);
        
        if (pathMatch && pathMatch[1]) {
          const coords = pathMatch[1].split('|').map(c => {
            const [lat, lng] = c.split(',').map(Number);
            return { lat, lng };
          });
          if (coords.length > 0 && coords[0].lat === coords[coords.length - 1].lat && coords[0].lng === coords[coords.length - 1].lng) {
            coords.pop();
          }
          if (coords.length > 0) {
            const polygon = new window.google.maps.Polygon({
              paths: coords,
              fillColor: '#ef4444', fillOpacity: 0.25, strokeColor: '#ef4444', strokeWeight: 3,
              clickable: true, editable: true, zIndex: 1, map: mapInstance
            });
            activePolygons.push(polygon);
            window.google.maps.event.addListener(polygon.getPath(), 'set_at', updateStaticMapFromDrawing);
            window.google.maps.event.addListener(polygon.getPath(), 'insert_at', updateStaticMapFromDrawing);
            
            const bounds = new window.google.maps.LatLngBounds();
            coords.forEach(c => bounds.extend(c));
            mapInstance.fitBounds(bounds);
          }
        } else {
          const markerMatch = url.match(/markers=color:red\|size:mid\|([\d.-]+,[\d.-]+)/);
          if (markerMatch && markerMatch[1]) {
            const [lat, lng] = markerMatch[1].split(',').map(Number);
            const marker = new window.google.maps.Marker({
              position: { lat, lng }, draggable: true, map: mapInstance
            });
            activeMarkers.push(marker);
            window.google.maps.event.addListener(marker, 'dragend', updateStaticMapFromDrawing);
            mapInstance.setCenter({ lat, lng });
          } else if (centerMatch && centerMatch[1]) {
            const [lat, lng] = centerMatch[1].split(',').map(Number);
            mapInstance.setCenter({ lat, lng });
          }
        }
      }

      // お絵かき完了時のフック
      window.google.maps.event.addListener(drawingManagerInstance, 'polygoncomplete', (polygon) => {
        clearDrawnObjects();
        activePolygons.push(polygon);
        updateStaticMapFromDrawing();

        // 境界線が変更（頂点のドラッグ等）されたときも連動して再生成
        window.google.maps.event.addListener(polygon.getPath(), 'set_at', updateStaticMapFromDrawing);
        window.google.maps.event.addListener(polygon.getPath(), 'insert_at', updateStaticMapFromDrawing);
      });

      window.google.maps.event.addListener(drawingManagerInstance, 'markercomplete', (marker) => {
        clearDrawnObjects();
        activeMarkers.push(marker);
        updateStaticMapFromDrawing();

        window.google.maps.event.addListener(marker, 'dragend', updateStaticMapFromDrawing);
      });

      // マップが操作されたら、静的スナップショット位置を連動
      mapInstance.addListener('idle', () => {
        if (mapInstance) {
          googleMapZoom.value = mapInstance.getZoom();
          const latLng = mapInstance.getCenter();
          currentCenter.value = { lat: latLng.lat(), lng: latLng.lng() };
          // 意図しない上書きを防ぐため、ここでは updateStaticMapFromDrawing() を呼ばない
        }
      });
    });
  });
};

const initGoogleMap = async () => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  if (!apiKey) return;

  // Google Maps ブートストラップを1回だけロード
  if (!window.google?.maps) {
    if (gmapsScriptLoaded) return;
    gmapsScriptLoaded = true;

    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // libraries=drawing は v3.55+ で非推奨。importLibrary で別途ロードする
        // v=3.64 に固定: DrawingManager は v3.65 で削除されたため
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=3.64&libraries=drawing&callback=__initJASAGRIMap`;
        script.async = true;
        script.onerror = reject;
        window.__initJASAGRIMap = resolve;
        document.head.appendChild(script);
      });
    } catch (e) {
      console.error('[JASAGRI] Google Maps script load failed:', e);
      gmapsScriptLoaded = false;
      return;
    }
  }

  // Drawing ライブラリを importLibrary で確実にロード（v3.55+ 対応）
  // libraries=drawing をURL指定するだけでは読み込まれないバージョンがある
  if (!window.google?.maps?.drawing) {
    try {
      await window.google.maps.importLibrary('drawing');
    } catch (e) {
      console.error('[JASAGRI] Google Maps drawing library load failed:', e);
      return;
    }
  }

  setupMapInstance();
};

const searchMapLocation = () => {
  if (!window.google || !window.google.maps || !mapInstance) {
    // APIキーがないデモモード時はキーワードでモック画像を切り替えるだけ
    generateGoogleMapUrl();
    return;
  }

  const geocoder = new window.google.maps.Geocoder();
  geocoder.geocode({ address: googleMapAddress.value }, (results, status) => {
    if (status === 'OK' && results[0]) {
      const loc = results[0].geometry.location;
      mapInstance.setCenter(loc);
      mapInstance.setZoom(googleMapZoom.value);
      if (googleMapType.value !== mapInstance.getMapTypeId()) {
        mapInstance.setMapTypeId(googleMapType.value);
      }
    } else {
      actions.showToast('指定された住所が見つかりませんでした', 'warning');
    }
  });
};

const generateGoogleMapUrl = () => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const searchAddress = googleMapAddress.value || newItem.value.cropType || state.farmInfo.address || '鹿児島県霧島市福山町';
  
  isGeneratingMap.value = true;
  
  if (!apiKey) {
    // 【🔑 APIキー未設定時のフォールバック】
    // 実際に境界線を書き足したようなモック画像を返し、体験を豊かにします。
    setTimeout(() => {
      let seedImage = 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80';
      if (searchAddress.includes('ぶどう') || searchAddress.includes('葡萄')) {
        seedImage = 'https://images.unsplash.com/photo-1539589174242-90ece10d799a?auto=format&fit=crop&w=1200&q=80';
      } else if (searchAddress.includes('ハウス') || searchAddress.includes('育苗')) {
        seedImage = 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=1200&q=80';
      }
      newItem.value.certUrl = seedImage;
      isGeneratingMap.value = false;
      actions.showToast('【デモ】APIキー未設定のため航空写真を圃場図面として割り当てました', 'info');
    }, 600);
    return;
  }
  
  // インタラクティブマップ上の現在の描画状態から静的URLを即時コンパイルしてバインド
  updateStaticMapFromDrawing();
  isGeneratingMap.value = false;
  actions.showToast('圃場境界線を見取り図に保存しました', 'success');
};

// モーダルの開閉監視（圃場タブ＆モーダルONの時にマップを自動マウント）
watch([isAdding, activeTab], ([newVal, newTab]) => {
  if (newVal && newTab === 'm_field') {
    setTimeout(() => {
      initGoogleMap();
    }, 200);
  } else {
    activePolygons.forEach(p => { try { p.setMap(null); } catch (_) {} });
    activeMarkers.forEach(m => { try { m.setMap(null); } catch (_) {} });
    activePolygons = [];
    activeMarkers = [];
    if (drawingManagerInstance) {
      drawingManagerInstance.setMap(null);
      drawingManagerInstance = null;
    }
    mapInstance = null;
  }
});

// 「種苗」（旧）と「苗・種子」（新）の両方を種子・苗タブに表示
const SEED_CATEGORIES = ['種苗', '苗・種子'];

const filteredItems = computed(() => {
  if (activeTab.value === 'm_material') {
    return state.masters.m_material.filter(i => !SEED_CATEGORIES.includes(i.category));
  }
  if (activeTab.value === 'm_seed') {
    return state.masters.m_material.filter(i => SEED_CATEGORIES.includes(i.category));
  }
  return state.masters[activeTab.value] || [];
});

const handleSave = () => {
  let finalName = newItem.value.name;
  let finalCategory = newItem.value.category;

  if (activeTab.value === 'm_seed') {
    finalCategory = '苗・種子'; // 旧'種苗'から統一
    finalName = newItem.value.variety
      ? `${newItem.value.crop}（${newItem.value.variety}）`
      : newItem.value.crop;
  }

  const targetMaster = (activeTab.value === 'm_seed') ? 'm_material' : activeTab.value;
  
  // 【🧼 データクレンジング（v3.2.1）】
  // 保存するマスタの種類（activeTab）に応じてプロパティをクレンジングし、不要な情報のDB混入を防ぎます。
  let payload = { id: isEditing.value ? editingId.value : Date.now().toString() };

  if (activeTab.value === 'm_material' || activeTab.value === 'm_seed') {
    payload = {
      ...payload,
      name: finalName,
      category: finalCategory,
      crop: newItem.value.crop || '',
      variety: newItem.value.variety || '',
      certUrl: newItem.value.certUrl || null,
      jasCertUrl: newItem.value.certUrl || null,
      expiry: newItem.value.expiry || ''
    };
  } else if (activeTab.value === 'm_equipment') {
    payload = {
      ...payload,
      name: finalName,
      washRequired: newItem.value.washRequired,
      installDate: newItem.value.installDate,
      remarks: newItem.value.remarks
    };
  } else if (activeTab.value === 'm_partner') {
    payload = {
      ...payload,
      name: finalName,
      partnerType: newItem.value.partnerType,
      address: newItem.value.address,
      contact: newItem.value.contact
    };
  } else if (activeTab.value === 'm_field') {
    payload = {
      ...payload,
      name: finalName,
      cropType: newItem.value.cropType,
      area: newItem.value.area,
      conversionDate: newItem.value.conversionDate,
      isOrganic: newItem.value.isOrganic,
      address: newItem.value.address,
      certUrl: newItem.value.certUrl || null
    };
  }

  if (isEditing.value) {
    const index = state.masters[targetMaster].findIndex(i => i.id === editingId.value);
    if (index !== -1) {
      // 既存データの category 等の余分なゴミ情報も綺麗に上書き消滅させます
      state.masters[targetMaster][index] = payload;

      // 🌟 【台帳（証憑台帳）への自動同期・最新情報共有】
      if (targetMaster === 'm_material') {
        const receipts = state.records.t_material_receipt || [];
        receipts.forEach(r => {
          if (r.docType === '資材・適合証明書' && (r.materialId === payload.id || r.materialName === payload.name)) {
            r.expiryDate = payload.expiry || '';
            r.certUrl = payload.certUrl || null;
            r.photoUrl = payload.certUrl || null;
          }
        });
      }
      actions.syncToCloud(); // 全マスタタイプで即時クラウド保存
      actions.showToast('更新しました', 'success');
    }
  } else {
    actions.addMasterItem(targetMaster, payload);

    // 🌟 【新規追加された時も、もし対応する証明書が台帳にあれば自動同期】
    if (targetMaster === 'm_material') {
      const receipts = state.records.t_material_receipt || [];
      receipts.forEach(r => {
        if (r.docType === '資材・適合証明書' && r.materialName === payload.name) {
          r.materialId = payload.id;
          r.expiryDate = payload.expiry || '';
          r.certUrl = payload.certUrl || null;
          r.photoUrl = payload.certUrl || null;
        }
      });
      actions.syncToCloud(); // 👈 即時クラウド保存でおもてなし！
    }

    actions.showToast('登録しました', 'success');
  }
  
  isAdding.value = false;
  isEditing.value = false;
  editingId.value = null;
  resetForm();
};

const startEdit = (item) => {
  isEditing.value = true;
  editingId.value = item.id;
  // Fill form with item data
  Object.keys(newItem.value).forEach(key => {
    if (item[key] !== undefined) {
      newItem.value[key] = item[key];
    }
  });

  // 🌟 もし certUrl がなく jasCertUrl が存在する場合はフォールバック
  if (!newItem.value.certUrl && item.jasCertUrl) {
    newItem.value.certUrl = item.jasCertUrl;
  }

  // 🌟 有効期限のプロパティ表記揺れ（expiry / expiryDate）を完全に補正フォールバック！
  if (!newItem.value.expiry && item.expiryDate) {
    newItem.value.expiry = item.expiryDate;
  }

  // Special handling for Seeds parsing
  if (item.category === '種苗') {
    const match = item.name.match(/^(.+?)（(.+?)）$/);
    if (match) {
      newItem.value.crop = match[1];
      newItem.value.variety = match[2];
    } else {
      newItem.value.crop = item.name;
      newItem.value.variety = '';
    }
  }

  // 🗺️ 圃場編集時におもてなし住所プリセット (v3.1.5)
  if (activeTab.value === 'm_field') {
    googleMapAddress.value = item.address || item.name || state.farmInfo.address || '';
  }

  isAdding.value = true;
};

const handleDelete = (id) => {
  if (confirm('このデータを削除してもよろしいですか？')) {
    const targetMaster = (activeTab.value === 'm_seed') ? 'm_material' : activeTab.value;
    actions.deleteMasterItem(targetMaster, id);
  }
};

const removeCertificate = (item) => {
  if (confirm(`「${item.name}」の証明書（図面・写真）を破棄しますか？\n※データ自体は削除されません`)) {
    const targetMaster = (activeTab.value === 'm_seed') ? 'm_material' : activeTab.value;
    const index = state.masters[targetMaster].findIndex(i => i.id === item.id);
    if (index !== -1) {
      state.masters[targetMaster][index].certUrl = null;
      state.masters[targetMaster][index].jasCertUrl = null;
      actions.syncToCloud();
      actions.showToast('証明書を破棄しました', 'success');
    }
  }
};

const resetForm = () => {
  newItem.value = {
    name: '',
    crop: '',
    variety: '',
    category: '資材',
    certUrl: null,
    expiry: '',
    washRequired: false,
    installDate: '',
    remarks: '',
    partnerType: '仕入先',
    address: '',
    contact: '',
    area: '',
    conversionDate: '',
    isOrganic: true,
    cropType: '' // v3.1.1 栽培作物・区分
  };
  
  // 🗺️ 新規作成時におもてなし住所プリセット (v3.1.5)
  googleMapAddress.value = state.farmInfo.address || '';
};

const triggerFile = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,application/pdf';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { newItem.value.certUrl = ev.target.result; };
    reader.readAsDataURL(file);
  };
  input.click();
};
</script>

<template>
  <div class="master-management-pro animate-slide-up">
    <div class="header">
      <div class="title-group">
        <ShieldCheck size="28" class="text-primary" />
        <div>
          <h2>マスタデータ管理 <small>v.Pro</small></h2>
          <p>有機JAS監査要件に準拠した厳格なマストデータの管理</p>
        </div>
      </div>
      
      <div class="tabs glass">
        <button 
          v-for="t in tabs" :key="t.id"
          @click="activeTab = t.id" 
          :class="{ active: activeTab === t.id }"
        >
          {{ t.label }}
        </button>
      </div>
    </div>

    <!-- Add Form Overlay -->
    <div v-if="isAdding" class="overlay">
      <div class="modal premium-modal scale-up">
        <div class="modal-header">
          <h3>{{ tabs.find(t => t.id === activeTab).label }}の{{ isEditing ? '編集' : '新規登録' }}</h3>
          <button @click="isAdding = false; isEditing = false; editingId = null; resetForm();" class="btn-close"><X /></button>
        </div>
        
        <div class="form">
          <!-- Common Name Field (Hidden for seeds) -->
          <div class="form-group" v-if="activeTab !== 'm_seed'">
            <label>{{ activeTab === 'm_partner' ? '企業名・取引先名' : '名称' }}</label>
            <input v-model="newItem.name" type="text" :placeholder="activeTab === 'm_partner' ? '例：国立種苗' : '例：菜種油粕, 噴霧機A...'" class="glass" />
          </div>

          <!-- m_seed specific -->
          <template v-if="activeTab === 'm_seed'">
            <div class="form-group">
              <label>作物名</label>
              <input v-model="newItem.crop" type="text" placeholder="例：トマト, ぶどう..." class="glass" />
            </div>
            <div class="form-group">
              <label>品種</label>
              <input v-model="newItem.variety" type="text" placeholder="例：桃太郎, シャインマスカット..." class="glass" />
            </div>
          </template>

          <!-- m_material specific -->
          <template v-if="activeTab === 'm_material'">
            <div class="form-group">
              <label>資材区分</label>
              <select v-model="newItem.category" class="glass">
                <option value="肥料">肥料</option>
                <option value="農薬">農薬</option>
                <option value="苗・種子">苗・種子</option>
                <option value="飼料">飼料</option>
                <option value="機材">機材</option>
                <option value="資材">資材</option>
                <option value="その他">その他</option>
              </select>
            </div>
            <div class="form-group">
              <label>保管場所・住所</label>
              <div class="input-with-icon">
                <MapPin size="16" />
                <input v-model="newItem.address" type="text" placeholder="例：第一倉庫..." class="glass" />
              </div>
            </div>
            <div class="form-group">
              <label>有効期限（JAS適合証明書）</label>
              <input v-model="newItem.expiry" type="date" class="glass" />
            </div>
          </template>

          <!-- m_equipment specific -->
          <template v-if="activeTab === 'm_equipment'">
            <div class="form-group checkbox">
              <input v-model="newItem.washRequired" type="checkbox" id="wash" />
              <label for="wash">有機JAS洗浄・清掃必須機材</label>
            </div>
            <div class="form-group">
              <label>導入・購入日</label>
              <input v-model="newItem.installDate" type="date" class="glass" />
            </div>
            <div class="form-group">
              <label>保管場所・住所</label>
              <div class="input-with-icon">
                <MapPin size="16" />
                <input v-model="newItem.address" type="text" placeholder="例：農機具庫..." class="glass" />
              </div>
            </div>
            <div class="form-group">
              <label>備考</label>
              <textarea v-model="newItem.remarks" class="glass" placeholder="シリアル番号・用途など"></textarea>
            </div>
          </template>

          <!-- m_partner specific -->
          <template v-if="activeTab === 'm_partner'">
            <div class="form-group">
              <label>区分</label>
              <div class="radio-group">
                <label class="radio-item"><input type="radio" value="仕入先" v-model="newItem.partnerType" /> 仕入先</label>
                <label class="radio-item"><input type="radio" value="納品先" v-model="newItem.partnerType" /> 納品先</label>
              </div>
            </div>
            <div class="form-group">
              <label>住所</label>
              <div class="input-with-icon">
                <MapPin size="16" />
                <input v-model="newItem.address" type="text" class="glass" />
              </div>
            </div>
            <div class="form-group">
              <label>連絡先</label>
              <div class="input-with-icon">
                <Phone size="16" />
                <input v-model="newItem.contact" type="text" class="glass" />
              </div>
            </div>
          </template>

          <!-- m_field specific (v3.1.1 Crop/Category Field) -->
          <template v-if="activeTab === 'm_field'">
            <div class="form-group">
              <label>圃場住所・所在地</label>
              <div class="input-with-icon">
                <MapPin size="16" />
                <input v-model="newItem.address" type="text" placeholder="例：鹿児島県霧島市..." class="glass" />
              </div>
            </div>
            <div class="form-group">
              <label>栽培作物・作付区分（有機JAS生産工程管理）</label>
              <input v-model="newItem.cropType" type="text" placeholder="例：ブルーベリー, A畑ぶどう, 育苗ハウス..." class="glass" />
            </div>
            <div class="form-group">
              <label>面積</label>
              <input v-model="newItem.area" type="text" placeholder="例：10a, 1500m2" class="glass" />
            </div>
            <div class="form-group">
              <label>有機認定/転換開始日</label>
              <input v-model="newItem.conversionDate" type="date" class="glass" />
            </div>
            <div class="form-group checkbox">
              <input v-model="newItem.isOrganic" type="checkbox" id="organic" />
              <label for="organic">有機JAS認定済み（転換期間中も含む）</label>
            </div>

            <!-- 🗺️ Google Maps 見取り図自動生成サブフォーム (v3.2.0 お絵かき・境界線設計対応) -->
            <div class="google-map-generator glass-white mt-1">
              <div class="sub-header-map">
                <MapPin size="16" class="text-primary animate-pulse" />
                <h5>GIS 境界線設計お絵かきマップ</h5>
              </div>
              <p class="desc-text">
                住所で検索後、地図をドラッグや拡大（スクロールズーム）して微調整できます。<br>
                地図上部の多角形ボタンをクリックし、<strong>境界線をなぞるようにお絵かき</strong>すると、監査用の赤い太枠線付き見取り図が自動生成されます。
              </p>
              
              <div class="form-group">
                <label>検索位置・住所</label>
                <div class="search-row-map">
                  <input v-model="googleMapAddress" type="text" placeholder="例: 鹿児島県霧島市福山町佳例川" class="glass search-input" @keyup.enter="searchMapLocation" />
                  <button @click="searchMapLocation" class="btn-search-map-action">検索して移動</button>
                </div>
              </div>

              <!-- インタラクティブな Google Maps コンテナ -->
              <div class="interactive-map-wrapper mt-1">
                <div id="jas-interactive-map" class="interactive-map">
                  <!-- APIキー未設定時の美しいフォールバック -->
                  <div v-if="!hasApiKey" class="map-fallback">
                    <span class="fallback-icon">🗺️</span>
                    <p class="fallback-title">【デモモード】境界線お絵かきマップ</p>
                    <p class="fallback-desc">APIキー未設定のため、下の「お絵かき境界線を保存」を押すと、お茶やぶどうの境界マーク付き航空写真がシミュレートバインドされます！</p>
                  </div>
                </div>
              </div>

              <div class="settings-row-map mt-1">
                <div class="setting-item-map">
                  <label>地図タイプ</label>
                  <select v-model="googleMapType" @change="searchMapLocation" class="glass select-input">
                    <option value="roadmap">普通の地図 (ROADMAP)</option>
                    <option value="hybrid">航空写真ハイブリッド</option>
                  </select>
                </div>
                <div class="setting-item-map flex-end-map">
                  <button @click="clearDrawnObjects" class="btn-clear-draw">お絵かきを消去</button>
                </div>
              </div>

              <button @click="generateGoogleMapUrl" :disabled="isGeneratingMap" class="btn-generate-map mt-1 w-full">
                <Settings size="14" :class="{ 'animate-spin': isGeneratingMap }" />
                <span>{{ isGeneratingMap ? '図面をコンパイル中...' : '📐 このお絵かき境界線を見取り図に保存' }}</span>
              </button>
            </div>
          </template>

          <!-- Evidence for all (v3.1.0 Dynamic Labels) -->
          <div class="form-group">
            <label>{{ activeTab === 'm_field' ? '圃場見取り図・周辺状況マップ (JPEG/PNG)' : '証明書類・エビデンス (JPEG/PNG)' }}</label>
            <div class="upload-box glass" @click="triggerFile" style="height: auto; min-height: 120px; padding: 1rem;">
              <div v-if="newItem.certUrl" class="preview-thumbnail-wrap" style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; width: 100%;">
                <template v-if="isPdfUrl(newItem.certUrl)">
                  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem; height: 80px; color: #059669; font-size: 0.8rem; font-weight: 800;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    <span>PDF書類</span>
                  </div>
                </template>
                <img v-else :src="newItem.certUrl" style="max-height: 100px; max-width: 100%; border-radius: 8px; object-fit: contain; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
                <span style="font-size: 0.75rem; font-weight: 800; color: #10b981;">{{ isPdfUrl(newItem.certUrl) ? 'PDF選択済み（クリックして変更）' : '画像選択済み（クリックして変更）' }}</span>
                <button @click.stop="newItem.certUrl = null; newItem.jasCertUrl = null;" class="btn-primary" style="background: #ef4444; padding: 0.3rem 0.6rem; font-size: 0.7rem; margin-top: 0.5rem;">
                  <Trash2 size="12" /> 証明書を破棄
                </button>
              </div>
              <div v-else class="prompt">
                <Plus size="20" />
                <span>{{ activeTab === 'm_field' ? '図面をアップロード' : 'ファイルをアップロード' }}</span>
              </div>
            </div>
          </div>

          <button @click="handleSave" class="btn-primary mt-2 w-full">
            <Save size="18" />
            マスタデータを{{ isEditing ? '更新' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Farm Info Settings (Dedicated Section) -->
    <div v-if="activeTab === 'farm_info'" class="farm-settings-section animate-slide-up">
      <div class="farm-card glass card">
        <div class="farm-header">
          <Building2 size="32" class="text-primary" />
          <div>
            <h3>農園・ユーザー情報の設定</h3>
            <p>書類の発行元や、アプリ内での表示に使用される基本情報です。</p>
          </div>
        </div>

        <div class="settings-grid">
          <div class="form-group full">
            <label>ユーザー表示名（ホーム画面の挨拶などに使用）</label>
            <input 
              :value="state.user.name" 
              @input="e => actions.updateUser({ name: e.target.value })"
              type="text" 
              class="glass" 
              placeholder="例: 田中 大輔" 
            />
          </div>
          
          <div class="divider full" style="height: 1px; background: var(--glass-border); margin: 1rem 0;"></div>

          <div class="form-group full">
            <label>農園名称・屋号</label>
            <input v-model="farmEdit.name" type="text" class="glass" placeholder="例: Orgaly農園" />
          </div>
          <div class="form-group">
            <label>郵便番号</label>
            <input v-model="farmEdit.postalCode" type="text" class="glass" placeholder="例: 899-4301" />
          </div>
          <div class="form-group">
            <label>代表者名</label>
            <input v-model="farmEdit.representative" type="text" class="glass" placeholder="例: 田中 大輔" />
          </div>
          <div class="form-group full">
            <label>所在地・住所</label>
            <input v-model="farmEdit.address" type="text" class="glass" placeholder="例: 鹿児島県霧島市..." />
          </div>
          <div class="form-group">
            <label>電話番号</label>
            <input v-model="farmEdit.tel" type="text" class="glass" placeholder="例: 0995-xx-xxxx" />
          </div>
          <div class="form-group">
            <label>インボイス登録番号（適格請求書）</label>
            <input v-model="farmEdit.invoiceNo" type="text" class="glass" placeholder="例: T1234567890123" />
          </div>
          <div class="form-group">
            <label>消費税率 (%)</label>
            <input v-model.number="farmEdit.taxRate" type="number" min="0" max="100" class="glass" placeholder="例: 8" />
          </div>
          <div class="form-group">
            <label>納品書の金額端数処理</label>
            <div class="rounding-toggle">
              <button
                :class="['rounding-btn', { active: (farmEdit.roundingMode || 'round') === 'round' }]"
                @click="farmEdit.roundingMode = 'round'"
                type="button"
              >四捨五入</button>
              <button
                :class="['rounding-btn', { active: farmEdit.roundingMode === 'floor' }]"
                @click="farmEdit.roundingMode = 'floor'"
                type="button"
              >切り捨て</button>
            </div>
          </div>
          
          <div class="actions">
            <button @click="saveFarmInfo" class="btn-primary">
              <Save size="20" /> 全ての情報を保存する
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- List View -->
    <div v-else class="list-section">
      <div class="action-bar mb-1">
        <span class="count">{{ filteredItems.length }} 件のデータ</span>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <button
            v-if="activeTab === 'm_material' || activeTab === 'm_seed'"
            @click="actions.bulkFixMaterialCategories()"
            class="btn-fix-category"
            title="「資材」「その他」のカテゴリをキーワードで自動補正します"
          >
            ✦ カテゴリ自動補正
          </button>
          <button @click="isAdding = true" class="btn-primary">
            <Plus size="18" /> 新規登録
          </button>
        </div>
      </div>

      <div class="grid">
        <div v-for="item in filteredItems" :key="item.id" class="item-card glass card">
          <div class="card-visual">
            <Package v-if="activeTab === 'm_material'" />
            <Leaf v-if="activeTab === 'm_seed'" />
            <Settings v-if="activeTab === 'm_equipment'" />
            <Truck v-if="activeTab === 'm_partner'" />
            <Sprout v-if="activeTab === 'm_field'" />
          </div>
          
            <div class="card-content">
              <div class="top">
                <span class="badge" v-if="(activeTab === 'm_material' || activeTab === 'm_seed') && item.category">{{ item.category }}</span>
                <span class="badge" v-if="activeTab === 'm_partner' && item.partnerType">{{ item.partnerType }}</span>
                <h4>{{ item.name }}</h4>
              </div>
            
            <div class="meta-grid">
              <!-- Field Specific Meta (v3.1.1 Crop/Category Alignment) -->
              <template v-if="activeTab === 'm_field'">
                <div class="meta-item" v-if="item.address"><MapPin size="12" /> <span>{{ item.address }}</span></div>
                <div class="meta-item"><span>栽培作物・区分</span> <strong class="text-primary">{{ item.cropType || '未設定' }}</strong></div>
                <div class="meta-item"><span>面積</span> <strong>{{ item.area }}</strong></div>
                <div class="meta-item"><span>転換開始</span> <strong>{{ item.conversionDate }}</strong></div>
                <div class="cert-status-badge-container mt-1" style="display: flex; gap: 0.5rem; align-items: center;">
                  <span 
                    v-if="item.certUrl" 
                    @click="activePreviewUrl = item.certUrl"
                    class="cert-badge valid"
                  >
                    <ImageIcon size="12" />
                    圃場図面 プレビュー
                  </span>
                  <button 
                    v-if="item.certUrl"
                    @click="removeCertificate(item)"
                    class="btn-icon text-danger"
                    title="図面を破棄"
                    style="padding: 0.2rem; background: transparent; opacity: 0.7;"
                  >
                    <Trash2 size="14" />
                  </button>
                  <span v-if="!item.certUrl" class="cert-badge none">
                    図面未登録
                  </span>
                </div>
              </template>
              
              <!-- Material & Seed Specific Meta (v2.3.0 Expiry & Proof Badge) -->
              <template v-if="activeTab === 'm_material' || activeTab === 'm_seed'">
                <div class="meta-item" v-if="item.address"><MapPin size="12" /> <span>{{ item.address }}</span></div>
                <div class="meta-item"><span>有効期限</span> <strong>{{ item.expiry || item.expiryDate || '未設定' }}</strong></div>
                <div class="cert-status-badge-container mt-1" style="display: flex; gap: 0.5rem; align-items: center;">
                  <span 
                    v-if="item.certUrl || item.jasCertUrl" 
                    @click="activePreviewUrl = item.certUrl || item.jasCertUrl"
                    class="cert-badge"
                    :class="getExpiryStatus(item.expiry || item.expiryDate)?.class || 'valid'"
                  >
                    <ImageIcon size="12" />
                    {{ getExpiryStatus(item.expiry || item.expiryDate)?.label || '証明書表示' }}
                  </span>
                  <button 
                    v-if="item.certUrl || item.jasCertUrl"
                    @click="removeCertificate(item)"
                    class="btn-icon text-danger"
                    title="証明書を破棄"
                    style="padding: 0.2rem; background: transparent; opacity: 0.7;"
                  >
                    <Trash2 size="14" />
                  </button>
                  <span v-if="!(item.certUrl || item.jasCertUrl)" class="cert-badge none">
                    証明書未登録
                  </span>
                </div>
              </template>

              <!-- Equipment Specific Meta (v3.1.0 Certificate View) -->
              <template v-if="activeTab === 'm_equipment'">
                <div class="meta-item" v-if="item.address"><MapPin size="12" /> <span>{{ item.address }}</span></div>
                <div class="meta-item"><span>導入日</span> <strong>{{ item.installDate }}</strong></div>
                <div v-if="item.washRequired" class="meta-item warning"><span>洗浄必須</span></div>
                <div class="cert-status-badge-container mt-1" style="display: flex; gap: 0.5rem; align-items: center;">
                  <span 
                    v-if="item.certUrl" 
                    @click="activePreviewUrl = item.certUrl"
                    class="cert-badge valid"
                  >
                    <ImageIcon size="12" />
                    機材証明・写真表示
                  </span>
                  <button 
                    v-if="item.certUrl"
                    @click="removeCertificate(item)"
                    class="btn-icon text-danger"
                    title="証明・写真を破棄"
                    style="padding: 0.2rem; background: transparent; opacity: 0.7;"
                  >
                    <Trash2 size="14" />
                  </button>
                  <span v-if="!item.certUrl" class="cert-badge none">
                    証明・写真未登録
                  </span>
                </div>
              </template>

              <!-- Partner Specific Meta -->
              <template v-if="activeTab === 'm_partner'">
                <div class="meta-item"><MapPin size="12" /> <span>{{ item.address }}</span></div>
              </template>
            </div>
          </div>

          <div class="card-actions">
            <button @click="printMaster(item)" class="btn-icon" title="印刷"><Printer size="16" /></button>
            <button @click="startEdit(item)" class="btn-icon"><Edit3 size="16" /></button>
            <button @click="handleDelete(item.id)" class="btn-icon text-danger"><Trash2 size="16" /></button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <!-- Lightbox Preview Modal (v2.3.0) -->
    <Transition name="fade">
      <div v-if="activePreviewUrl" class="lightbox-overlay" @click="activePreviewUrl = null">
        <div class="lightbox-content scale-up" @click.stopPropagation>
          <button class="lightbox-close" @click="activePreviewUrl = null"><X size="24" /></button>
          <iframe v-if="isPdfUrl(activePreviewUrl)" :src="activePreviewUrl + '#toolbar=0'" class="lightbox-pdf" frameborder="0"></iframe>
          <img v-else :src="activePreviewUrl" alt="JAS適合証明書エビデンス" />
          <div class="lightbox-caption">有機JAS適合証明書・エビデンス</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.master-management-pro { padding-bottom: 50px; }

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.title-group { display: flex; gap: 1rem; align-items: center; }
.title-group h2 { font-size: 1.75rem; font-weight: 900; }
.title-group small { font-size: 0.8rem; color: var(--primary); font-family: monospace; }
.title-group p { color: var(--text-soft); font-size: 0.9rem; }

.tabs { display: flex; padding: 0.25rem; border-radius: var(--radius-full); }
.tabs button {
  padding: 0.6rem 1.5rem;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-soft);
  font-weight: 700;
  font-size: 0.9rem;
}
.tabs button.active { background: var(--primary); color: white; }

.action-bar { display: flex; justify-content: space-between; align-items: center; }
.count { font-size: 0.85rem; color: var(--text-soft); font-weight: 700; }

.btn-fix-category {
  padding: 0.45rem 0.9rem;
  background: var(--emerald-tint);
  border: 1.5px solid var(--emerald-border);
  color: var(--emerald-dark);
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-fix-category:hover {
  background: var(--emerald-light);
  border-color: var(--emerald);
  color: var(--emerald-deep);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;
}

.item-card {
  display: flex;
  align-items: center;
  padding: 1.25rem;
  gap: 1.25rem;
}

.card-visual {
  width: 56px;
  height: 56px;
  background: var(--bg-surface);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.card-content { flex: 1; min-width: 0; }
.card-content .top { display: flex; flex-direction: column; margin-bottom: 0.75rem; }
.card-content .badge { 
  display: inline-block; 
  font-size: 0.65rem; 
  font-weight: 900; 
  color: var(--primary); 
  background: var(--primary-glow); 
  padding: 0.1rem 0.6rem; 
  border-radius: 4px;
  width: fit-content;
  margin-bottom: 0.25rem;
}
.card-content h4 { font-size: 1.15rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.meta-grid { display: grid; gap: 0.4rem; }
.meta-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text-soft); }
.meta-item strong { color: var(--text-main); font-weight: 700; }
.meta-item.warning { color: var(--accent); font-weight: 900; }

.card-actions { display: flex; flex-direction: column; gap: 0.5rem; }
.btn-icon { padding: 0.5rem; background: var(--bg-surface); border-radius: var(--radius-sm); }
.text-danger { color: #ef4444; }

/* Modal & Form */
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.6); /* Darkened for contrast */
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(12px); /* Stronger blur */
}

.premium-modal {
  width: 100%;
  max-width: 550px;
  padding: 2.5rem;
  max-height: 90vh;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05);
}

.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
.modal-header h3 { font-size: 1.5rem; font-weight: 900; color: var(--primary); }
.btn-close { background: rgba(0,0,0,0.05); padding: 0.5rem; border-radius: 50%; display: flex; transition: all 0.2s; }
.btn-close:hover { background: rgba(0,0,0,0.1); transform: rotate(90deg); }

.form-group { margin-bottom: 1.5rem; }
.form-group label { display: block; font-size: 0.85rem; font-weight: 800; margin-bottom: 0.5rem; color: #475569; }
.form-group input[type="text"], 
.form-group input[type="date"], 
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.8rem 1rem;
  border-radius: 12px;
  border: 1px solid #cbd5e1;
  background: #f8fafc; /* Subtle contrast against white modal */
  font-size: 1rem;
  color: #333;
  transition: all 0.2s ease;
}

.form-group input:focus, .form-group select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
  outline: none;
  background: white;
}

.radio-group { display: flex; gap: 1.5rem; padding: 0.5rem 0; }
.radio-item { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; cursor: pointer; }

.checkbox { display: flex; align-items: center; gap: 0.75rem; }
.checkbox input { width: 20px; height: 20px; }

.upload-box { border: 1px dashed var(--glass-border); padding: 1.5rem; border-radius: var(--radius-md); text-align: center; cursor: pointer; }
.upload-box:hover { background: var(--bg-secondary); }

.input-with-icon { position: relative; }
.input-with-icon svg { position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
.input-with-icon input { padding-left: 2.75rem !important; }

.w-full { width: 100%; }
.mt-2 { margin-top: 2rem; }

/* Farm Settings Styles */
.farm-settings-section { padding: 2rem; }
.farm-card { padding: 2.5rem; max-width: 800px; margin: 0 auto; border: 1px solid var(--glass-stroke); }

.rounding-toggle { display: flex; gap: 4px; background: #f1f5f9; padding: 4px; border-radius: 10px; width: fit-content; }
.rounding-btn {
  padding: 0.4rem 1.2rem;
  border: none; border-radius: 7px;
  font-size: 0.85rem; font-weight: 700;
  cursor: pointer; transition: all 0.18s;
  background: transparent; color: #64748b;
}
.rounding-btn.active { background: white; color: var(--primary); box-shadow: 0 1px 4px rgba(0,0,0,0.10); }
.rounding-btn:hover:not(.active) { background: #e2e8f0; }
.farm-header { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2.5rem; border-bottom: 1px solid #eee; padding-bottom: 1.5rem; }
.farm-header h3 { font-size: 1.5rem; font-weight: 800; }
.farm-header p { color: #64748b; font-size: 0.9rem; }

.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
.settings-grid .full { grid-column: span 2; }
.settings-grid .form-group label { display: block; font-size: 0.85rem; font-weight: 800; color: #475569; margin-bottom: 0.5rem; }
.settings-grid .actions { grid-column: span 2; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #eee; }
.settings-grid .btn-primary { padding: 1rem 2rem; font-size: 1rem; border-radius: 12px; }

/* ==========================================
 * Certificate Badges & Lightbox Styles (v2.3.0)
 * ========================================== */
.cert-status-badge-container {
  display: flex;
  gap: 0.5rem;
}

.cert-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-full, 999px);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.cert-badge.valid {
  background: rgba(22, 163, 74, 0.1);
  color: #16a34a;
  border-color: rgba(22, 163, 74, 0.2);
}
.cert-badge.valid:hover {
  background: #16a34a;
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(22, 163, 74, 0.2);
}

.cert-badge.warning {
  background: rgba(217, 119, 6, 0.1);
  color: #d97706;
  border-color: rgba(217, 119, 6, 0.2);
  animation: pulse-soft 2s infinite;
}
.cert-badge.warning:hover {
  background: #d97706;
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(217, 119, 6, 0.2);
}

.cert-badge.expired {
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.2);
}
.cert-badge.expired:hover {
  background: #dc2626;
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(220, 38, 38, 0.2);
}

.cert-badge.none {
  background: #f1f5f9;
  color: #94a3b8;
  cursor: default;
}

@keyframes pulse-soft {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  100% { opacity: 1; }
}

/* Lightbox overlay */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(15, 23, 42, 0.9); /* slate-900 with high opacity */
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.lightbox-content {
  position: relative;
  max-width: 90vw;
  max-height: 85vh;
  background: white;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}

.lightbox-content img {
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
  display: block;
}

.lightbox-pdf {
  width: 85vw;
  height: 82vh;
  border: none;
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  display: block;
}

.lightbox-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  padding: 0.5rem;
  border-radius: 50%;
  display: flex;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 10;
}
.lightbox-close:hover {
  background: rgba(0, 0, 0, 0.8);
  transform: scale(1.1);
}

.lightbox-caption {
  background: #1e293b;
  color: white;
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  font-weight: 700;
  text-align: center;
}

/* Google Maps Generator Panel (v3.1.5) */
.google-map-generator {
  padding: 1rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(21, 128, 61, 0.2);
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(4px);
  margin-top: 1rem;
  margin-bottom: 1rem;
}
.sub-header-map {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.sub-header-map h5 {
  font-size: 0.85rem;
  font-weight: 800;
  color: #166534;
  margin: 0;
}
.google-map-generator .desc-text {
  font-size: 0.7rem;
  color: #64748b;
  line-height: 1.4;
  margin-top: 0;
  margin-bottom: 0.75rem;
}
.search-input {
  font-weight: 700;
  color: #1e293b;
}
.settings-row-map {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.setting-item-map label {
  font-size: 0.65rem;
  font-weight: 800;
  color: #475569;
  margin-bottom: 0.25rem;
  display: block;
}
.btn-generate-map {
  background: var(--gradient-primary);
  color: white;
  border: none;
  font-size: 0.8rem;
  font-weight: 800;
  padding: 0.65rem 1rem;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(22, 101, 52, 0.15);
  transition: all 0.2s ease-in-out;
}
.btn-generate-map:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(22, 101, 52, 0.25);
}
.btn-generate-map:disabled {
  background: #cbd5e1;
  color: #94a3b8;
  cursor: not-allowed;
  box-shadow: none;
}

/* Interactive Drawing GIS Map styling (v3.2.0) */
.search-row-map {
  display: flex;
  gap: 0.5rem;
  width: 100%;
}
.search-row-map .search-input {
  flex: 1;
}
.btn-search-map-action {
  background: #1e293b;
  color: white;
  border: none;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0 1rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}
.btn-search-map-action:hover {
  background: #0f172a;
}
.interactive-map-wrapper {
  width: 100%;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--glass-border);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
}
.interactive-map {
  width: 100%;
  height: 280px;
  background: #f8fafc;
  position: relative;
}
.map-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  color: #475569;
}
.fallback-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}
.fallback-title {
  font-size: 0.9rem;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 0.25rem;
}
.fallback-desc {
  font-size: 0.7rem;
  color: #64748b;
  line-height: 1.4;
  max-width: 280px;
}
.flex-end-map {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
}
.btn-clear-draw {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.2);
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}
.btn-clear-draw:hover {
  background: #dc2626;
  color: white;
}
</style>
