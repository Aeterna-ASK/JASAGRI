async function run() {
  const initRes = await fetch('https://webhook.site/token', { method: 'POST' });
  const data = await initRes.json();
  const token = data.uuid;
  console.log('Token:', token);

  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  let body = '';
  body += '--' + boundary + '\r\n';
  body += 'Content-Disposition: form-data; name="file"; filename="test_cert.pdf"\r\n';
  body += 'Content-Type: application/pdf\r\n\r\n';
  body += 'Dummy data\r\n';
  body += '--' + boundary + '--\r\n';

  await fetch(`https://webhook.site/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
    body: body
  });

  const listRes = await fetch(`https://webhook.site/token/${token}/requests`);
  const list = await listRes.json();
  const reqObj = list.data[0];
  const reqId = reqObj.uuid;
  const fileKey = Object.keys(reqObj.files)[0];
  const fileObj = reqObj.files[fileKey];
  const fileId = fileObj.id;
  
  console.log('reqId:', reqId, 'fileKey:', fileKey, 'fileId:', fileId);

  const urls = [
    `https://webhook.site/token/${token}/request/${reqId}/download/${fileKey}`,
    `https://webhook.site/token/${token}/request/${reqId}/download/${fileId}`,
    `https://webhook.site/token/${token}/request/${reqId}/file/${fileId}/download`,
    `https://webhook.site/token/${token}/request/${reqId}/file/${fileKey}/download`
  ];
  
  for (const url of urls) {
    const res = await fetch(url);
    console.log(url, res.status);
    if (res.status === 200) {
      console.log('WINNER:', url);
    }
  }
}
run();
