// Proxy entre o app (Vercel) e o Google Apps Script.
// A URL do Apps Script vem SOMENTE de process.env.APPS_SCRIPT_URL.
// Nunca aceite a URL de destino vinda do cliente: isso transformaria este
// endpoint num proxy aberto (SSRF), permitindo que qualquer pessoa use o
// domínio do app para acessar hosts internos ou de terceiros.

const ALLOWED_ACTIONS = new Set([
  'getCortes',
  'getListas',
  'getPedidos',
  'adicionarPeca',
  'adicionarPedido',
  'atualizarCampos',
]);

function setCors(req, res) {
  // O cliente é same-origin (chama /api/proxy), então CORS quase nunca é
  // necessário. Liberamos apenas a própria origem, para cobrir previews.
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host && origin === `https://${host}`) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  if (!APPS_SCRIPT_URL) {
    console.error('APPS_SCRIPT_URL não configurada nas variáveis de ambiente da Vercel');
    return res.status(500).json({ error: 'Backend não configurado' });
  }

  const action = req.method === 'POST' ? req.body?.action : req.query?.action;
  if (action && !ALLOWED_ACTIONS.has(action)) {
    return res.status(400).json({ error: 'Ação não permitida' });
  }

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
      const { _url, ...query } = req.query || {};
      const params = new URLSearchParams(query).toString();
      const url = params ? `${APPS_SCRIPT_URL}?${params}` : APPS_SCRIPT_URL;
      response = await fetch(url, { redirect: 'follow' });
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch (e) {
      // Não devolva o corpo bruto ao cliente: páginas de erro do Apps Script
      // contêm IDs de script e pistas da conta.
      console.error('Apps Script respondeu algo que não é JSON. Status HTTP:', response.status);
      return res.status(502).json({ error: 'Resposta inválida do servidor de dados' });
    }
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'Falha ao contatar o servidor de dados' });
  }
}
