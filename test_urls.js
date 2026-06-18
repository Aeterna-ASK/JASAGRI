async function test() {
  const token = '4b5343a3-8e4c-499a-ad87-996c9baac420';
  const reqId = 'e0018430-208b-43f6-b563-674e0ce60d88';
  const fileId = '6f52a7e7-365f-406f-82db-415afefed3d9';
  
  const urls = [
    `https://webhook.site/token/${token}/request/${reqId}/download/${fileId}`,
    `https://webhook.site/token/${token}/request/${reqId}/download/file`,
    `https://webhook.site/token/${token}/request/${reqId}/download/${fileId}`
  ];
  
  for (const url of urls) {
    try {
      const res = await fetch(url);
      console.log(url, res.status);
    } catch(e) {
      console.log(url, e.message);
    }
  }
}
test();
