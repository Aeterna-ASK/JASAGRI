/**
 * jasSeedData.js
 * 有機JAS準拠の防除データベース初期データ v.2.4.0
 * 出典: 農家web, 農水省アグリサーチャー, FAMIC, 各都道府県有機農業ガイド
 */

export const JAS_SEED_DATA = {
  m_crop: [
    { id: 'c1', name: '稲', family: 'イネ科' },
    { id: 'c2', name: 'キャベツ・ブロッコリー', family: 'アブラナ科' },
    { id: 'c3', name: 'トマト・ナス・ピーマン', family: 'ナス科' },
    { id: 'c4', name: 'イチゴ', family: 'バラ科' },
    { id: 'c5', name: 'ホウレンソウ', family: 'ヒユ科' },
    { id: 'c6', name: 'キュウリ・カボチャ', family: 'ウリ科' },
    { id: 'c7', name: 'ダイコン・カブ', family: 'アブラナ科' }
  ],

  m_group: [
    { id: 'g1', name: '吸汁害虫（アブラムシ・アザミウマ等）' },
    { id: 'g2', name: '食害害虫（コナガ・ヨトウムシ・青虫等）' },
    { id: 'g3', name: 'カビ類病害（ベト病・いもち病等）' },
    { id: 'g4', name: 'うどんこ病・灰色かび病' },
    { id: 'g5', name: '土壌病害・軟腐病' },
    { id: 'g6', name: 'カメムシ類' }
  ],

  m_pest: [
    { 
      id: 'p1', name: 'アブラムシ類', category: '害虫', groupId: 'g1', 
      cropIds: ['c2', 'c3', 'c4', 'c5', 'c6', 'c7'], 
      source: '農家web / 農水省アグリサーチャー' 
    },
    { 
      id: 'p2', name: 'コナガ', category: '害虫', groupId: 'g2', 
      cropIds: ['c2', 'c7'], 
      source: '農林水産省 有機農業技術ガイド' 
    },
    { 
      id: 'p3', name: 'アザミウマ類', category: '害虫', groupId: 'g1', 
      cropIds: ['c3', 'c4', 'c6'], 
      source: 'FAMIC 農薬登録情報' 
    },
    { 
      id: 'p4', name: 'ベト病', category: '病害', groupId: 'g3', 
      cropIds: ['c2', 'c5', 'c6'], 
      source: '農研機構(NARO) 防除マニュアル' 
    },
    { 
      id: 'p5', name: 'うどんこ病', category: '病害', groupId: 'g4', 
      cropIds: ['c3', 'c4', 'c6'], 
      source: '農家web / 有機JAS資材ガイド' 
    },
    { 
      id: 'p6', name: 'ハダニ類', category: '害虫', groupId: 'g1', 
      cropIds: ['c3', 'c4', 'c6'], 
      source: '農水省アグリサーチャー' 
    },
    { 
      id: 'p7', name: 'ヨトウムシ類', category: '害虫', groupId: 'g2', 
      cropIds: ['c2', 'c3', 'c5', 'c7'], 
      source: '農林水産省 有機農業技術ガイド' 
    },
    { 
      id: 'p8', name: 'いもち病', category: '病害', groupId: 'g3', 
      cropIds: ['c1'], 
      source: 'FAMIC / 農研機構' 
    },
    { 
      id: 'p9', name: '灰色かび病', category: '病害', groupId: 'g4', 
      cropIds: ['c3', 'c4', 'c6'], 
      source: '農林水産省 有機農業技術ガイド' 
    },
    { 
      id: 'p10', name: 'カメムシ類', category: '害虫', groupId: 'g6', 
      cropIds: ['c1', 'c3', 'c6'], 
      source: '農水省アグリサーチャー' 
    },
    { 
      id: 'p11', name: '軟腐病', category: '病害', groupId: 'g5', 
      cropIds: ['c2', 'c7'], 
      source: '農家web / 各都道府県防除指針' 
    }
  ],

  m_solution: [
    // 物理的防除 (Category A)
    { id: 's1', name: '0.8mm目以下の防虫ネット展張', category: 'A', detail: 'コナガ、アブラムシの侵入を物理的に遮断' },
    { id: 's2', name: 'シルバー反射マルチ', category: 'A', detail: 'アブラムシ、アザミウマ類の飛来抑制' },
    { id: 's3', name: '黄色・青色粘着トラップ設置', category: 'A', detail: 'アブラムシ、アザミウマの予察と捕殺' },
    { id: 's4', name: '温湯消毒（60℃・10分）', category: 'A', detail: '種子伝染性病害の不活性化' },
    { id: 's5', name: '送風機（防除用）による物理的捕殺', category: 'A', detail: 'ハダニ、アザミウマの吹き飛ばし' },
    
    // 生物的防除 (Category B)
    { id: 's10', name: 'BT剤（ゼンターリ顆粒水和剤等）', category: 'B', detail: '鱗翅目害虫（コナガ、ヨトウ）の選択的殺虫' },
    { id: 's11', name: '天敵製剤（コレマンアブラバチ等）', category: 'B', detail: 'アブラムシ類への寄生' },
    { id: 's12', name: '微生物殺菌剤（バチルス・ズブチリス）', category: 'B', detail: 'うどんこ病、灰色かび病の拮抗作用' },
    { id: 's13', name: 'トリコデルマ菌（土壌改質）', category: 'B', detail: '土壌病害の抑制' },

    // 有機JAS適合資材 (Category C)
    { id: 's20', name: '粘着くん液剤（デンプン）', category: 'C', detail: '物理的な窒息死（気門封鎖）' },
    { id: 's21', name: 'コサイドDE（銅水和剤）', category: 'C', detail: '幅広い菌類への殺菌作用。使用制限に注意' },
    { id: 's22', name: 'カリグリーン（炭酸水素カリウム）', category: 'C', detail: 'うどんこ病特効。JASカウント対象外' },
    { id: 's23', name: '硫黄合剤', category: 'C', detail: '殺菌・殺ダニ作用。果樹・野菜の広範囲に使用可' },
    { id: 's24', name: 'マシン油乳剤', category: 'C', detail: 'カイガラムシ、ハダニ類の物理的防除' },
    { id: 's25', name: '醸造酢（特定防除資材）', category: 'C', detail: '殺菌・忌避効果' },
    { id: 's26', name: '石灰硫黄合剤', category: 'C', detail: '越冬害虫、カビ類病害の強力な防除' }
  ],

  m_mapping: {
    'g1': { // 吸汁害虫
      solutions: ['s1', 's2', 's3', 's11', 's20', 's24', 's25']
    },
    'g2': { // 食害害虫
      solutions: ['s1', 's10']
    },
    'g3': { // カビ類病害
      solutions: ['s21', 's25', 's26']
    },
    'g4': { // うどんこ・灰色かび
      solutions: ['s12', 's22', 's23', 's25']
    },
    'g5': { // 土壌・軟腐
      solutions: ['s4', 's13', 's21']
    },
    'g6': { // カメムシ
      solutions: ['s1', 's2', 's25']
    }
  }
};
