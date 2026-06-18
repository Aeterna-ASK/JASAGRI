"""
Orgaly - Excel 作業記録インポートコンバーター v2
Book1.xlsx (R6-R7 A畑一覧) → import_data.json

使い方:
  python tools/convert_excel_import.py
出力:
  public/import_data.json

v2 変更点:
  - 業務+作業が両方ある場合: 作業 → content、業務 → note（備考扱い）
  - 同日複数行を1レコードにグループ化（日付ごとに1作業記録）
  - 機材: equipmentNames[] として保存（アプリ側で名前→IDマッチング）
  - 収穫量: note に「収穫量: X」として記録
  - 洗浄記録: isWashed=True、洗浄方法は note に記録

JAS帳票 列対応:
  作業         ← content
  種苗及び資材名 ← seeds[].name / materials[].name
  数量         ← seeds[].quantity / materials[].quantity
  入手先       ← seeds[].source / materials[].source
  入手日       ← seeds[].purchaseDate / materials[].purchaseDate
  機械・器具名 ← equipmentNames[]（アプリ側でID解決）
  洗浄記録     ← isWashed (○/空白)
  播種日       ← content='播種' の行の日付（アプリ側で自動計算）
  定植日       ← content='定植' の行の日付（アプリ側で自動計算）
  収穫始め     ← content='収穫開始' の行の日付（アプリ側で自動計算）
  収穫終わり   ← content='収穫終了' の行の日付（アプリ側で自動計算）
  備考         ← note
"""

import openpyxl
import json
import sys
import io
import os
import re
from datetime import datetime
from collections import OrderedDict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ──────────────────────────────────────────────────
EXCEL_PATH  = r'C:\Users\dai72\OneDrive\デスクトップ\Book1.xlsx'
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'import_data.json')
WORKER_NAME = 'AGRI KAKUIDA'
FIELD_NAME  = 'A畑'
IMPORT_SRC  = 'R6-R7 A畑一覧'

# 播種/定植 → seeds[] に格納する作業種別
SEED_WORKS = {'播種', '定植'}

# 収穫 → 数量を note「収穫量: X」に記録する作業種別
HARVEST_WORKS = {'収穫', '収穫開始', '収穫終了', '収穫始め', '収穫終わり'}

# 施肥系 → materials[] に肥料情報を格納するキーワード
FERTILIZER_KEYWORDS = {'施肥', '堆肥', '有機肥料', 'マルチ'}

# ──────────────────────────────────────────────────

def fmt_date(val):
    """datetime / 文字列 → 'YYYY-MM-DD'。変換不可は ''。"""
    if val is None:
        return ''
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    # "前期8/19"、"年" を含む非標準文字列はスキップ
    if '前' in s or '年' in s:
        return ''
    return s

def fmt_qty(val):
    """数量を文字列に変換（2.0 → '2'、None → ''）"""
    if val is None:
        return ''
    if isinstance(val, float) and val == int(val):
        return str(int(val))
    return str(val).strip()

def normalize(s):
    return (s or '').strip()

def split_equipment(kizai_str):
    """機材文字列を個別の機材名リストに分割。区切り: 、,・/"""
    if not kizai_str:
        return []
    parts = re.split(r'[、,・/]', kizai_str)
    return [p.strip() for p in parts if p.strip()]

def make_id(prefix, index):
    return f'{prefix}_{index:04d}'

# ──────────────────────────────────────────────────

wb = openpyxl.load_workbook(EXCEL_PATH)
ws = wb.active

# ===== Pass 1: 各行を解析 → 日付ごとにグループ化 =====
# OrderedDict で Excel の行順を保持
date_groups = OrderedDict()   # { date_str: [temp_record, ...] }
material_receipts_list = []
skipped = 0
total_rows = 0

for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=1):
    col_date       = row[0]   # A: 日付
    col_crop       = row[1]   # B: 作物
    col_gyomu      = row[2]   # C: 業務
    col_sakuya     = row[3]   # D: 作業
    col_hinshu     = row[4]   # E: 品種
    col_suryo      = row[5]   # F: 数量
    col_kounyusaki = row[6]   # G: 購入先
    col_kounyubi   = row[7]   # H: 購入日
    # row[8] は空列のためスキップ
    col_kizai      = row[9]   # J: 機材
    col_sensho     = row[10]  # K: 洗浄
    col_biko       = row[11]  # L: 備考

    total_rows = row_idx

    if col_date is None:
        skipped += 1
        continue

    date_str = fmt_date(col_date)
    if not date_str:
        skipped += 1
        continue

    # ── 年度補正 ──────────────────────────────────
    # A2〜A111  (row_idx  1〜110): 9月〜12月 → 正しくは 2023年
    # A112〜    (row_idx 111〜 ): 1月〜 5月 → 正しくは 2024年
    if row_idx <= 110:
        date_str = '2023-' + date_str[5:]
    else:
        date_str = '2024-' + date_str[5:]

    crop_name   = normalize(col_crop)
    gyomu       = normalize(col_gyomu)
    sakuya      = normalize(col_sakuya)
    hinshu      = normalize(col_hinshu)
    suryo       = fmt_qty(col_suryo)
    kounyusaki  = normalize(col_kounyusaki)
    kounyubi    = fmt_date(col_kounyubi)
    kizai       = normalize(col_kizai)
    sensho      = normalize(col_sensho)
    biko        = normalize(col_biko)

    # ── メインコンテンツと備考の組み立て ──────────────
    note_parts = []

    if gyomu == '前期持ち越し':
        # 前期からの引き継ぎ作物 → 後続記録と連続性があるため作業記録として保存
        main_content = '前期持ち越し'
        if suryo:
            note_parts.append(f'数量: {suryo}')
        if biko:
            note_parts.append(biko)

    elif sakuya:
        # 作業列（D）がメインコンテンツ
        main_content = sakuya
        if gyomu and gyomu != sakuya:
            # 業務列（C）は備考扱い（例: 育苗ハウス播種 → 播種元の情報として備考へ）
            note_parts.append(gyomu)
        if biko:
            note_parts.append(biko)
        # 収穫量 → note 先頭に追記
        if sakuya in HARVEST_WORKS and suryo:
            note_parts.insert(0, f'収穫量: {suryo}')

    elif gyomu:
        # 業務列のみ（圃場作業、施肥など）
        main_content = gyomu
        if biko:
            note_parts.append(biko)

    else:
        skipped += 1
        continue

    # ── 機材・洗浄 ──────────────────────────────────
    equipment_names = split_equipment(kizai)
    is_washed = bool(sensho)
    if sensho:
        note_parts.append(f'洗浄: {sensho}')

    # ── seeds 配列（播種/定植のみ）──────────────────
    seeds = []
    if sakuya in SEED_WORKS and (hinshu or crop_name or suryo):
        seeds.append({
            'name':         hinshu or crop_name,
            'taskType':     sakuya,
            'quantity':     suryo,
            'source':       kounyusaki,
            'purchaseDate': kounyubi,
        })

    # ── materials 配列（施肥資材）────────────────────
    materials = []
    is_fertilizer = any(kw in gyomu for kw in FERTILIZER_KEYWORDS) if gyomu else False
    if is_fertilizer and hinshu and not sakuya:
        materials.append({
            'name':         hinshu,
            'quantity':     suryo,
            'source':       kounyusaki,
            'purchaseDate': kounyubi,
        })

    # 一時レコード
    temp = {
        'row_idx':        row_idx,
        'crop_name':      crop_name,
        'main_content':   main_content,
        'seeds':          seeds,
        'materials':      materials,
        'equipment_names': equipment_names,
        'is_washed':      is_washed,
        'note_parts':     note_parts,
        # 資材購入記録生成用（アンダースコアプレフィックスで区別）
        '_sakuya':        sakuya,
        '_hinshu':        hinshu,
        '_suryo':         suryo,
        '_kounyusaki':    kounyusaki,
        '_kounyubi':      kounyubi,
        '_is_fertilizer': is_fertilizer,
        '_biko':          biko,
    }

    # グループキー = (日付, 作物名)
    # 帳票が「農産物名1件 = 1ページ」なので作物ごとに別レコード
    # 作物なし（除草・耕運など圃場全体作業）は crop_name='' でまとめる
    group_key = (date_str, crop_name)
    if group_key not in date_groups:
        date_groups[group_key] = []
    date_groups[group_key].append(temp)

# ===== Pass 2: 同日グループを1作業記録にマージ =====
work_records = []
mr_counter = 0

for group_idx, ((date_str, crop_name), group) in enumerate(date_groups.items(), start=1):

    # グループキーが (date_str, crop_name) なので同一グループは必ず同一作物
    # 同日・同作物の複数作業を ' / ' で連結
    # 例: 除草 / 耕運  /  播種 / 定植
    content = ' / '.join(r['main_content'] for r in group)

    # ── マージ ──
    seeds_all       = []
    materials_all   = []
    equip_names_all = []
    note_parts_all  = []
    is_washed_any   = False

    for r in group:
        seeds_all.extend(r['seeds'])
        materials_all.extend(r['materials'])
        equip_names_all.extend(r['equipment_names'])
        note_parts_all.extend(r['note_parts'])
        if r['is_washed']:
            is_washed_any = True

    # 機材名重複除去（順序保持）
    equip_names_dedup = list(dict.fromkeys(equip_names_all))

    wr = {
        'id':             make_id('import_wr', group_idx),
        'date':           date_str,
        'fieldId':        None,          # アプリ側で fieldName → ID 解決
        'fieldName':      FIELD_NAME,
        'cropId':         None,          # アプリ側で cropName → ID 解決
        'cropName':       crop_name,
        'content':        content,
        'workerName':     WORKER_NAME,
        'seeds':          seeds_all,
        'materials':      materials_all,
        'equipmentNames': equip_names_dedup,  # アプリ側で名前→ID解決（未マッチはnote追記）
        'equipmentIds':   [],
        'isWashed':       is_washed_any,
        'note':           ' / '.join(note_parts_all),
        'createdAt':      datetime.now().isoformat(),
        '_importSource':  IMPORT_SRC,
    }
    work_records.append(wr)

    # ── 資材購入記録（各行を個別に処理）──
    for r in group:
        sk = r['_sakuya']
        hi = r['_hinshu']
        su = r['_suryo']
        ko = r['_kounyusaki']
        kb = r['_kounyubi']

        # 種子・苗：播種/定植で購入先が記入されているもの
        if sk in SEED_WORKS and hi and ko:
            mr_counter += 1
            mr_date = kb if kb else date_str
            material_receipts_list.append({
                'id':            make_id('import_mr', mr_counter),
                'date':          mr_date,
                'materialName':  hi,
                'quantity':      su,
                'supplier':      ko,
                'category':      '種子・苗',
                'note':          f"{r['crop_name']} {sk}".strip(),
                'createdAt':     datetime.now().isoformat(),
                '_importSource': IMPORT_SRC,
            })

        # 肥料：施肥作業で購入先が記入されているもの
        elif r['_is_fertilizer'] and hi and ko:
            mr_counter += 1
            mr_date = kb if kb else date_str
            material_receipts_list.append({
                'id':            make_id('import_mr_fert', mr_counter),
                'date':          mr_date,
                'materialName':  hi,
                'quantity':      su,
                'supplier':      ko,
                'category':      '肥料',
                'note':          r['_biko'],
                'createdAt':     datetime.now().isoformat(),
                '_importSource': IMPORT_SRC,
            })

# ===== 出力 =====
output = {
    'version':          '2.0',
    'source':           IMPORT_SRC,
    'fieldName':        FIELD_NAME,
    'generatedAt':      datetime.now().isoformat(),
    'workRecords':      work_records,
    'materialReceipts': material_receipts_list,
    'stats': {
        'totalRows':        total_rows,
        'workRecords':      len(work_records),
        'materialReceipts': len(material_receipts_list),
        'skipped':          skipped,
    }
}

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f'✅ 変換完了 (v2)')
print(f'   作業記録:   {len(work_records)}件（日別グループ化後）')
print(f'   資材購入:   {len(material_receipts_list)}件')
print(f'   スキップ:   {skipped}件')
print(f'   出力先: {os.path.abspath(OUTPUT_PATH)}')
