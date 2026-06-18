async function run() {
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  let body = '';
  body += '--' + boundary + '\r\n';
  body += 'Content-Disposition: form-data; name="from"\r\n\r\n';
  body += 'test@example.com\r\n';
  body += '--' + boundary + '\r\n';
  body += 'Content-Disposition: form-data; name="file"; filename="test_cert.pdf"\r\n';
  body += 'Content-Type: application/pdf\r\n\r\n';
  body += 'Dummy PDF Data Base64/Binary...\r\n';
  body += '--' + boundary + '--\r\n';

  const res = await fetch('https://webhook.site/6bb7f918-dd44-4d24-8af7-0046155c10f8', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=' + boundary
    },
    body: body
  });
  console.log('Status:', res.status);
}
run();
