export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  if (!APPS_SCRIPT_URL) return res.status(500).json({ error: 'APPS_SCRIPT_URL not configured' });

  try {
    let response;
    if (req.method === 'POST') {
      response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        redirect: 'follow',
      });
    } else {
      const params = new URLSearchParams(req.query).toString();
      const url = params ? `${APPS_SCRIPT_URL}?${params}` : APPS_SCRIPT_URL;
      response = await fetch(url, { redirect: 'follow' });
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch (e) {
      console.error('Apps Script non-JSON:', text.slice(0, 500));
      return res.status(502).json({ error: 'Apps Script retornou resposta inválida', raw: text.slice(0, 200) });
    }
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
