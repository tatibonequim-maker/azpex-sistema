/* ===========================================================================
   PAINEL DA FÁBRICA — v1  "O que mandar para a Bonequim"
   ---------------------------------------------------------------------------
   Como usar: estar logada em https://app.miredata.com.br e clicar no favorito.
   O painel abre por cima da página e usa a sua própria sessão (sem senha).
   Gera uma FOLHA DE SEPARAÇÃO pronta pra imprimir (Ctrl+P > Salvar como PDF).
   Criado 29/07/2026.
   =========================================================================== */
(function () {
  'use strict';
  if (document.getElementById('pf-root')) { document.getElementById('pf-root').remove(); }

  var API = 'https://server.miredata.com.br';
  var TOKEN = localStorage.getItem('auth_token');

  /* ---- AJUSTES (a Taty edita no painel; ficam salvos no navegador dela) ---- */
  var CFG = Object.assign({
    semanas: 3,        // cobertura desejada na loja p/ cor comum
    semanasChefe: 4,   // cobertura p/ cor carro-chefe (top 10 em venda)
    piso: 5,           // mínimo por cor+tamanho na loja
    teto: 15,          // teto por cor+tamanho (comum)
    tetoChefe: 25,     // teto (carro-chefe)
    minDem: 0.4        // ignora SKU que vende menos que isso por semana
  }, JSON.parse(localStorage.getItem('pf_cfg') || '{}'));
  function salvaCfg() { localStorage.setItem('pf_cfg', JSON.stringify(CFG)); }

  /* ---- cores de novidade/sazonal que NÃO entram no envio ---- */
  var SUB = ['WILDASTER','WINDASTER','NEW GREEN','FLORESTA','RUBI','REALEZA','ORANGE','LARANJA',
             'BANANA','VERDE HUN','VIOLET','PINK ESCURO','VERDE BANDEIRA'];
  var EXA = ['PARROT','AZUL LAGOA','VERDE GARRAFA','FERRARI','RASPEBERRY','RASPBERRY','AZUL FRESH',
             'BERRY GLOSS','TOMATE','VERDE BOTEGA','PETROLEO','ROSA','CHAMBINHO','DEEP GREEN','UVA',
             'AZUL JEANS','PERA','VERDE NOVO','PITAYA'];
  var norm = function (s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  };
  var excl = function (c) { var n = norm(c); return SUB.some(function (w) { return n.indexOf(w) >= 0; }) || EXA.indexOf(n) >= 0; };
  var SO = ['PP','P','M','G','GG','G1','G2','G3','U'];
  var ordT = function (a) { return a.slice().sort(function (x, y) { var i = SO.indexOf(x), j = SO.indexOf(y); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); }); };

  /* ---- rede ---- */
  function gj(u) {
    return fetch(API + u, { headers: { Authorization: 'Bearer ' + TOKEN } })
      .then(function (r) { if (r.status === 401) throw new Error('401'); if (!r.ok) throw new Error('HTTP' + r.status); return r.json(); });
  }
  function arr(j) { return Array.isArray(j) ? j : ((j && (j.dados || j.data || j.rows)) || []); }
  /* roda várias chamadas com limite de simultâneas (senão o navegador engasga) */
  function emLotes(itens, n, fn) {
    var out = [], i = 0;
    function passo() {
      if (i >= itens.length) return Promise.resolve();
      var fatia = itens.slice(i, i + n); i += n;
      return Promise.all(fatia.map(fn)).then(function (r) { out = out.concat(r); return passo(); });
    }
    return passo().then(function () { return out; });
  }

  /* ---- UI ---- */
  var css = '#pf-root{position:fixed;inset:0;z-index:2147483647;background:rgba(20,20,20,.45);' +
    'font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;display:flex;' +
    'align-items:flex-start;justify-content:center;padding:26px 14px;overflow:auto}' +
    '#pf{background:#fff;border-radius:11px;width:100%;max-width:820px;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden}' +
    '#pf *{box-sizing:border-box}' +
    '#pf .h{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid #ddd}' +
    '#pf .h b{font-size:15px}#pf .h .x{margin-left:auto;cursor:pointer;color:#888;font-size:20px;line-height:1;padding:0 4px}' +
    '#pf .h .g{border:1px solid #ddd;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer;color:#555;background:#fff}' +
    '#pf .b{padding:15px 16px;max-height:56vh;overflow:auto}' +
    '#pf .f{display:flex;gap:9px;align-items:center;padding:13px 16px;border-top:1px solid #ddd;background:#fafafa;flex-wrap:wrap}' +
    '#pf .tot{margin-right:auto;color:#555;font-size:13px}#pf .tot b{color:#1a1a1a;font-size:15px}' +
    '#pf button.go{border:1px solid #1f5f4f;background:#1f5f4f;color:#fff;border-radius:7px;padding:8px 15px;font-size:13px;font-weight:600;cursor:pointer}' +
    '#pf button.go[disabled]{opacity:.45;cursor:default}' +
    '#pf table{width:100%;border-collapse:collapse;font-size:13px}' +
    '#pf th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:#666;border-bottom:1px solid #ddd;padding:0 7px 6px}' +
    '#pf td{padding:7px;border-bottom:1px solid #eee;vertical-align:middle}' +
    '#pf .pos{width:26px;font-weight:700;color:#1f5f4f;font-size:12px}' +
    '#pf .cod{font-weight:600}#pf .desc{color:#666;font-size:12px}' +
    '#pf .q{text-align:right;font-weight:700;width:56px}' +
    '#pf .cob{width:78px;font-size:12px}#pf .urg{color:#8a3a1a;font-weight:600}' +
    '#pf .cfg{display:none;padding:12px 16px;background:#fafaf8;border-bottom:1px solid #ddd;font-size:12.5px;color:#555}' +
    '#pf .cfg.on{display:block}#pf .cfg label{display:inline-flex;align-items:center;gap:6px;margin:0 14px 8px 0}' +
    '#pf .cfg input{width:52px;padding:4px 6px;border:1px solid #ddd;border-radius:5px}' +
    '#pf .msg{padding:26px 16px;text-align:center;color:#555}' +
    '#pf .err{background:#fbeee7;border:1px solid #edd6c9;color:#8a3a1a;border-radius:7px;padding:11px 13px;font-size:13px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var root = document.createElement('div'); root.id = 'pf-root';
  root.innerHTML = '<div id="pf">' +
    '<div class="h"><b>Painel da Fábrica</b><span class="desc" id="pf-sub">lendo o Miré…</span>' +
    '<span class="g" id="pf-gear">ajustes</span><span class="x" id="pf-x">&times;</span></div>' +
    '<div class="cfg" id="pf-cfg"></div>' +
    '<div class="b" id="pf-body"><div class="msg">Lendo estoque da fábrica e da loja…<br><span class="desc">leva uns 20 segundos</span></div></div>' +
    '<div class="f"><span class="tot" id="pf-tot"></span>' +
    '<button class="go" id="pf-print" disabled>Gerar folha de separação</button></div></div>';
  document.body.appendChild(root);
  var $ = function (id) { return document.getElementById(id); };
  $('pf-x').onclick = function () { root.remove(); };
  root.onclick = function (e) { if (e.target === root) root.remove(); };
  $('pf-gear').onclick = function () { $('pf-cfg').classList.toggle('on'); };
  $('pf-cfg').innerHTML =
    '<label>Cobertura na loja <input type="number" id="c1" value="' + CFG.semanas + '"> semanas</label>' +
    '<label>Carro-chefe <input type="number" id="c2" value="' + CFG.semanasChefe + '"> semanas</label>' +
    '<label>Mínimo por cor+tam <input type="number" id="c3" value="' + CFG.piso + '"></label>' +
    '<label>Teto <input type="number" id="c4" value="' + CFG.teto + '"></label>' +
    '<label>Teto carro-chefe <input type="number" id="c5" value="' + CFG.tetoChefe + '"></label>' +
    '<div style="margin-top:4px"><button class="go" id="c-ok" style="padding:5px 12px">Recalcular</button></div>';
  $('c-ok').onclick = function () {
    CFG.semanas = +$('c1').value || 3; CFG.semanasChefe = +$('c2').value || 4;
    CFG.piso = +$('c3').value || 5; CFG.teto = +$('c4').value || 15; CFG.tetoChefe = +$('c5').value || 25;
    salvaCfg(); $('pf-cfg').classList.remove('on'); rodar();
  };

  var DADOS = null;

  function rodar() {
    $('pf-body').innerHTML = '<div class="msg">Lendo estoque da fábrica e da loja…<br><span class="desc">leva uns 20 segundos</span></div>';
    $('pf-print').disabled = true; $('pf-tot').textContent = '';
    var hoje = new Date(), iso = function (d) { return d.toISOString().slice(0, 10); };
    var FIM = iso(hoje), I30 = iso(new Date(hoje - 30 * 864e5)), I180 = iso(new Date(hoje - 180 * 864e5));

    Promise.all([
      gj('/produtos-estoque/relatorio?idloja=1&apenas_com_estoque=true&por_grade=true'),
      gj('/produtos/filtros'),
      gj('/produtos/giro-cobertura?inicio=' + I30 + '&fim=' + FIM + '&idloja=3'),
      gj('/produtos/giro-cobertura?inicio=' + I180 + '&fim=' + FIM + '&idloja=3')
    ]).then(function (r) {
      var fab = arr(r[0]), cols = (r[1] && r[1].colecoes) || [], g30 = arr(r[2]), g180 = arr(r[3]);
      /* bonequim capa em 5000 -> unir fatias por coleção */
      return emLotes(cols, 8, function (c) {
        return gj('/produtos-estoque/relatorio?idloja=3&apenas_com_estoque=true&por_grade=true&idcolecao=' + encodeURIComponent(c))
          .then(arr).catch(function () { return []; });
      }).then(function (partes) {
        return gj('/produtos-estoque/relatorio?idloja=3&apenas_com_estoque=true&por_grade=true').then(function (geral) {
          var m = new Map();
          partes.forEach(function (p) { p.forEach(function (x) { m.set(x.id, x); }); });
          arr(geral).forEach(function (x) { if (!m.has(x.id)) m.set(x.id, x); });
          return { fab: fab, bon: Array.from(m.values()), g30: g30, g180: g180 };
        });
      });
    }).then(function (d) { DADOS = d; calcular(d); })
      .catch(function (e) {
        $('pf-body').innerHTML = '<div class="err">' + (String(e).indexOf('401') >= 0
          ? 'Sua sessão do Miré expirou. Recarregue a página, entre de novo e clique no favorito outra vez.'
          : 'Não consegui ler os dados do Miré (' + String(e).slice(0, 80) + ').') + '</div>';
      });
  }

  function calcular(d) {
    var cc = function (s) { return String(s == null ? '' : s).replace(/\D/g, ''); };
    var F = new Map(), L = new Map(), M = new Map();
    d.fab.forEach(function (r) { var k = cc(r.id); F.set(k, Math.max(0, +r.estoque || 0)); M.set(k, [String(r.descricao || ''), r.idcor || '', r.idtamanho || 'U']); });
    d.bon.forEach(function (r) { var k = cc(r.id); L.set(k, Math.max(0, +r.estoque || 0)); if (!M.has(k)) M.set(k, [String(r.descricao || ''), r.idcor || '', r.idtamanho || 'U']); });

    /* mapa (ref|cor|tam) -> sku, pra casar a venda com o estoque */
    var skuDe = new Map();
    d.fab.concat(d.bon).forEach(function (r) {
      var k = (r.referencia || '') + '|' + norm(r.idcor) + '|' + (r.idtamanho || 'U');
      if (!skuDe.has(k)) skuDe.set(k, cc(r.id));
    });
    var V30 = new Map(), V180 = new Map(), wC = {}, wT = {};
    d.g30.forEach(function (g) {
      var q = +g.quantidade_vendida || 0; if (q <= 0) return;
      var s = skuDe.get(g.idproduto + '|' + norm(g.cor) + '|' + (g.tamanho || 'U')); if (s) V30.set(s, (V30.get(s) || 0) + q);
    });
    d.g180.forEach(function (g) {
      var q = +g.quantidade_vendida || 0; if (q <= 0) return;
      wC[norm(g.cor)] = (wC[norm(g.cor)] || 0) + q; wT[g.tamanho] = (wT[g.tamanho] || 0) + q;
      var s = skuDe.get(g.idproduto + '|' + norm(g.cor) + '|' + (g.tamanho || 'U')); if (s) V180.set(s, (V180.get(s) || 0) + q);
    });
    /* carro-chefe = as 10 cores que mais venderam de verdade (não lista fixa) */
    var CHEFE = new Set(Object.keys(wC).sort(function (a, b) { return wC[b] - wC[a]; }).slice(0, 10));

    /* demanda semanal do MODELO: maior entre o ritmo de 30d e o de 180d.
       O 180d evita a censura (modelo que sumiu do estoque some da venda). */
    var MW = new Map();
    V30.forEach(function (q, k) { var r = k.slice(0, 7); MW.set(r, Math.max(MW.get(r) || 0, 0) + q / 4.345); });
    var m180 = new Map();
    V180.forEach(function (q, k) { var r = k.slice(0, 7); m180.set(r, (m180.get(r) || 0) + q / 26.07); });
    m180.forEach(function (q, r) { MW.set(r, Math.max(MW.get(r) || 0, q)); });

    var modC = new Map(), modT = new Map();
    F.forEach(function (f, k) {
      if (f <= 0) return; var mv = M.get(k); if (!mv || excl(mv[1])) return; var r = k.slice(0, 7);
      if (!modC.has(r)) modC.set(r, new Set()); modC.get(r).add(norm(mv[1]));
      if (!modT.has(r)) modT.set(r, new Set()); modT.get(r).add(mv[2]);
    });

    var cod = new Map(), total = 0;
    M.forEach(function (mv, k) {
      var f = F.get(k) || 0, l = L.get(k) || 0;
      if (f <= 0 || excl(mv[1])) return;
      var dsem = Math.max((V30.get(k) || 0) / 4.345, (V180.get(k) || 0) / 26.07);
      if (dsem <= 0 && l <= 0) {           /* não vendeu porque não tinha: estima */
        var r = k.slice(0, 7), mw = MW.get(r) || 0;
        if (mw > 0) {
          var cs = modC.get(r) || new Set(), ts = modT.get(r) || new Set(), sc = 0, stt = 0;
          cs.forEach(function (c) { sc += wC[c] || 1; }); ts.forEach(function (t) { stt += wT[t] || 1; });
          dsem = mw * ((wC[norm(mv[1])] || 1) / (sc || 1)) * ((wT[mv[2]] || 1) / (stt || 1));
        }
      }
      var ch = CHEFE.has(norm(mv[1]));
      var aV = dsem >= CFG.minDem ? Math.min(ch ? CFG.tetoChefe : CFG.teto,
        Math.max(3, Math.ceil(dsem * (ch ? CFG.semanasChefe : CFG.semanas)))) : 0;
      var e = Math.min(f, Math.max(0, Math.max(CFG.piso, aV) - l));
      if (e <= 0) return;
      var ref = k.slice(0, 7);
      if (!cod.has(ref)) cod.set(ref, { ref: ref, desc: mv[0], cores: new Map(), tot: 0 });
      var o = cod.get(ref); o.tot += e; total += e;
      if (!o.cores.has(mv[1])) o.cores.set(mv[1], new Map());
      o.cores.get(mv[1]).set(mv[2], e);
    });

    /* urgência = quantas semanas o estoque da loja aguenta */
    var lista = Array.from(cod.values());
    lista.forEach(function (o) {
      var lojaTot = 0; L.forEach(function (v, k) { if (k.slice(0, 7) === o.ref) lojaTot += v; });
      var sem = MW.get(o.ref) || 0;
      o.loja = lojaTot; o.sem = sem; o.cob = sem > 0 ? lojaTot / sem : 9999; o.on = true;
    });
    lista.sort(function (a, b) { return a.cob - b.cob; });
    render(lista);
  }

  function render(lista) {
    if (!lista.length) { $('pf-body').innerHTML = '<div class="msg">Nada a mandar hoje — a loja está servida em tudo que a fábrica tem.</div>'; return; }
    var h = '<table><tr><th></th><th>Código</th><th>Peças</th><th>Cobertura</th><th></th></tr>';
    lista.forEach(function (o, i) {
      var cob = o.cob > 900 ? 'sem venda' : (Math.round(o.cob * 10) / 10).toString().replace('.', ',') + ' sem';
      h += '<tr><td class="pos">' + (i + 1) + 'º</td>' +
        '<td><span class="cod">' + o.ref + '</span><div class="desc">' + o.desc.slice(0, 34) + '</div></td>' +
        '<td class="q">' + o.tot + '</td>' +
        '<td class="cob' + (o.cob < 10 ? ' urg' : '') + '">' + cob + '</td>' +
        '<td><input type="checkbox" data-i="' + i + '" checked></td></tr>';
    });
    $('pf-body').innerHTML = h + '</table>';
    var atualiza = function () {
      var t = 0, n = 0;
      lista.forEach(function (o) { if (o.on) { t += o.tot; n++; } });
      $('pf-tot').innerHTML = 'Selecionado: <b>' + t + ' peças</b> em ' + n + ' códigos';
      $('pf-print').disabled = !n;
    };
    Array.prototype.forEach.call($('pf-body').querySelectorAll('input'), function (ip) {
      ip.onchange = function () { lista[+ip.dataset.i].on = ip.checked; atualiza(); };
    });
    atualiza();
    $('pf-sub').textContent = 'estoque de agora';
    $('pf-print').onclick = function () { imprimir(lista.filter(function (o) { return o.on; })); };
  }

  /* ---- folha de separação: abre numa aba nova, pronta pro Ctrl+P ---- */
  function imprimir(lista) {
    var hoje = new Date().toLocaleDateString('pt-BR');
    var tot = lista.reduce(function (s, o) { return s + o.tot; }, 0);
    var blocos = lista.map(function (o, i) {
      var tams = [];
      o.cores.forEach(function (g) { g.forEach(function (v, t) { if (tams.indexOf(t) < 0) tams.push(t); }); });
      tams = ordT(tams);
      var cores = Array.from(o.cores.entries()).sort(function (a, b) {
        var sa = 0, sb = 0; a[1].forEach(function (v) { sa += v; }); b[1].forEach(function (v) { sb += v; }); return sb - sa;
      });
      var th = '<tr><th class="c">COR</th>' + tams.map(function (t) { return '<th>' + t + '</th>'; }).join('') + '</tr>';
      var tr = cores.map(function (c) {
        var a = '<tr class="a"><td class="c" rowspan="2">' + c[0].slice(0, 15) + '</td>' +
          tams.map(function (t) { var q = c[1].get(t); return '<td class="q">' + (q ? q : '') + '</td>'; }).join('') + '</tr>';
        var b = '<tr class="b">' + tams.map(function () { return '<td></td>'; }).join('') + '</tr>';
        return a + b;
      }).join('');
      return '<div class="bl"><div class="t">' + o.ref + '</div><div class="s">' + (i + 1) + 'º &middot; ' +
        o.desc.slice(0, 30) + ' &middot; ' + o.tot + ' pç</div><table>' + th + tr + '</table></div>';
    }).join('');

    var doc = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
      '<title>Separação ' + hoje + '</title><style>' +
      '@page{size:A4 portrait;margin:9mm 7mm 8mm}' +
      'body{font:11px/1.3 Helvetica,Arial,sans-serif;color:#000;margin:0}' +
      '.top{font-size:8px;color:#333;display:flex;justify-content:space-between;margin-bottom:5px}' +
      '.cols{column-count:3;column-gap:7mm}' +
      '.bl{break-inside:avoid;page-break-inside:avoid;margin:0 0 7px}' +   /* nunca parte um código */
      '.t{text-align:center;font-weight:bold;font-size:11px}' +
      '.s{text-align:center;font-size:7px;color:#333;margin-bottom:2px}' +
      'table{width:100%;border-collapse:collapse;border:1px solid #000}' +
      'th{background:#dcdcdc;font-size:8px;border-left:1px solid #000;padding:1px;text-align:center}' +
      'th.c{text-align:left;padding-left:3px;width:34%}' +
      'td{border-left:1px solid #000;height:15px;text-align:center;padding:0}' +
      'td.c{text-align:left;font-size:7px;font-weight:bold;padding-left:3px;border-top:1px solid #000}' +
      'td.q{font-size:11px;font-weight:bold;background:#d2d2d2}' +
      'tr.a td:not(.c){border-top:1px solid #000}' +
      'tr.b td{border-top:1px solid #999}' +
      '@media print{.no{display:none}}' +
      '.no{margin:10px 0 14px;text-align:center}' +
      '.no button{font-size:15px;padding:9px 20px;border:1px solid #1f5f4f;background:#1f5f4f;color:#fff;border-radius:7px;cursor:pointer}' +
      '</style></head><body>' +
      '<div class="no"><button onclick="window.print()">Imprimir / Salvar como PDF</button></div>' +
      '<div class="top"><span>Célula CINZA = separar essa quantidade. Anote embaixo, na branca, o que separou.</span>' +
      '<span>FÁBRICA &rarr; BONEQUIM &middot; ' + hoje + ' &middot; ' + tot + ' peças</span></div>' +
      '<div class="cols">' + blocos + '</div></body></html>';

    var w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (w && w.document) { w.document.write(doc); w.document.close(); return; }
    /* se o navegador bloquear a aba nova, mostra a folha aqui mesmo num iframe */
    var ov = document.createElement('div');
    ov.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#fff');
    var bar = document.createElement('div');
    bar.setAttribute('style', 'padding:9px 14px;border-bottom:1px solid #ddd;display:flex;gap:9px;align-items:center;' +
      'font:13px -apple-system,Segoe UI,Roboto,Arial,sans-serif');
    bar.innerHTML = '<b style="margin-right:auto">Folha de separação — ' + tot + ' peças</b>';
    var bp = document.createElement('button'); bp.textContent = 'Imprimir / Salvar como PDF';
    bp.setAttribute('style', 'border:1px solid #1f5f4f;background:#1f5f4f;color:#fff;border-radius:7px;padding:7px 14px;cursor:pointer;font-weight:600');
    var bx = document.createElement('button'); bx.textContent = 'Fechar';
    bx.setAttribute('style', 'border:1px solid #ccc;background:#fff;border-radius:7px;padding:7px 12px;cursor:pointer');
    bar.appendChild(bp); bar.appendChild(bx);
    var ifr = document.createElement('iframe');
    ifr.setAttribute('style', 'width:100%;height:calc(100% - 44px);border:0');
    ov.appendChild(bar); ov.appendChild(ifr); document.body.appendChild(ov);
    ifr.contentDocument.write(doc); ifr.contentDocument.close();
    bp.onclick = function () { ifr.contentWindow.focus(); ifr.contentWindow.print(); };
    bx.onclick = function () { ov.remove(); };
  }

  if (!TOKEN) {
    $('pf-body').innerHTML = '<div class="err">Não achei sua sessão do Miré. Abra o painel a partir de app.miredata.com.br, já logada.</div>';
  } else { rodar(); }
})();
