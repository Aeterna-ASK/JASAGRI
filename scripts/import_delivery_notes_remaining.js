/**
 * 納品書 残り20件 一括追加（DN-1041〜DN-1060）
 * syncToCloud を最後に1回だけ呼ぶバッチ方式
 */
(async () => {
  const { state, actions } = await import('/src/store/index.js');

  const PARTNER_ID   = '1781195235246';
  const PARTNER_NAME = '福山黒酢株式会社　工場';
  const UNIT_PRICE   = 4000;
  const TAX_RATE     = 0.1;

  const bb  = (kg) => ({ name: 'ブルーベリー', fullName: 'ブルーベリー',    quantity: kg, unit: 'kg', unitPrice: UNIT_PRICE, isOrganic: false });
  const org = (kg) => ({ name: 'ブルーベリー', fullName: '有機ブルーベリー', quantity: kg, unit: 'kg', unitPrice: UNIT_PRICE, isOrganic: true  });

  function dn(date, items) {
    const subtotal  = items.reduce((s, i) => s + i.quantity * UNIT_PRICE, 0);
    const taxAmount = Math.round(subtotal * TAX_RATE);
    const amount    = subtotal + taxAmount;
    const itemsStr  = items.map(i => `${i.fullName} (${i.quantity}kg @¥${UNIT_PRICE.toLocaleString()})`).join(', ');
    return { date, partnerId: PARTNER_ID, partnerName: PARTNER_NAME,
             itemDetails: items, items: itemsStr, subtotal, taxAmount, amount, farmInfo: '' };
  }

  // DN-1031〜1040 は既に登録済み → 残りの20件
  const REMAINING = [
    dn('2024-07-22', [bb(10)]),          // DN-1041
    dn('2024-07-26', [bb(15)]),          // DN-1042
    dn('2024-08-02', [bb(15)]),          // DN-1043
    dn('2024-08-06', [bb(10)]),          // DN-1044
    dn('2024-08-10', [bb(5)]),           // DN-1045
    dn('2024-08-16', [bb(2)]),           // DN-1046
    dn('2025-07-08', [bb(2.5), org(2.5)]),   // DN-1047  両方
    dn('2025-07-10', [bb(10)]),          // DN-1048
    dn('2025-07-14', [bb(15)]),          // DN-1049
    dn('2025-07-17', [bb(20)]),          // DN-1050
    dn('2025-07-22', [bb(15), org(15)]), // DN-1051  両方
    dn('2025-07-25', [bb(20)]),          // DN-1052
    dn('2025-07-28', [bb(15)]),          // DN-1053
    dn('2025-07-31', [bb(15)]),          // DN-1054
    dn('2025-08-01', [bb(15)]),          // DN-1055
    dn('2025-08-04', [bb(7.5), org(7.5)]),   // DN-1056  両方
    dn('2025-08-07', [bb(10)]),          // DN-1057
    dn('2025-08-11', [bb(10)]),          // DN-1058
    dn('2025-08-19', [bb(10)]),          // DN-1059
    dn('2025-08-25', [org(10)]),         // DN-1060  有機
  ];

  console.log(`📋 残り${REMAINING.length}件をバッチ追加中...`);

  if (!state.records.t_jas_seal_record) state.records.t_jas_seal_record = [];

  for (const note of REMAINING) {
    await new Promise(res => setTimeout(res, 8)); // ID一意性のためのみ
    const id     = `DN${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
    const slipNo = `DN-${state.slipCounter++}`;
    const record = { ...note, id, slipNo };

    // 配列に追加（syncCloud は呼ばない）
    state.records.t_delivery_note.push(record);

    // 有機品目があればJASシール受払記録を自動作成
    const organicCount = record.itemDetails.filter(i => i.isOrganic).length;
    if (organicCount > 0) {
      state.records.t_jas_seal_record.push({
        id: `seal_auto_${id}`,
        date: record.date,
        type: 'use',
        qty: organicCount,
        voucherNo: slipNo,
        remarks: `${PARTNER_NAME}への納品に伴うJASマーク自動貼付`
      });
    }
  }

  // 最後に1回だけクラウド同期
  actions.syncToCloud();

  const total = REMAINING.reduce((s, n) => s + n.amount, 0);
  console.log(`✅ ${REMAINING.length}件追加・Firestore同期完了！`);
  console.log(`📌 伝票番号: DN-1041〜DN-1060`);
  console.log(`💰 今回分合計: ¥${total.toLocaleString()}（税込）`);
})().catch(e => console.error('❌ エラー:', e));
