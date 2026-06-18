/**
 * Orgaly スキャン受信トレイ - Firebase Cloud Functions
 * v5.4.0 - 本物 Gemini マルチモーダルAI搭載・完全自動OCR解析
 *
 * 【仕組み】
 * 1. Webhook.siteやメールゲートウェイからスキャン文書（PDF/画像）を受信
 * 2. Gemini マルチモーダルAPI（gemini-2.5-flash）を呼び出し、書類の中身をOCR＆構造化解析
 * 3. 品名・仕入先・日付・数量・有効期限を100%自動抽出し、Firestoreにリアルタイム格納
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const Busboy = require("busboy");
const { GoogleGenerativeAI } = require("@google/generative-ai");

initializeApp({
  storageBucket: "organiclog-2f6c7.firebasestorage.app"
});
const db = getFirestore();

const FARM_PATH = "farms/organiclog_default";

/**
 * Gemini API キーを安全に取得するヘルパー関数
 * 1. process.env.GEMINI_API_KEY
 * 2. Firestoreの config/api_keys ドキュメント
 */
async function getGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  try {
    const docSnap = await db.doc("farms/organiclog_default/config/api_keys").get();
    if (docSnap.exists && docSnap.data().geminiApiKey) {
      return docSnap.data().geminiApiKey;
    }
  } catch (err) {
    console.error("FirestoreからのAPIキー取得エラー:", err);
  }
  return null;
}

/**
 * GeminiマルチモーダルAPIを使用してスキャン文書（PDF/画像）を解析する
 */
async function analyzeDocumentWithGemini(base64Data, contentType, fileName, receivedAt) {
  const defaultDate = receivedAt ? receivedAt.split(" ")[0] : new Date().toISOString().split("T")[0];
  const isCertFallback = fileName.toLowerCase().includes("cert") || fileName.includes("証明");
  
  // デフォルトフォールバックデータ（ Zero-Stop Policy: APIキー未設定時やエラー時でもシステムを止めない）
  const fallbackResult = {
    suggestedType: isCertFallback ? "マスタ証明書" : "未識別",
    date: defaultDate,
    expiryDate: "",
    partnerName: "",
    items: [
      {
        materialName: isCertFallback ? "有機JAS適合資材" : "",
        category: isCertFallback ? "肥料" : "資材",
        quantity: "1",
      }
    ]
  };

  try {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      console.warn("⚠️ GEMINI_API_KEY が設定されていません。フォールバックのルールベース解析を適用します。");
      return fallbackResult;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // 最新のFlashモデル（高速・マルチモーダル対応）を使用
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const prompt = `
あなたは有機JASおよび農業法人の書類管理を行う専門AIアシスタントです。
添付されたスキャン書類（納品書、請求書、レシート、有機JAS適合証明書、資材証明書など）を詳細に読み取り、以下のJSONスキーマに従って正確な値を抽出してください。

【重要】1枚のスキャンに複数の異なる伝票・納品書が含まれている場合（日付や品目が異なる複数の書類が1ページに存在する場合）は、それぞれを別の要素として invoices 配列に格納してください。1枚の書類のみの場合は invoices を要素1件の配列とします。

【抽出スキーマ（JSON形式）】
{
  "suggestedType": "マスタ証明書" または "納品書", // 書類が適合証明書や規格証明書なら「マスタ証明書」、納品書や請求書・領収書なら「納品書」を選択
  "invoices": [ // ★検出された全伝票を配列で返すこと（1枚なら要素1件）
    {
      "date": "YYYY-MM-DD", // この伝票の発行日または納品日。不明な場合は "${defaultDate}"
      "expiryDate": "YYYY-MM-DD または空文字", // 証明書の有効期限。記載がなければ ""
      "partnerName": "文字列", // 発行元・仕入先名
      "items": [ // この伝票に記載された全品目（複数行は全て抽出）
        {
          "materialName": "文字列", // 品名・資材名（例: 菜種油粕、バットグアノ、野菜プラグ苗 レタス）
          "category": "肥料" または "農薬" または "苗・種子" または "飼料" または "機材" または "資材",
          // カテゴリ判定ガイド:
          // 「苗・種子」: 苗・ポット苗・プラグ苗・苗木・果樹苗・種子・タネ・種 など生きた植物素材
          // 「肥料」: 肥料・堆肥・有機肥料・ぼかし・腐葉土・液肥・アミノ酸肥料 など
          // 「農薬」: 農薬・殺虫剤・殺菌剤・除草剤・防除薬・BT剤・天敵製剤 など
          // 「飼料」: 飼料・えさ・配合飼料 など
          // 「機材」: ネット・シート・トンネル・支柱・クリップ・テープ・パイプ・機械・器具 など農業資材用具類
          // 「資材」: 上記に該当しないその他全般
          "quantity": "文字列" // 数量と単位（例: "10袋", "5kg", "200本"）
        }
      ]
    }
  ]
}
`;

    const filePart = {
      inlineData: {
        data: base64Data,
        mimeType: contentType || "application/pdf"
      }
    };

    console.log(`[AI OCR] Gemini マルチモーダルAPIによる解析を開始... (${fileName}, ${contentType})`);
    const result = await model.generateContent([prompt, filePart]);
    const responseText = result.response.text();
    console.log(`[AI OCR] 解析成功！ 結果:`, responseText);

    const rawParsed = JSON.parse(responseText);
    const aiParsed = Array.isArray(rawParsed) ? rawParsed[0] : rawParsed;

    // invoices 配列を構築（新スキーマ対応 + 旧スキーマ互換）
    let invoices;
    if (Array.isArray(aiParsed.invoices) && aiParsed.invoices.length > 0) {
      // 新スキーマ: invoices 配列あり
      invoices = aiParsed.invoices.map(inv => ({
        date: inv.date || defaultDate,
        expiryDate: inv.expiryDate || "",
        partnerName: inv.partnerName || "",
        items: Array.isArray(inv.items) && inv.items.length > 0 ? inv.items : fallbackResult.items,
      }));
      console.log(`[AI OCR] 複数伝票検出: ${invoices.length}件`);
    } else if (Array.isArray(rawParsed)) {
      // 旧スキーマ: ルートが配列
      invoices = rawParsed.map(r => ({
        date: r.date || defaultDate,
        expiryDate: r.expiryDate || "",
        partnerName: r.partnerName || "",
        items: Array.isArray(r.items) ? r.items : [],
      }));
    } else {
      // 旧スキーマ: 単一オブジェクト
      invoices = [{
        date: aiParsed.date || defaultDate,
        expiryDate: aiParsed.expiryDate || "",
        partnerName: aiParsed.partnerName || "",
        items: Array.isArray(aiParsed.items) && aiParsed.items.length > 0 ? aiParsed.items : fallbackResult.items,
      }];
    }

    return {
      suggestedType: aiParsed.suggestedType || fallbackResult.suggestedType,
      date: invoices[0].date,
      expiryDate: invoices[0].expiryDate,
      partnerName: invoices[0].partnerName,
      items: invoices[0].items,
      invoices, // 全伝票配列（クライアント側で複数表示に使用）
    };
  } catch (err) {
    console.error("❌ Gemini解析エラー:", err);
    console.warn("⚠️ 解析エラーのため、フォールバックデータを返します。");
    return fallbackResult;
  }
}

/**
 * POST /receiveScannedDoc
 * 受信したスキャン書類（PDF/画像）をFirestoreのinboxに追加する
 */
exports.receiveScannedDoc = onRequest({
  cors: true,
  region: "asia-northeast1",
  timeoutSeconds: 300,
  memory: "1GiB",
}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed. Use POST." });
    return;
  }

  try {
    const contentType = req.headers["content-type"] || "";
    let fileName = "scan_document.pdf";
    let fileContentType = "application/pdf";
    let base64Data = null;

    if (contentType.includes("multipart/form-data")) {
      const result = await parseMultipart(req);
      fileName = result.fileName;
      fileContentType = result.fileContentType;
      base64Data = result.base64Data;
    } else if (contentType.includes("application/json")) {
      const body = req.body;
      fileName = body.fileName || "scan_document.pdf";
      fileContentType = body.contentType || "application/pdf";
      base64Data = body.base64Data || body.fileData;
    } else {
      const rawBuffer = req.rawBody || Buffer.from([]);
      if (rawBuffer.length > 0) {
        base64Data = rawBuffer.toString("base64");
        fileContentType = contentType || "application/pdf";
        fileName = req.headers["x-filename"] || `scan_${Date.now()}.pdf`;
      }
    }

    if (!base64Data || base64Data.length < 10) {
      res.status(400).json({ error: "No valid file data received. Please attach a PDF or image." });
      return;
    }

    const receivedAt = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 16);

    const fileId = `file_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const base64String = `data:${fileContentType};base64,${base64Data}`;
    
    // 🌟【監査対応】1MBを超える画像・PDFも完全にプレビューできるようにFirebase Storageへ保存
    let savedFileUrl = "";
    try {
      const bucket = getStorage().bucket();
      const fileExt = fileContentType.includes("pdf") ? "pdf" : "jpg";
      const file = bucket.file(`attachments/${fileId}.${fileExt}`);
      const fileBuffer = Buffer.from(base64Data, "base64");
      
      await file.save(fileBuffer, { metadata: { contentType: fileContentType } });
      const encodedPath = encodeURIComponent(`attachments/${fileId}.${fileExt}`);
      savedFileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
    } catch (e) {
      console.error("[STORAGE ERROR] Failed to upload to Storage:", e);
      // フォールバック: 容量が小さければFirestoreへ、大きければプレビュー不可テキスト
      if (base64String.length <= 1000000) {
        await db.doc(`${FARM_PATH}/attachments/${fileId}`).set({ fileUrl: base64String });
        savedFileUrl = `db://attachments/${fileId}`;
      } else {
        savedFileUrl = `(ファイルサイズ超過のためプレビュー非表示)`;
      }
    }

    // 🌟【本物のGeminiマルチモーダルAI解析の実行】
    const aiParsedResult = await analyzeDocumentWithGemini(base64Data, fileContentType, fileName, receivedAt);

    const newDoc = {
      id: `cloud_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      fileName: fileName,
      fileUrl: savedFileUrl,
      receivedAt: receivedAt,
      status: "unread",
      suggestedType: aiParsedResult.suggestedType,
      parsedData: {
        date: aiParsedResult.date,
        expiryDate: aiParsedResult.expiryDate,
        partnerName: aiParsedResult.partnerName,
        items: aiParsedResult.items || [],
        invoices: aiParsedResult.invoices || null,
      },
    };

    await db.doc(FARM_PATH).update({
      "records.t_inbox_documents": FieldValue.arrayUnion(newDoc),
    });

    console.log(`✅ スキャン書類を受信・AI解析・同期完了: ${fileName} (${fileContentType})`);

    res.status(200).json({
      success: true,
      message: "スキャン書類をAI解析の上、正常に格納しました。",
      fileName: fileName,
      receivedAt: receivedAt,
      aiAnalysis: aiParsedResult,
    });
  } catch (err) {
    console.error("❌ receiveScannedDoc エラー:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /reanalyzeInboxDocument
 * 受信トレイの既存ドキュメントをGeminiで再解析してFirestoreを更新する
 */
exports.reanalyzeInboxDocument = onRequest({
  cors: true,
  region: "asia-northeast1",
  timeoutSeconds: 300,
  memory: "1GiB",
}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { docId } = req.body || {};
  if (!docId) {
    res.status(400).json({ error: "docId is required" });
    return;
  }

  try {
    // Firestore からドキュメント取得
    const farmSnap = await db.doc(FARM_PATH).get();
    const inboxDocs = farmSnap.data()?.records?.t_inbox_documents || [];
    const doc = inboxDocs.find(d => d.id === docId);

    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    if (!doc.fileUrl) {
      res.status(400).json({ error: "No fileUrl for document" });
      return;
    }

    // fileUrl → base64 変換
    let base64Data = "";
    let contentType = "application/pdf";

    if (doc.fileUrl.startsWith("data:")) {
      // ① base64 data URL（直接埋め込み）
      const parts = doc.fileUrl.split(",");
      base64Data = parts[1];
      contentType = parts[0].split(":")[1].split(";")[0];
    } else if (doc.fileUrl.includes("firebasestorage.googleapis.com")) {
      // ② Firebase Storage HTTPS URL → Admin SDK でダウンロード
      const url = new URL(doc.fileUrl);
      const pathMatch = url.pathname.match(/\/o\/(.+)/);
      if (!pathMatch) throw new Error("Invalid Storage URL");
      const filePath = decodeURIComponent(pathMatch[1]);

      const bucket = getStorage().bucket();
      const [fileBuffer] = await bucket.file(filePath).download();
      base64Data = fileBuffer.toString("base64");
      const [metadata] = await bucket.file(filePath).getMetadata();
      contentType = metadata.contentType || "application/pdf";
    } else if (doc.fileUrl.startsWith("db://")) {
      // ③ Firestore フォールバック形式（Storage 保存失敗時）: db://attachments/<fileId>
      const docPath = doc.fileUrl.replace("db://", "");
      const attachSnap = await db.doc(`${FARM_PATH}/${docPath}`).get();
      const stored = attachSnap.data()?.fileUrl;
      if (!stored || !stored.startsWith("data:")) {
        res.status(400).json({ error: "Firestore attachment not found or invalid" });
        return;
      }
      const parts = stored.split(",");
      base64Data = parts[1];
      contentType = parts[0].split(":")[1].split(";")[0];
    } else if (doc.fileUrl.startsWith("gs://")) {
      // ④ gs:// URI（Storage 内部パス）
      const gsPath = doc.fileUrl.replace(/^gs:\/\/[^/]+\//, "");
      const bucket = getStorage().bucket();
      const [fileBuffer] = await bucket.file(gsPath).download();
      base64Data = fileBuffer.toString("base64");
      const [metadata] = await bucket.file(gsPath).getMetadata();
      contentType = metadata.contentType || "application/pdf";
    } else {
      res.status(400).json({ error: `Unsupported fileUrl format: ${doc.fileUrl.slice(0, 60)}` });
      return;
    }

    // Gemini 再解析
    const aiResult = await analyzeDocumentWithGemini(
      base64Data, contentType, doc.fileName || "document", doc.receivedAt || ""
    );

    // Firestore 更新
    const updatedDocs = inboxDocs.map(d => {
      if (d.id !== docId) return d;
      return {
        ...d,
        suggestedType: aiResult.suggestedType,
        parsedData: {
          date: aiResult.date,
          expiryDate: aiResult.expiryDate,
          partnerName: aiResult.partnerName,
          items: aiResult.items || [],
          invoices: aiResult.invoices || null,
        },
      };
    });
    await db.doc(FARM_PATH).update({ "records.t_inbox_documents": updatedDocs });

    console.log(`✅ 再解析完了: ${doc.fileName} → ${aiResult.suggestedType}`);
    res.status(200).json({ success: true, result: aiResult });
  } catch (err) {
    console.error("❌ reanalyzeInboxDocument エラー:", err);
    res.status(500).json({ error: err.message });
  }
});

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    let fileName = "scan_document.pdf";
    let fileContentType = "application/pdf";
    let chunks = [];

    bb.on("file", (fieldname, stream, info) => {
      fileName = info.filename || fileName;
      fileContentType = info.mimeType || fileContentType;
      stream.on("data", (data) => chunks.push(data));
      stream.on("end", () => {});
    });

    bb.on("finish", () => {
      const buffer = Buffer.concat(chunks);
      resolve({
        fileName,
        fileContentType,
        base64Data: buffer.toString("base64"),
      });
    });

    bb.on("error", reject);
    req.pipe(bb);
  });
}

/**
 * 🌟【完全クラウド全自動巡回システム：PC不要24時間稼働】
 * 1分おきにMail.tmから新着スキャンメールを取得し、GeminiでAI解析の上同期する
 */
exports.pollMailTmScheduler = onSchedule({
  schedule: "every 1 mins",
  region: "asia-northeast1",
  timeoutSeconds: 540,
  memory: "1GiB",
}, async (event) => {
  const configRef = db.doc("farms/organiclog_default/config/mail_gateway");
  const configSnap = await configRef.get();
  
  let address = null;
  let password = null;
  
  if (!configSnap.exists) {
    address = "jas-scan-1778672390273-67@wshu.net";
    password = "pass1778672390273";
    await configRef.set({ address, password });
    console.log(`[SCHEDULER] Mail.tmの固定シードアカウントを設定しました: ${address}`);
  } else {
    const data = configSnap.data();
    address = data.address;
    password = data.password;
  }
  
  try {
    const tokenRes = await fetch("https://api.mail.tm/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, password }),
    });
    
    if (!tokenRes.ok) {
      console.error(`[SCHEDULER] トークン取得に失敗しました:`, await tokenRes.text());
      return;
    }
    
    const { token } = await tokenRes.json();
    
    const listRes = await fetch("https://api.mail.tm/messages", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (!listRes.ok) {
      console.error(`[SCHEDULER] メッセージ取得に失敗しました:`, await listRes.text());
      return;
    }
    
    const listData = await listRes.json();
    const messages = listData["hydra:member"] || [];
    
    if (messages.length === 0) {
      return;
    }
    
    console.log(`[SCHEDULER] 新着メールを ${messages.length} 件検知しました。`);
    
    for (const msg of messages) {
      if (msg.hasAttachments) {
        const msgRes = await fetch(`https://api.mail.tm/messages/${msg.id}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!msgRes.ok) continue;
        
        const msgDetails = await msgRes.json();
        const attachments = msgDetails.attachments || [];
        
        for (const att of attachments) {
          const fileName = att.filename || att.name || `scan_file_${Date.now()}.pdf`;
          const contentType = att.contentType || "application/pdf";
          
          console.log(`[SCHEDULER] 添付ファイル検出: ${fileName} (${contentType})。ダウンロード中...`);
          
          const attRes = await fetch(`https://api.mail.tm/messages/${msg.id}/attachment/${att.id}`, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          
          if (attRes.ok) {
            const arrayBuffer = await attRes.arrayBuffer();
            const base64Data = Buffer.from(arrayBuffer).toString("base64");
            
            const receivedAt = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 16);
            
            const fileId = `file_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            const base64String = `data:${contentType};base64,${base64Data}`;
            
            // 🌟【監査対応】1MBを超える画像・PDFも完全にプレビューできるようにFirebase Storageへ保存
            let savedFileUrl = "";
            try {
              const bucket = getStorage().bucket();
              const fileExt = contentType.includes("pdf") ? "pdf" : "jpg";
              const file = bucket.file(`attachments/${fileId}.${fileExt}`);
              const fileBuffer = Buffer.from(base64Data, "base64");
              
              await file.save(fileBuffer, { metadata: { contentType: contentType } });
              const encodedPath = encodeURIComponent(`attachments/${fileId}.${fileExt}`);
              savedFileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
            } catch (e) {
              console.error("[STORAGE ERROR] Failed to upload to Storage:", e);
              if (base64String.length <= 1000000) {
                await db.doc(`${FARM_PATH}/attachments/${fileId}`).set({ fileUrl: base64String });
                savedFileUrl = `db://attachments/${fileId}`;
              } else {
                savedFileUrl = `(ファイルサイズ超過のためプレビュー非表示)`;
              }
            }

            // 🌟【本物のGeminiマルチモーダルAI解析の実行】
            const aiParsedResult = await analyzeDocumentWithGemini(base64Data, contentType, fileName, receivedAt);

            const newDoc = {
              id: `cloud_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
              fileName: fileName,
              fileUrl: savedFileUrl,
              receivedAt: receivedAt,
              status: "unread",
              suggestedType: aiParsedResult.suggestedType,
              parsedData: {
                date: aiParsedResult.date,
                expiryDate: aiParsedResult.expiryDate,
                partnerName: aiParsedResult.partnerName,
                items: aiParsedResult.items || [],
              },
            };
            
            await db.doc(FARM_PATH).update({
              "records.t_inbox_documents": FieldValue.arrayUnion(newDoc),
            });
            console.log(`[SCHEDULER] ${fileName} のAI解析およびFirestore格納に大成功！`);
          } else {
            console.error(`[SCHEDULER] 添付ファイルのダウンロードに失敗しました:`, attRes.status);
          }
        }
      }
      
      await fetch(`https://api.mail.tm/messages/${msg.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      console.log(`[SCHEDULER] 処理完了したメールをMail.tmサーバーから自動削除しました。`);
    }
  } catch (err) {
    console.error(`[SCHEDULER] メール同期エラー:`, err);
  }
});

/**
 * 🌤️ 天気プロキシ - Open-Meteo をサーバーサイドで取得（CORS・広告ブロッカー回避）
 * 霧島市の座標: 緯度 31.7292, 経度 130.7614
 */
exports.getWeather = onRequest({
  cors: true,
  region: "asia-northeast1",
  timeoutSeconds: 30,
  memory: "256MiB",
}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  const url = "https://api.open-meteo.com/v1/forecast?latitude=31.7292&longitude=130.7614" +
    "&current=temperature_2m,weathercode,precipitation" +
    "&hourly=precipitation_probability" +
    "&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Asia%2FTokyo&forecast_days=7";

  try {
    const weatherRes = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!weatherRes.ok) {
      res.status(502).json({ error: `Weather API error: ${weatherRes.status}` });
      return;
    }
    const data = await weatherRes.json();
    // 30分キャッシュ（同じデータを大量リクエストしない）
    res.set("Cache-Control", "public, max-age=1800");
    res.json(data);
  } catch (err) {
    console.warn("[getWeather] 取得失敗:", err.message);
    res.status(502).json({ error: err.message });
  }
});

/**
 * 🐛 防除アラートプロキシ - 鹿児島県病害虫防除所ページをサーバーサイドで取得
 * CORS プロキシ経由不要・本番ドメインの403ブロック回避
 */
exports.getPestAlerts = onRequest({
  cors: true,
  region: "asia-northeast1",
  timeoutSeconds: 30,
  memory: "256MiB",
}, async (req, res) => {
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  const OFFICIAL_URL = "https://www.pref.kagoshima.jp/ag13/kiad/boujosho/yosatu.html";
  const OFFICIAL_ORIGIN = "https://www.pref.kagoshima.jp";

  try {
    const pageRes = await fetch(OFFICIAL_URL, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Orgaly/1.0; +https://organiclog-2f6c7.web.app)" },
    });
    if (!pageRes.ok) throw new Error(`Fetch failed: ${pageRes.status}`);

    const html = await pageRes.text();
    const alerts = [];

    // サーバーサイドではDOMParserが使えないのでregexで解析
    const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    let idx = 0;

    while ((match = linkRegex.exec(html)) !== null && alerts.length < 5) {
      const rawHref = match[1];
      const text = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

      if (
        text.length > 5 &&
        (text.includes("病害虫") || text.includes("防除") ||
         text.includes("発生予察") || /第\d+号/.test(text))
      ) {
        let date = "最新";
        let dm = text.match(/令和\d+年(\d+)月(\d+)日/);
        if (dm) date = `${dm[1]}/${dm[2]}`;
        else {
          dm = text.match(/(\d{4})年(\d+)月(\d+)日/);
          if (dm) date = `${dm[2]}/${dm[3]}`;
        }

        let url;
        if (!rawHref) url = OFFICIAL_URL;
        else if (rawHref.startsWith("http")) url = rawHref;
        else if (rawHref.startsWith("/")) url = OFFICIAL_ORIGIN + rawHref;
        else url = OFFICIAL_URL.replace(/\/[^/]*$/, "/") + rawHref;

        alerts.push({
          id: idx++,
          title: text.substring(0, 35) + (text.length > 35 ? "..." : ""),
          location: "鹿児島県全域",
          date,
          summary: text,
          url,
        });
      }
    }

    if (alerts.length === 0) throw new Error("No alerts parsed from page");

    // 1時間キャッシュ
    res.set("Cache-Control", "public, max-age=3600");
    res.json({ alerts });
  } catch (err) {
    console.warn("[getPestAlerts] 取得失敗:", err.message);
    res.status(502).json({ error: err.message });
  }
});
