async function main() {
  const urls = [
    'https://api-seller.uzum.uz/api/seller-openapi/v3/api-docs',
    'https://api-seller.uzum.uz/v3/api-docs',
    'https://api-seller.uzum.uz/api-docs',
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      console.log(`${url} => ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`Paths count: ${Object.keys(data.paths || {}).length}`);
        console.log('Sample paths:', Object.keys(data.paths || {}).slice(0, 10));
        // write to a temporary file
        require('fs').writeFileSync('swagger.json', JSON.stringify(data, null, 2));
        console.log('Saved to swagger.json');
        break;
      }
    } catch (e) {
      console.log(`${url} failed: ${e.message}`);
    }
  }
}

main().catch(console.error);
