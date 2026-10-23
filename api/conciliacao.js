// CONCILIAÇÃO BONEQUIM
// O app (conciliacao.html) chama esta função. Ela confere o PIN de quem está
// usando e repassa o pedido para o Apps Script da planilha
// "CONCILIAÇÃO BONEQUIM", junto com o segredo combinado.
//
// Variáveis na Vercel (Settings > Environment Variables):
//   CONCILIACAO_SCRIPT_URL  endereço do App da Web do Apps Script (termina em /exec)
//   CONCILIACAO_SEGREDO     o segredo que a função configurar() mostrou
//   CONCILIACAO_PINS        opcional, JSON com os PINs, ex. {"ana":"1357","taty":"1234","carol":"2468"}

const PINS_PADRAO = { ana: '1357', taty: '1234', carol: '2468' };
const NOMES = { ana: 'Ana', taty: 'Taty', carol: 'Carol' };
const ACOES = new Set(['entrar', 'listar', 'salvar', 'descartar', 'aprovar', 'corrigir', 'solicitar', 'cancelar']);

function pinsAtuais() {
  try { if (process.env.CONCILIACAO_PINS) return { ...PINS_PADRAO, ...JSON.parse(process.env.CONCILIACAO_PINS) }; } catch (e) { /* usa padrão */ }
  return PINS_PADRAO;
}

function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); } }
  return new Promise((ok) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e6) req.destroy(); });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { ok({}); } });
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });

  const b = await lerCorpo(req);
  const user = String(b.user || '');
  const pins = pinsAtuais();
  if (!pins[user] || String(b.pin || '') !== String(pins[user])) return res.status(401).json({ erro: 'PIN incorreto' });

  const action = String(b.action || '');
  if (!ACOES.has(action)) return res.status(400).json({ erro: 'Ação desconhecida' });
  if (action === 'entrar') return res.status(200).json({ ok: true, user, nome: NOMES[user] });

  const URL_SCRIPT = process.env.CONCILIACAO_SCRIPT_URL;
  const SEGREDO = process.env.CONCILIACAO_SEGREDO;
  if (!URL_SCRIPT || !SEGREDO) return res.status(500).json({ erro: 'A planilha ainda não foi ligada na Vercel' });

  // só repassa os campos que o Apps Script usa
  const corpo = { segredo: SEGREDO, user, action };
  ['id', 'codigo', 'cores', 'final', 'abertoEm', 'motivo', 'codigos', 'obs'].forEach((k) => { if (b[k] !== undefined) corpo[k] = b[k]; });

  try {
    const r = await fetch(URL_SCRIPT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      redirect: 'follow',
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) {
      // Não devolve o corpo bruto: páginas de erro do Apps Script têm pistas da conta
      console.error('conciliacao: Apps Script respondeu algo que não é JSON. HTTP', r.status);
      return res.status(502).json({ erro: 'A planilha não respondeu direito. Tente de novo.' });
    }
    if (data && data.erro) return res.status(data.erro === 'Acesso negado' ? 500 : 400).json({ erro: data.erro === 'Acesso negado' ? 'O segredo da planilha não confere com o da Vercel' : data.erro });
    return res.status(200).json({ ...data, user, nome: NOMES[user] });
  } catch (err) {
    console.error('conciliacao:', err);
    return res.status(502).json({ erro: 'Não consegui falar com a planilha. Confira a internet e tente de novo.' });
  }
}
