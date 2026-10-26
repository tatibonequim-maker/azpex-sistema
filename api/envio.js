// ENVIO FÁBRICA > BONEQUIM
// Caminho de um envio:
//   RASCUNHO    Taty revisa a lista (colada por ela ou montada pelo Claude)
//   SEPARAR     Ana separa pelo celular e digita quanto conseguiu
//   TRANSFERIR  Dai faz a transferência no Miré
//   RECEBER     Gi confere o que chegou na Bonequim
//   DIVERGENCIA Gi achou diferença (ou veio item a mais): Dai edita a mesma transferência
//   CORRIGIDO   Dai corrigiu: Gi confirma no Miré que a correção entrou
//   CONCLUIDO
// O que a Ana marcou como "não tem" vai para o relatório de faltas da Taty.
//
// Banco: Redis da Vercel (Upstash). Basta conectar o banco ao projeto na
// Vercel (Storage > Upstash for Redis); as variáveis entram sozinhas.
// PINs: variável ENVIO_PINS (JSON) ou os padrões abaixo, iguais aos do app.

const PINS_PADRAO = { taty: '1234', ana: '1357', dai: '3456', gi: '4444' };
const NOMES = { taty: 'Taty', ana: 'Ana', dai: 'Dai', gi: 'Gi' };

const ETAPAS = ['RASCUNHO', 'SEPARAR', 'TRANSFERIR', 'RECEBER', 'DIVERGENCIA', 'CORRIGIDO', 'CONCLUIDO'];

// ── BANCO ──────────────────────────────────────────────────────────────
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Banco em memória só para teste local (ENVIO_DEV=1). Nunca em produção.
const mem = globalThis.__envioMem || (globalThis.__envioMem = { kv: new Map(), h: new Map(), z: new Map() });
function memCmd([c, ...a]) {
  c = String(c).toUpperCase();
  const H = (k) => { if (!mem.h.has(k)) mem.h.set(k, new Map()); return mem.h.get(k); };
  const Z = (k) => { if (!mem.z.has(k)) mem.z.set(k, new Map()); return mem.z.get(k); };
  switch (c) {
    case 'GET': return mem.kv.has(a[0]) ? mem.kv.get(a[0]) : null;
    case 'SET': mem.kv.set(a[0], a[1]); return 'OK';
    case 'MGET': return a.map((k) => (mem.kv.has(k) ? mem.kv.get(k) : null));
    case 'DEL': a.forEach((k) => { mem.kv.delete(k); mem.h.delete(k); mem.z.delete(k); }); return a.length;
    case 'HSET': { const h = H(a[0]); for (let i = 1; i < a.length; i += 2) h.set(a[i], String(a[i + 1])); return 1; }
    case 'HDEL': { const h = H(a[0]); a.slice(1).forEach((f) => h.delete(f)); return 1; }
    case 'HGETALL': { const h = H(a[0]); const out = []; h.forEach((v, k) => out.push(k, v)); return out; }
    case 'ZADD': Z(a[0]).set(a[2], Number(a[1])); return 1;
    case 'ZREM': Z(a[0]).delete(a[1]); return 1;
    case 'ZREVRANGE': {
      const arr = [...Z(a[0]).entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]);
      const ini = Number(a[1]); const fim = Number(a[2]);
      return arr.slice(ini, fim < 0 ? undefined : fim + 1);
    }
    default: throw new Error('comando não suportado no teste: ' + c);
  }
}

function bancoOk() { return !!(RURL && RTOK) || process.env.ENVIO_DEV === '1'; }

async function pipe(cmds) {
  if (!(RURL && RTOK)) return cmds.map(memCmd);
  const r = await fetch(RURL.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('banco respondeu ' + r.status);
  const j = await r.json();
  return j.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
}
async function cmd(c) { return (await pipe([c]))[0]; }

const kDoc = (id) => 'envio:' + id;
const kSep = (id) => 'envio:' + id + ':sep';
const kRec = (id) => 'envio:' + id + ':rec';
const kIdx = 'envios';

function hashObj(arr) { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = Number(arr[i + 1]); return o; }

async function lerDoc(id) {
  const s = await cmd(['GET', kDoc(id)]);
  if (!s) { const e = new Error('Envio não encontrado'); e.code = 404; throw e; }
  return typeof s === 'string' ? JSON.parse(s) : s;
}
async function gravarDoc(d) {
  d.atualizado = Date.now();
  await pipe([['SET', kDoc(d.id), JSON.stringify(d)], ['ZADD', kIdx, String(d.criado), d.id]]);
}

// ── REGRAS ─────────────────────────────────────────────────────────────
function pinsAtuais() {
  try { if (process.env.ENVIO_PINS) return { ...PINS_PADRAO, ...JSON.parse(process.env.ENVIO_PINS) }; } catch (e) { /* usa padrão */ }
  return PINS_PADRAO;
}
function falha(msg, code = 400) { const e = new Error(msg); e.code = code; return e; }
function exige(user, ...quem) { if (!quem.includes(user)) throw falha('Esta etapa não é sua', 403); }
function naEtapa(d, ...st) { if (!st.includes(d.status)) throw falha('Este envio já está em outra etapa. Atualize a tela.', 409); }
function qtd(v) { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 9999) throw falha('Quantidade inválida'); return n; }
function txt(v, max = 120) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }

function limparItens(lista) {
  if (!Array.isArray(lista) || !lista.length) throw falha('A lista está vazia');
  if (lista.length > 1500) throw falha('Lista grande demais');
  return lista.map((it, i) => {
    const cod = txt(it.cod, 20).toUpperCase();
    const cor = txt(it.cor, 40).toUpperCase();
    const tam = txt(it.tam, 8).toUpperCase();
    if (!cod || !cor || !tam) throw falha('Linha ' + (i + 1) + ' sem código, cor ou tamanho');
    return { id: 'i' + (i + 1), cod, desc: txt(it.desc, 80).toUpperCase(), cor, tam, ped: qtd(it.ped) };
  });
}

function marcar(d, user, status, nota) {
  d.status = status;
  d.hist = d.hist || [];
  d.hist.push({ st: status, por: user, em: Date.now(), nota: nota ? txt(nota, 200) : undefined });
}

function resumo(d) {
  const r = { id: d.id, titulo: d.titulo, status: d.status, criado: d.criado, atualizado: d.atualizado,
    linhas: d.itens.length, codigos: new Set(d.itens.map((i) => i.cod)).size,
    ped: 0, sep: null, rec: null, faltas: 0, div: 0, nota: d.notaTransf || '', transf: d.notaTransf || '', hist: d.hist || [] };
  r.ped = d.itens.reduce((s, i) => s + i.ped, 0);
  if (d.itens.some((i) => i.sep != null)) {
    r.sep = d.itens.reduce((s, i) => s + (i.sep || 0), 0);
    r.faltas = d.itens.filter((i) => (i.sep || 0) < i.ped).length;
  }
  if (d.itens.some((i) => i.rec != null)) {
    r.rec = d.itens.reduce((s, i) => s + (i.rec || 0), 0);
    r.div = d.itens.filter((i) => i.rec != null && i.rec !== (i.sep || 0)).length;
  }
  return r;
}

// Junta o que está sendo digitado agora (hash) com o que já foi fechado (doc)
async function completo(id) {
  const [s, sep, rec] = await pipe([['GET', kDoc(id)], ['HGETALL', kSep(id)], ['HGETALL', kRec(id)]]);
  if (!s) throw falha('Envio não encontrado', 404);
  const d = typeof s === 'string' ? JSON.parse(s) : s;
  const hs = hashObj(sep); const hr = hashObj(rec);
  if (d.status === 'SEPARAR') d.itens.forEach((i) => { i.sep = i.id in hs ? hs[i.id] : null; });
  if (d.status === 'RECEBER') d.itens.forEach((i) => { i.rec = i.id in hr ? hr[i.id] : null; });
  return d;
}

// ── AÇÕES ──────────────────────────────────────────────────────────────
const ACOES = {
  async entrar() { return { ok: true }; },

  async listar(user, b) {
    // com um envio por código são dezenas por dia: busca bastante pra nada pendente sumir da tela
    const ids = await cmd(['ZREVRANGE', kIdx, '0', String(Math.min(Number(b.max) || 400, 1000) - 1)]);
    if (!ids || !ids.length) return { envios: [] };
    const docs = await cmd(['MGET', ...ids.map(kDoc)]);
    const envios = docs.filter(Boolean).map((s) => resumo(typeof s === 'string' ? JSON.parse(s) : s));
    return { envios };
  },

  async ver(user, b) { const d = await completo(txt(b.id, 40)); return { envio: d, resumo: resumo(d) }; },

  async criar(user, b) {
    exige(user, 'taty');
    const agora = Date.now();
    // sufixo aleatório: quando a lista vira um envio por código, vários são criados no mesmo instante
    const d = { id: 'e' + agora.toString(36) + Math.random().toString(36).slice(2, 6), titulo: txt(b.titulo, 80) || 'Envio', criado: agora,
      origem: txt(b.origem, 20) || 'manual', itens: limparItens(b.itens), hist: [] };
    marcar(d, user, b.aprovar ? 'SEPARAR' : 'RASCUNHO');
    await gravarDoc(d);
    return { envio: d, resumo: resumo(d) };
  },

  async editar(user, b) {
    exige(user, 'taty');
    const d = await lerDoc(txt(b.id, 40)); naEtapa(d, 'RASCUNHO');
    if (b.titulo != null) d.titulo = txt(b.titulo, 80) || d.titulo;
    if (b.itens) d.itens = limparItens(b.itens);
    await gravarDoc(d);
    return { envio: d, resumo: resumo(d) };
  },

  async aprovar(user, b) {
    exige(user, 'taty');
    const d = await lerDoc(txt(b.id, 40)); naEtapa(d, 'RASCUNHO');
    marcar(d, user, 'SEPARAR'); await gravarDoc(d);
    return { resumo: resumo(d) };
  },

  async excluir(user, b) {
    exige(user, 'taty');
    const id = txt(b.id, 40); await lerDoc(id);
    await pipe([['DEL', kDoc(id), kSep(id), kRec(id)], ['ZREM', kIdx, id]]);
    return { ok: true };
  },

  // Volta uma etapa (para consertar um clique errado). Só a Taty.
  async voltar(user, b) {
    exige(user, 'taty');
    const d = await completo(txt(b.id, 40));
    const para = { SEPARAR: 'RASCUNHO', TRANSFERIR: 'SEPARAR', RECEBER: 'TRANSFERIR', DIVERGENCIA: 'RECEBER', CORRIGIDO: 'DIVERGENCIA', CONCLUIDO: 'RECEBER' }[d.status];
    if (!para) throw falha('Não dá para voltar desta etapa');
    const cmds = [];
    if (para === 'SEPARAR') { // devolve o que a Ana tinha digitado para a tela dela
      const hs = []; d.itens.forEach((i) => { if (i.sep != null) hs.push(i.id, String(i.sep)); });
      if (hs.length) cmds.push(['HSET', kSep(d.id), ...hs]);
    }
    if (para === 'RECEBER') {
      const hr = []; d.itens.forEach((i) => { if (i.rec != null) hr.push(i.id, String(i.rec)); });
      if (hr.length) cmds.push(['HSET', kRec(d.id), ...hr]);
    }
    if (para === 'RASCUNHO') d.itens.forEach((i) => { delete i.sep; });
    if (para === 'TRANSFERIR') d.itens.forEach((i) => { delete i.rec; });
    marcar(d, user, para, 'voltou etapa');
    if (cmds.length) await pipe(cmds);
    await gravarDoc(d);
    return { resumo: resumo(d) };
  },

  // Ana: grava uma linha por vez (não atropela se duas pessoas separarem juntas)
  async separar(user, b) {
    exige(user, 'ana', 'taty');
    const d = await lerDoc(txt(b.id, 40)); naEtapa(d, 'SEPARAR');
    const it = d.itens.find((i) => i.id === b.item); if (!it) throw falha('Linha não encontrada');
    if (b.q === null || b.q === '') await cmd(['HDEL', kSep(d.id), it.id]);
    else await cmd(['HSET', kSep(d.id), it.id, String(qtd(b.q))]);
    return { ok: true };
  },

  async fimSeparacao(user, b) {
    exige(user, 'ana', 'taty');
    const d = await completo(txt(b.id, 40)); naEtapa(d, 'SEPARAR');
    d.itens.forEach((i) => { i.sep = i.sep == null ? 0 : i.sep; });
    const nada = d.itens.every((i) => i.sep === 0);
    marcar(d, user, nada ? 'CONCLUIDO' : 'TRANSFERIR', nada ? 'nada separado' : txt(b.nota, 200));
    await gravarDoc(d); await cmd(['DEL', kSep(d.id)]);
    return { resumo: resumo(d) };
  },

  async transferido(user, b) {
    exige(user, 'dai', 'taty');
    const d = await lerDoc(txt(b.id, 40)); naEtapa(d, 'TRANSFERIR');
    const n = txt(b.nota, 30);
    if (!n) throw falha('Digite o número da transferência do Miré');
    d.notaTransf = n;
    marcar(d, user, 'RECEBER', 'transferência nº ' + n); await gravarDoc(d);
    return { resumo: resumo(d) };
  },

  async receber(user, b) {
    exige(user, 'gi', 'taty');
    const d = await lerDoc(txt(b.id, 40)); naEtapa(d, 'RECEBER');
    const it = d.itens.find((i) => i.id === b.item); if (!it) throw falha('Linha não encontrada');
    if (b.q === null || b.q === '') await cmd(['HDEL', kRec(d.id), it.id]);
    else await cmd(['HSET', kRec(d.id), it.id, String(qtd(b.q))]);
    return { ok: true };
  },

  // Gi: veio algo que não estava na transferência (código, cor ou tamanho a mais)
  async extra(user, b) {
    exige(user, 'gi', 'taty');
    const d = await lerDoc(txt(b.id, 40)); naEtapa(d, 'RECEBER');
    const cod = txt(b.cod, 20).toUpperCase(), cor = txt(b.cor, 40).toUpperCase(), tam = txt(b.tam, 8).toUpperCase();
    if (!cod || !cor || !tam) throw falha('Preencha código, cor e tamanho');
    const q = qtd(b.q); if (!q) throw falha('Digite quantas peças chegaram');
    let it = d.itens.find((i) => i.cod === cod && i.cor === cor && i.tam === tam);
    if (!it) {
      const irmao = d.itens.find((i) => i.cod === cod && i.desc);
      let n = d.itens.length + 1; while (d.itens.some((i) => i.id === 'x' + n)) n++;
      it = { id: 'x' + n, cod, desc: irmao ? irmao.desc : '', cor, tam, ped: 0, sep: 0, extra: true };
      d.itens.push(it); await gravarDoc(d);
    }
    await cmd(['HSET', kRec(d.id), it.id, String(q)]);
    return { ok: true, item: it.id };
  },

  async extraRem(user, b) {
    exige(user, 'gi', 'taty');
    const d = await lerDoc(txt(b.id, 40)); naEtapa(d, 'RECEBER');
    const ix = d.itens.findIndex((i) => i.id === b.item && i.extra); if (ix < 0) throw falha('Linha não encontrada');
    d.itens.splice(ix, 1); await gravarDoc(d); await cmd(['HDEL', kRec(d.id), String(b.item)]);
    return { ok: true };
  },

  async fimRecebimento(user, b) {
    exige(user, 'gi', 'taty');
    const d = await completo(txt(b.id, 40)); naEtapa(d, 'RECEBER');
    const faltam = d.itens.filter((i) => (i.sep || 0) > 0 && i.rec == null).length;
    if (faltam) throw falha('Ainda tem ' + faltam + ' linha(s) sem conferir');
    d.itens.forEach((i) => { if (i.rec == null) i.rec = 0; });
    const div = d.itens.some((i) => i.rec !== (i.sep || 0));
    marcar(d, user, div ? 'DIVERGENCIA' : 'CONCLUIDO', txt(b.nota, 200));
    await gravarDoc(d); await cmd(['DEL', kRec(d.id)]);
    return { resumo: resumo(d) };
  },

  async corrigido(user, b) {
    exige(user, 'dai', 'taty');
    const d = await lerDoc(txt(b.id, 40)); naEtapa(d, 'DIVERGENCIA');
    d.notaCorrecao = txt(b.nota, 200); delete d.notaGi;
    marcar(d, user, 'CORRIGIDO', d.notaCorrecao || 'transferência corrigida'); await gravarDoc(d);
    return { resumo: resumo(d) };
  },

  // Gi confere no Miré se a correção da Dai entrou. Se não, volta pra Dai.
  async confirmaCorrecao(user, b) {
    exige(user, 'gi', 'taty');
    const d = await lerDoc(txt(b.id, 40)); naEtapa(d, 'CORRIGIDO');
    if (b.ok) marcar(d, user, 'CONCLUIDO', 'correção conferida');
    else {
      const n = txt(b.nota, 200); if (!n) throw falha('Escreva o que ainda está errado');
      marcar(d, user, 'DIVERGENCIA', n); d.notaGi = n;
    }
    await gravarDoc(d);
    return { resumo: resumo(d) };
  },

  // Relatório da Taty: tudo que a Ana não achou, mais as divergências da Gi
  async relatorio(user) {
    exige(user, 'taty');
    const ids = await cmd(['ZREVRANGE', kIdx, '0', '1999']);
    const docs = ids && ids.length ? await cmd(['MGET', ...ids.map(kDoc)]) : [];
    const faltas = []; const divs = [];
    docs.filter(Boolean).map((s) => (typeof s === 'string' ? JSON.parse(s) : s)).forEach((d) => {
      d.itens.forEach((i) => {
        if (i.sep != null && i.sep < i.ped) faltas.push({ envio: d.id, titulo: d.titulo, criado: d.criado, item: i.id,
          cod: i.cod, desc: i.desc, cor: i.cor, tam: i.tam, ped: i.ped, sep: i.sep, ok: !!i.fok });
        if (i.rec != null && i.rec !== (i.sep || 0)) divs.push({ envio: d.id, titulo: d.titulo, criado: d.criado,
          cod: i.cod, desc: i.desc, cor: i.cor, tam: i.tam, sep: i.sep || 0, rec: i.rec, status: d.status, extra: !!i.extra, transf: d.notaTransf || '' });
      });
    });
    return { faltas, divs };
  },

  async verificado(user, b) {
    exige(user, 'taty');
    const d = await lerDoc(txt(b.id, 40));
    const it = d.itens.find((i) => i.id === b.item); if (!it) throw falha('Linha não encontrada');
    it.fok = !!b.ok; await gravarDoc(d);
    return { ok: true };
  },
};

function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); } }
  return new Promise((ok) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > 2e6) req.destroy(); });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { ok({}); } });
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!bancoOk()) return res.status(500).json({ error: 'O banco do envio ainda não foi conectado na Vercel' });

  const b = await lerCorpo(req);
  const user = String(b.user || '');
  const pins = pinsAtuais();
  if (!pins[user] || String(b.pin || '') !== pins[user]) return res.status(401).json({ error: 'PIN incorreto' });

  const fn = ACOES[b.action];
  if (!fn) return res.status(400).json({ error: 'Ação desconhecida' });
  try {
    const out = await fn(user, b);
    return res.status(200).json({ ...out, user, nome: NOMES[user] });
  } catch (e) {
    if (!e.code) console.error('envio:', e);
    return res.status(e.code && e.code < 600 ? e.code : 500).json({ error: e.code ? e.message : 'Erro no servidor' });
  }
}

export { ETAPAS };
