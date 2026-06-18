/**
 * ブルーベリー収穫量 → 納品書 一括発行スクリプト
 * 使い方: localhost:5173 を開いた状態でブラウザコンソールに貼り付けて実行
 *
 * 納品先 : 福山黒酢株式会社　工場
 * 単価   : 4,000円/kg（税込10%）
 * 件数   : 30件 (2024:16件 / 2025:14件)
 */
(async () => {
  const { state, actions } = await import('/src/store/index.js');

  const PARTNER_ID   = '1781195235246';
  const PARTNER_NAME = '福山黒酢株式会社　工場';
  const UNIT_PRICE   = 4000;
  const TAX_RATE     = 0.1;

  const bb  = (kg) => ({ name: 'ブルーベリー', fullName: 'ブルーベリー',    quantity: kg, isOrganic: false });
  const org = (kg) => ({ name: 'ブルーベリー', fullName: '有機ブルーベリー', quantity: kg, isOrganic: true  });

  function dn(date, items) {
    const itemDetails = items.map(i => ({
      name: i.name, fullName: i.fullName,
      quantity: i.quantity, unit: 'kg',
      unitPrice: UNIT_PRICE, isOrganic: i.isOrganic
    }));
    const subtotal  = itemDetails.reduce((s, i) => s + i.quantity * UNIT_PRICE, 0);
    const taxAmount = Math.round(subtotal * TAX_RATE);
    const amount    = subtotal + taxAmount;
    const itemsStr  = itemDetails
      .map(i => `${i.fullName} (${i.quantity}kg @¥${UNIT_PRICE.toLocaleString()})`)
      .join(', ');
    return { date, partnerId: PARTNER_ID, partnerName: PARTNER_NAME,
             itemDetails, items: itemsStr, subtotal, taxAmount, amount, farmInfo: '' };
  }

  const NOTES = [
    // ════════ 2024 ════════
    dn('2024-06-28', [bb(5)]),           // 溝辺  5kg
    dn('2024-07-02', [bb(1)]),           // 溝辺  1kg
    dn('2024-07-03', [bb(6)]),           // 溝辺  6kg
    dn('2024-07-05', [org(1)]),          // B畑   1kg（有機）
    dn('2024-07-06', [bb(4)]),           // 溝辺  4kg
    dn('2024-07-09', [bb(15)]),          // 溝辺 15kg
    dn('2024-07-11', [org(3)]),          // B畑   3kg（有機）
    dn('2024-07-12', [bb(25)]),          // 溝辺 25kg
    dn('2024-07-16', [bb(10)]),          // 溝辺 10kg
    dn('2024-07-19', [bb(10)]),          // 溝辺 10kg
    dn('2024-07-22', [bb(10)]),          // 溝辺 10kg
    dn('2024-07-26', [bb(15)]),          // 溝辺 15kg
    dn('2024-08-02', [bb(15)]),          // 溝辺 15kg
    dn('2024-08-06', [bb(10)]),          // 溝辺 10kg
    dn('2024-08-10', [bb(5)]),           // 溝辺  5kg
    dn('2024-08-16', [bb(2)]),           // 溝辺  2kg
    // ════════ 2025 ════════
    dn('2025-07-08', [bb(2.5), org(2.5)]),   // 両方 各2.5kg → 合計5kg
    dn('2025-07-10', [bb(10)]),
    dn('2025-07-14', [bb(15)]),
    dn('2025-07-17', [bb(20)]),
    dn('2025-07-22', [bb(15), org(15)]),     // 両方 各15kg → 合計30kg
    dn('2025-07-25', [bb(20)]),
    dn('2025-07-28', [bb(15)]),
    dn('2025-07-31', [bb(15)]),
    dn('2025-08-01', [bb(15)]),
    dn('2025-08-04', [bb(7.5), org(7.5)]),   // 両方 各7.5kg → 合計15kg
    dn('2025-08-07', [bb(10)]),
    dn('2025-08-11', [bb(10)]),
    dn('2025-08-19', [bb(10)]),
    dn('2025-08-25', [org(10)]),             // B畑 10kg（有機）
  ];

  console.log(`📋 納品書発行開始: ${NOTES.length}件 (DN-${state.slipCounter}〜)`);
  for (let i = 0; i < NOTES.length; i++) {
    await new Promise(res => setTimeout(res, 30));
    actions.addDeliveryNote(NOTES[i]);
    if ((i + 1) % 5 === 0) console.log(`  ... ${i + 1}/${NOTES.length} 件発行`);
  }
  console.log(`✅ ${NOTES.length}件の納品書を発行しました！`);
  console.log(`📌 伝票番号: DN-1031〜DN-${1030 + NOTES.length}`);

  // 合計金額の確認
  const total = NOTES.reduce((s, n) => s + n.amount, 0);
  console.log(`💰 合計出荷額: ¥${total.toLocaleString()}（税込）`);
})().catch(e => console.error('❌ エラー:', e));
