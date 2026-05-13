export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientUrl = req.method === 'POST' ? req.body?._url : req.query._url;
  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || clientUrl;
  if (!APPS_SCRIPT_URL) return res.status(500).json({ error: 'APPS_SCRIPT_URL not configured' });

  try {
    let response;
    if (req.method === 'POST') {
      const { _url, ...body } = req.body || {};
      response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'follow',
      });
    } else {
      const { _url, ...query } = req.query;
      const params = new URLSearchParams(query).toString();
      const url = params ? `${APPS_SCRIPT_URL}?${params}` : APPS_SCRIPT_URL;
      response = await fetch(url, { redirect: 'follow' });
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch (e) {
      console.error('Apps Script non-JSON:', text.slice(0, 500));
      return res.status(502).json({ error: 'Resposta inválida', raw: text.slice(0, 200) });
    }
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
