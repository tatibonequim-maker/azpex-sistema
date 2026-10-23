// CONCILIAÇÃO BONEQUIM · Apps Script da planilha
//
// Este código fica DENTRO da planilha "CONCILIAÇÃO BONEQUIM"
// (Extensões > Apps Script). Quem conversa com ele é a função
// /api/conciliacao da Vercel, que confere o PIN de cada pessoa e manda
// junto um SEGREDO. Sem o segredo, o script não responde nada.
//
// Abas:
//   CONTAGENS  uma linha por contagem (código, status, datas, quem fez)
//   ITENS      uma linha por cor da contagem, com PP P M G GG e total
//
// Caminho de uma contagem:
//   SOLICITADA            Taty ou Carol pediram pra contar o código
//   PENDENTE              Ana salvou e ainda está contando
//   AGUARDANDO APROVACAO  Ana finalizou
//   CORRIGIR              Taty ou Carol pediram correção (volta pra Ana)
//   CONCLUIDA             aprovada; CONCILIADO_EM guarda a data
//
// Instalação: rode a função configurar() uma vez (ela cria as abas e mostra
// o SEGREDO no registro de execução) e depois Implantar > Nova implantação >
// App da Web, executando como você e com acesso para "Qualquer pessoa".

const ABA_C = 'CONTAGENS';
const ABA_I = 'ITENS';
const COLS_C = ['ID', 'CODIGO', 'STATUS', 'TOTAL_PECAS', 'SOLICITADO_POR', 'SOLICITADO_EM', 'OBS_SOLICITACAO',
  'INICIADO_POR', 'INICIADO_EM', 'ATUALIZADO_EM', 'FINALIZADO_POR', 'FINALIZADO_EM', 'APROVADO_POR', 'CONCILIADO_EM',
  'CORRECAO_POR', 'CORRECAO_EM', 'CORRECAO_MOTIVO', 'HISTORICO'];
const COLS_I = ['ID_CONTAGEM', 'CODIGO', 'COR', 'PP', 'P', 'M', 'G', 'GG', 'TOTAL', 'STATUS', 'CONCILIADO_EM'];
const TAM = ['PP', 'P', 'M', 'G', 'GG'];
const NOMES = { ana: 'Ana', taty: 'Taty', carol: 'Carol' };
const APROVA = ['taty', 'carol'];
const DATAS_C = ['SOLICITADO_EM', 'INICIADO_EM', 'ATUALIZADO_EM', 'FINALIZADO_EM', 'CONCILIADO_EM', 'CORRECAO_EM'];
const ST = { SOL: 'SOLICITADA', PEN: 'PENDENTE', COR: 'CORRIGIR', APR: 'AGUARDANDO APROVACAO', OK: 'CONCLUIDA' };
const MAX_CONCLUIDAS = 400; // quantas concluídas o app recebe (as mais recentes)

// ── INSTALAÇÃO ──────────────────────────────────────────────────────────
function configurar() {
  const ss = SpreadsheetApp.getActive();
  prepararAba(ss, ABA_C, COLS_C, ['CODIGO', 'ID', 'OBS_SOLICITACAO', 'CORRECAO_MOTIVO', 'HISTORICO'], DATAS_C);
  prepararAba(ss, ABA_I, COLS_I, ['CODIGO', 'ID_CONTAGEM', 'COR'], ['CONCILIADO_EM']);
  const props = PropertiesService.getScriptProperties();
  let seg = props.getProperty('SEGREDO');
  if (!seg) { seg = Utilities.getUuid().replace(/-/g, ''); props.setProperty('SEGREDO', seg); }
  Logger.log('SEGREDO (copie para a Vercel em CONCILIACAO_SEGREDO): ' + seg);
  return seg;
}

function prepararAba(ss, nome, cols, colsTexto, colsData) {
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    const primeira = ss.getSheets()[0];
    // a planilha nova vem com uma aba só (sem nada ou só com o cabeçalho): aproveita
    if (nome === ABA_C && primeira && primeira.getLastRow() <= 1 && !ss.getSheetByName(ABA_C)) { sh = primeira; sh.setName(nome); }
    else sh = ss.insertSheet(nome);
  }
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
  sh.setFrozenRows(1);
  colsTexto.forEach(function (c) { sh.getRange(1, cols.indexOf(c) + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
  colsData.forEach(function (c) { sh.getRange(2, cols.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm'); });
  return sh;
}

// ── ENTRADA ─────────────────────────────────────────────────────────────
function doGet() { return saida({ ok: true, app: 'conciliacao-bonequim' }); }

function doPost(e) {
  let b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return saida({ erro: 'Pedido inválido' }); }
  const seg = PropertiesService.getScriptProperties().getProperty('SEGREDO');
  if (!seg || b.segredo !== seg) return saida({ erro: 'Acesso negado' });
  const user = String(b.user || '');
  if (!NOMES[user]) return saida({ erro: 'Pessoa desconhecida' });
  const fn = ACOES[b.action];
  if (!fn) return saida({ erro: 'Ação desconhecida' });
  if (b.action === 'listar') { try { return saida(fn(user, b)); } catch (err) { return saida({ erro: msg(err) }); } }
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return saida({ erro: 'A planilha está ocupada. Tente de novo em alguns segundos.' }); }
  try { return saida(fn(user, b)); }
  catch (err) { return saida({ erro: msg(err) }); }
  finally { lock.releaseLock(); }
}

function saida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function msg(err) { return err && err.usuario ? err.message : ('Erro na planilha: ' + (err && err.message ? err.message : err)); }
function falha(m) { const e = new Error(m); e.usuario = true; return e; }

// ── LEITURA E ESCRITA ───────────────────────────────────────────────────
function abas() {
  const ss = SpreadsheetApp.getActive();
  const c = ss.getSheetByName(ABA_C), i = ss.getSheetByName(ABA_I);
  if (!c || !i) throw falha('A planilha ainda não foi configurada. Rode configurar() no Apps Script.');
  return { c: c, i: i };
}
function linhas(sh, ncols) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, ncols).getValues() : [];
}
function iso(v) { return v instanceof Date ? v.toISOString() : (v ? String(v) : ''); }
function quando(v) { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? '' : d; }
function txt(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 120); }
function codigoLimpo(v) { return String(v == null ? '' : v).replace(/\s/g, '').toUpperCase().slice(0, 20); }
function qtd(v) { const n = Math.round(Number(v)); if (!isFinite(n) || n < 0 || n > 9999) throw falha('Quantidade inválida'); return n; }

function paraObj(r) {
  const o = {}; COLS_C.forEach(function (k, j) { o[k] = r[j]; });
  let hist = []; try { hist = o.HISTORICO ? JSON.parse(o.HISTORICO) : []; } catch (err) { hist = []; }
  return {
    id: String(o.ID), codigo: String(o.CODIGO), status: String(o.STATUS), total: Number(o.TOTAL_PECAS) || 0,
    solicitadoPor: o.SOLICITADO_POR || '', solicitadoEm: iso(o.SOLICITADO_EM), obsSolicitacao: o.OBS_SOLICITACAO || '',
    iniciadoPor: o.INICIADO_POR || '', iniciadoEm: iso(o.INICIADO_EM), atualizadoEm: iso(o.ATUALIZADO_EM),
    finalizadoPor: o.FINALIZADO_POR || '', finalizadoEm: iso(o.FINALIZADO_EM),
    aprovadoPor: o.APROVADO_POR || '', conciliadoEm: iso(o.CONCILIADO_EM),
    correcao: o.CORRECAO_EM ? { por: o.CORRECAO_POR || '', em: iso(o.CORRECAO_EM), motivo: o.CORRECAO_MOTIVO || '' } : null,
    historico: hist, cores: []
  };
}
function paraLinha(d) {
  const o = {
    ID: d.id, CODIGO: d.codigo, STATUS: d.status, TOTAL_PECAS: d.total || 0,
    SOLICITADO_POR: d.solicitadoPor || '', SOLICITADO_EM: quando(d.solicitadoEm), OBS_SOLICITACAO: d.obsSolicitacao || '',
    INICIADO_POR: d.iniciadoPor || '', INICIADO_EM: quando(d.iniciadoEm), ATUALIZADO_EM: quando(d.atualizadoEm),
    FINALIZADO_POR: d.finalizadoPor || '', FINALIZADO_EM: quando(d.finalizadoEm),
    APROVADO_POR: d.aprovadoPor || '', CONCILIADO_EM: quando(d.conciliadoEm),
    CORRECAO_POR: d.correcao ? d.correcao.por : '', CORRECAO_EM: d.correcao ? quando(d.correcao.em) : '',
    CORRECAO_MOTIVO: d.correcao ? d.correcao.motivo : '',
    HISTORICO: JSON.stringify((d.historico || []).slice(-40))
  };
  return COLS_C.map(function (k) { return o[k]; });
}

function lerTudo() {
  const sh = abas();
  const lc = linhas(sh.c, COLS_C.length);
  const docs = [], porId = {};
  lc.forEach(function (r, j) {
    if (!r[0]) return;
    const d = paraObj(r); d._row = j + 2; docs.push(d); porId[d.id] = d;
  });
  linhas(sh.i, COLS_I.length).forEach(function (r) {
    const d = porId[String(r[0])]; if (!d) return;
    const q = {}; TAM.forEach(function (t, k) { const v = r[3 + k]; q[t] = v === '' || v == null ? '' : Number(v); });
    d.cores.push({ cor: String(r[2]), q: q });
  });
  return { sh: sh, docs: docs, porId: porId };
}

function gravar(sh, d) {
  const linha = paraLinha(d);
  if (!d._row) d._row = sh.c.getLastRow() + 1;
  sh.c.getRange(d._row, 1, 1, 2).setNumberFormat('@'); // ID e CODIGO como texto: o zero da frente não some
  sh.c.getRange(d._row, 1, 1, COLS_C.length).setValues([linha]);
}

// troca as linhas da aba ITENS desta contagem
function gravarItens(sh, d) {
  apagarItens(sh, d.id);
  if (!d.cores.length) return;
  const rows = d.cores.map(function (c) {
    return [d.id, d.codigo, c.cor].concat(TAM.map(function (t) { return c.q[t] === '' ? '' : c.q[t]; }))
      .concat([somaCor(c), d.status, quando(d.conciliadoEm)]);
  });
  const r0 = sh.i.getLastRow() + 1;
  sh.i.getRange(r0, 1, rows.length, 3).setNumberFormat('@');
  sh.i.getRange(r0, 1, rows.length, COLS_I.length).setValues(rows);
}
function apagarItens(sh, id) {
  const n = sh.i.getLastRow() - 1; if (n <= 0) return;
  const ids = sh.i.getRange(2, 1, n, 1).getValues();
  const runs = []; let ini = -1;
  for (let k = 0; k <= ids.length; k++) {
    const igual = k < ids.length && String(ids[k][0]) === id;
    if (igual && ini < 0) ini = k;
    if (!igual && ini >= 0) { runs.push([ini + 2, k - ini]); ini = -1; }
  }
  for (let k = runs.length - 1; k >= 0; k--) sh.i.deleteRows(runs[k][0], runs[k][1]);
}
function apagarContagem(sh, d) { apagarItens(sh, d.id); sh.c.deleteRows(d._row, 1); }

function somaCor(c) { return TAM.reduce(function (a, t) { return a + (Number(c.q[t]) || 0); }, 0); }
function hist(d, user, acao) { d.historico = (d.historico || []).slice(-39); d.historico.push({ em: new Date().toISOString(), por: NOMES[user], acao: acao }); }
function exigeAprova(user) { if (APROVA.indexOf(user) < 0) throw falha('Só a Taty e a Carol podem fazer isso'); }
function limpo(d) { const o = {}; Object.keys(d).forEach(function (k) { if (k !== '_row') o[k] = d[k]; }); return o; }

function limparCores(lista, final) {
  if (!Array.isArray(lista)) lista = [];
  if (lista.length > 200) throw falha('Cores demais numa contagem');
  const vistas = {}, out = [];
  lista.forEach(function (c, k) {
    const cor = txt(c && c.cor, 40).toUpperCase();
    const q = {}; let tem = false;
    TAM.forEach(function (t) {
      const raw = c && c.q ? c.q[t] : '';
      if (raw === '' || raw == null) q[t] = final ? 0 : '';
      else { q[t] = qtd(raw); tem = true; }
    });
    if (!cor && !tem) return;
    if (!cor) throw falha('Falta o nome da cor na linha ' + (k + 1) + '.');
    if (vistas[cor]) throw falha('A cor ' + cor + ' aparece duas vezes. Junte numa linha só.');
    vistas[cor] = 1; out.push({ cor: cor, q: q });
  });
  if (final && !out.length) throw falha('Adicione pelo menos uma cor antes de finalizar.');
  return out;
}

// ── AÇÕES ───────────────────────────────────────────────────────────────
const ACOES = {
  listar: function () {
    const t = lerTudo();
    const abertas = t.docs.filter(function (d) { return d.status !== ST.OK; });
    const concl = t.docs.filter(function (d) { return d.status === ST.OK; })
      .sort(function (a, b) { return a.conciliadoEm < b.conciliadoEm ? 1 : -1; }).slice(0, MAX_CONCLUIDAS);
    return { ok: true, contagens: abertas.concat(concl).map(limpo), agora: new Date().toISOString() };
  },

  // Ana (ou qualquer uma) salva ou finaliza uma contagem
  salvar: function (user, b) {
    const t = lerTudo();
    const final = !!b.final;
    const codigo = codigoLimpo(b.codigo);
    if (!codigo) throw falha('Digite o código.');
    const cores = limparCores(b.cores, final);
    let d = b.id ? t.porId[String(b.id)] : null;
    if (b.id && !d) throw falha('Essa contagem não existe mais. Atualize a tela.');
    if (d && (d.status === ST.APR || d.status === ST.OK)) throw falha('Essa contagem já foi enviada pra aprovação. Atualize a tela.');
    if (!d) {
      const doCod = t.docs.filter(function (x) { return x.codigo === codigo; });
      if (doCod.some(function (x) { return x.status === ST.APR; })) throw falha('Esse código já está aguardando aprovação.');
      d = doCod.filter(function (x) { return x.status === ST.PEN || x.status === ST.COR; })[0]
        || doCod.filter(function (x) { return x.status === ST.SOL; })[0] || null;
    }
    const agora = new Date().toISOString();
    if (!d) d = { id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), historico: [] };
    if (!d.solicitadoPor) d.codigo = codigo; // código pedido não muda
    else if (!d.codigo) d.codigo = codigo;
    d.cores = cores;
    d.total = cores.reduce(function (a, c) { return a + somaCor(c); }, 0);
    d.iniciadoEm = d.iniciadoEm || quandoIso(b.abertoEm) || agora;
    d.iniciadoPor = d.iniciadoPor || NOMES[user];
    d.atualizadoEm = agora;
    if (final) { d.status = ST.APR; d.finalizadoEm = agora; d.finalizadoPor = NOMES[user]; hist(d, user, 'Finalizou e enviou para aprovação'); }
    else { d.status = d.status === ST.COR ? ST.COR : ST.PEN; hist(d, user, 'Salvou a contagem'); }
    gravar(t.sh, d); gravarItens(t.sh, d);
    return { ok: true, contagem: limpo(d) };
  },

  descartar: function (user, b) {
    const t = lerTudo();
    const d = t.porId[String(b.id)]; if (!d) throw falha('Essa contagem não existe mais.');
    if (d.status !== ST.PEN && d.status !== ST.COR) throw falha('Só dá pra apagar contagem que ainda está pendente.');
    if (d.solicitadoPor) {
      d.status = ST.SOL; d.cores = []; d.total = 0; d.iniciadoEm = ''; d.iniciadoPor = ''; d.correcao = null;
      d.atualizadoEm = new Date().toISOString(); hist(d, user, 'Apagou a contagem, pedido voltou pras solicitações');
      gravar(t.sh, d); gravarItens(t.sh, d);
    } else apagarContagem(t.sh, d);
    return { ok: true };
  },

  aprovar: function (user, b) {
    exigeAprova(user);
    const t = lerTudo();
    const d = t.porId[String(b.id)]; if (!d) throw falha('Essa contagem não existe mais.');
    if (d.status !== ST.APR) throw falha('Essa contagem não está aguardando aprovação. Atualize a tela.');
    const agora = new Date().toISOString();
    d.status = ST.OK; d.aprovadoPor = NOMES[user]; d.conciliadoEm = agora; d.atualizadoEm = agora;
    hist(d, user, 'Aprovou. Conciliação registrada');
    gravar(t.sh, d); gravarItens(t.sh, d);
    return { ok: true, contagem: limpo(d) };
  },

  corrigir: function (user, b) {
    exigeAprova(user);
    const motivo = txt(b.motivo, 300);
    if (!motivo) throw falha('Escreva o que precisa corrigir.');
    const t = lerTudo();
    const d = t.porId[String(b.id)]; if (!d) throw falha('Essa contagem não existe mais.');
    if (d.status !== ST.APR) throw falha('Essa contagem não está aguardando aprovação. Atualize a tela.');
    const agora = new Date().toISOString();
    d.status = ST.COR; d.correcao = { por: NOMES[user], em: agora, motivo: motivo }; d.atualizadoEm = agora;
    hist(d, user, 'Pediu correção: ' + motivo);
    gravar(t.sh, d); gravarItens(t.sh, d);
    return { ok: true, contagem: limpo(d) };
  },

  solicitar: function (user, b) {
    exigeAprova(user);
    const lista = (Array.isArray(b.codigos) ? b.codigos : String(b.codigos || '').split(/[\s,;]+/))
      .map(codigoLimpo).filter(Boolean);
    const codigos = lista.filter(function (c, k) { return lista.indexOf(c) === k; }).slice(0, 200);
    if (!codigos.length) throw falha('Digite pelo menos um código.');
    const t = lerTudo();
    const abertos = {}; t.docs.forEach(function (d) { if (d.status !== ST.OK) abertos[d.codigo] = true; });
    const obs = txt(b.obs, 200);
    const novos = [], ja = [];
    codigos.forEach(function (c) {
      if (abertos[c]) { ja.push(c); return; }
      const agora = new Date().toISOString();
      const d = { id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), codigo: c, status: ST.SOL, total: 0,
        solicitadoPor: NOMES[user], solicitadoEm: agora, obsSolicitacao: obs, atualizadoEm: agora, historico: [], cores: [] };
      hist(d, user, 'Solicitou a contagem');
      gravar(t.sh, d); abertos[c] = true; novos.push(c);
    });
    return { ok: true, novos: novos, jaAbertos: ja };
  },

  cancelar: function (user, b) {
    exigeAprova(user);
    const t = lerTudo();
    const d = t.porId[String(b.id)]; if (!d) throw falha('Esse pedido não existe mais.');
    if (d.status !== ST.SOL) throw falha('A Ana já começou essa contagem. Não dá pra cancelar o pedido.');
    apagarContagem(t.sh, d);
    return { ok: true };
  }
};

function quandoIso(v) { const d = quando(v); return d ? d.toISOString() : ''; }
