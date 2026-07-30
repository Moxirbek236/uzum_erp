const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: 'postgresql://postgres:sjtmsimram10@localhost:5432/uzum_seller_erp' });
  await client.connect();
  const r = await client.query('SELECT "uzumToken" FROM "User" WHERE "uzumToken" IS NOT NULL LIMIT 1');
  const token = r.rows[0].uzumToken;
  await client.end();

  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (token.includes('=')) headers['Cookie'] = token;
  else headers['Authorization'] = 'Bearer ' + token;

  const productId = 2537070;
  const shopId = 88415;
  const urls = [
    `https://api-seller.uzum.uz/api/seller/product/sku?shopId=${shopId}&productId=${productId}`,
    `https://api-seller.uzum.uz/api/seller/product/sku?shopId=${shopId}`,
    `https://api-seller.uzum.uz/api/seller/product/sku/${productId}`,
  ];

  for (const url of urls) {
    const res = await fetch(url, { headers });
    const text = await res.text();
    console.log(`${url.replace('https://api-seller.uzum.uz', '')} => ${res.status}: ${text.slice(0, 300)}`);
  }

  // Let's also try POST on /api/seller/product/sku
  const postRes = await fetch(`https://api-seller.uzum.uz/api/seller/product/sku`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ productId, shopId })
  });
  console.log(`POST /api/seller/product/sku => ${postRes.status}: ${(await postRes.text()).slice(0, 300)}`);
}

main().catch(console.error);
