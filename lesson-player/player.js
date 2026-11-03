var DATA = JSON.parse(document.getElementById('lessonData').textContent);

var DEF = {
  en:{thanks:'Thank you!',again:'Play again',qty:'Qty',to:'To',date:'Date',doc:'Doc no',details:'Details',fol:'Fol',debit:'Debit',credit:'Credit',balance:'Balance',
      total:'Total',totals:'Totals',balCd:'Balance c/d',balBd:'Balance b/d',play:'Play',pause:'Pause',
      showAll:'Show all',step:'Step',of:'of',correct:'Correct',wrong:'Not quite',continue:'Continue',
      assets:'Assets',oe:'Owner\u2019s equity',liab:'Liabilities',accDr:'Account debited',accCr:'Account credited',
      balanced:'Debits = Credits',unbalanced:'Debits do not equal credits',excerpt:'Extract only \u2014 totals are not expected to balance',footer:'Generated with Accounting Explainer Studio'},
  af:{thanks:'Dankie!',again:'Speel weer',qty:'Hoev.',to:'Aan',date:'Datum',doc:'Dok. nr.',details:'Besonderhede',fol:'Fol',debit:'Debiet',credit:'Krediet',balance:'Saldo',
      total:'Totaal',totals:'Totale',balCd:'Saldo a/a',balBd:'Saldo b/o',play:'Speel',pause:'Wag',
      showAll:'Wys alles',step:'Stap',of:'van',correct:'Korrek',wrong:'Nie heeltemal nie',continue:'Gaan voort',
      assets:'Bates',oe:'Eienaarsbelang',liab:'Laste',accDr:'Rekening gedebiteer',accCr:'Rekening gekrediteer',
      balanced:'Debiete = Krediete',unbalanced:'Debiete stem nie ooreen met krediete nie',excerpt:'Slegs \u2019n uittreksel \u2014 die totale hoef nie te balanseer nie',footer:'Gegenereer met Accounting Explainer Studio'}
};
var base = DEF[(DATA.lang||'en').slice(0,2)] || DEF.en;
var L = Object.assign({}, base, DATA.labels || {});
var CUR = DATA.currency || 'R';
var DEC = (DATA.decimals === 0) ? 0 : 2;

function num(v){ var n = (typeof v === 'string') ? parseFloat(v.replace(/[^\d.\-]/g,'')) : v; return isFinite(n) ? n : 0; }
function fmt(v, blank){
  if(v === null || v === undefined || v === '') return blank === undefined ? '' : blank;
  var n = num(v);
  if(n === 0 && blank !== undefined) return blank;
  var s = Math.abs(n).toFixed(DEC);
  var p = s.split('.');
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return (n < 0 ? '(' + p.join(',') + ')' : p.join(','));
}
function money(v){ return CUR + '\u00A0' + fmt(v, CUR + '\u00A00'); }
function esc(s){ return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
function el(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html !== undefined) e.innerHTML = html; return e; }
function isOpen(e){ return !!(e && (e.opening || /^(saldo\s*b\/o|balance\s*b\/d|saldo\s*b\/d|beginsaldo|opening balance)/i.test(String(e.details||'')))); }
function sum(rows, fn){ var t = 0; for(var i=0;i<rows.length;i++) t += num(fn(rows[i])); return t; }

/* ---------- block renderers ---------- */

function rSourceDoc(b){
  var d = b.doc || {};
  var box = el('div','doc');
  box.setAttribute('data-reveal','');
  var lines = d.lines || [];
  var showQty = lines.some(function(l){ return l.qty !== undefined && l.qty !== null; });
  var h = '<div class="dh"><div><div class="dt">' + esc(d.docType||'') + '</div>' +
          (d.from ? '<div style="font-size:.8rem">' + esc(d.from) + '</div>' : '') + '</div>' +
          '<div class="dn">' + esc(L.doc) + '<b>' + esc(d.docNo||'') + '</b>' + esc(d.date||'') + '</div></div>';
  if(d.to) h += '<div class="party"><b>' + esc(d.toLabel || L.to) + ':</b> ' + esc(d.to) + '</div>';
  if(lines.length){
    h += '<table><thead><tr><th style="text-align:left">' + esc(L.details) + '</th>' +
         (showQty ? '<th class="num">' + esc(L.qty) + '</th><th class="num">' + esc(CUR) + '</th>' : '') +
         '<th class="num">' + esc(CUR) + '</th></tr></thead><tbody>';
    lines.forEach(function(l){
      h += '<tr><td>' + esc(l.desc) + '</td>' +
           (showQty ? '<td class="num">' + esc(l.qty===undefined?'':l.qty) + '</td><td class="num">' + fmt(l.unitPrice,'') + '</td>' : '') +
           '<td class="num">' + fmt(l.amount) + '</td></tr>';
    });
    var tot = (d.total !== undefined) ? num(d.total) : sum(lines, function(l){ return l.amount; });
    h += '</tbody><tfoot><tr class="tot"><td' + (showQty ? ' colspan="3"' : '') + '>' + esc(L.total) + '</td><td class="num">' + fmt(tot) + '</td></tr></tfoot></table>';
  } else if(d.total !== undefined){
    h += '<div style="font-size:1.05rem;font-weight:800;margin-top:6px">' + esc(L.total) + ': ' + money(d.total) + '</div>';
  }
  if(d.terms) h += '<div class="terms">' + esc(d.terms) + '</div>';
  box.innerHTML = h;
  return box;
}

function rJournal(b){
  var j = b.journal || {};
  var cols = j.columns || [{key:'amount', label:L.total}];
  var rows = j.rows || [];
  var wrap = el('div');
  var t = el('table');
  var cap = (j.name||'') + (j.abbrev ? ' (' + j.abbrev + ')' : '') + (j.period ? ' \u2014 ' + j.period : '');
  t.innerHTML = '<caption>' + esc(cap) + '</caption>';

  var groups = cols.some(function(c){ return c.group; });
  var thead = '<thead>';
  if(groups){
    thead += '<tr><th rowspan="2">' + esc(L.date) + '</th><th rowspan="2">' + esc(L.doc) + '</th>' +
             '<th rowspan="2">' + esc(L.details) + '</th><th rowspan="2">' + esc(L.fol) + '</th>';
    var i = 0;
    while(i < cols.length){
      var g = cols[i].group || '';
      var span = 1;
      while(i + span < cols.length && (cols[i+span].group||'') === g) span++;
      thead += '<th colspan="' + span + '">' + esc(g || '\u00A0') + '</th>';
      i += span;
    }
    thead += '</tr><tr>' + cols.map(function(c){ return '<th class="num">' + esc(c.label) + '</th>'; }).join('') + '</tr>';
  } else {
    thead += '<tr><th>' + esc(L.date) + '</th><th>' + esc(L.doc) + '</th><th>' + esc(L.details) + '</th><th>' + esc(L.fol) + '</th>' +
             cols.map(function(c){ return '<th class="num">' + esc(c.label) + '</th>'; }).join('') + '</tr>';
  }
  thead += '</thead>';

  var tb = '<tbody>';
  rows.forEach(function(r){
    tb += '<tr data-reveal><td class="ctr">' + esc(r.date) + '</td><td class="ctr docNo">' + esc(r.docNo||'') + '</td><td>' + esc(r.details||'') + '</td><td class="ctr">' + esc(r.fol||'') + '</td>' +
          cols.map(function(c){ return '<td class="num">' + fmt((r.values||{})[c.key], '') + '</td>'; }).join('') + '</tr>';
  });
  tb += '</tbody>';
  var tf = '<tfoot><tr class="tot" data-reveal><td colspan="4">' + esc(L.totals) + '</td>' +
           cols.map(function(c){ return '<td class="num">' + fmt(sum(rows, function(r){ return (r.values||{})[c.key]; })) + '</td>'; }).join('') + '</tr></tfoot>';

  t.innerHTML += thead + tb + tf;
  wrap.appendChild(t);
  if(j.note) wrap.appendChild(el('div','terms', esc(j.note)));
  return wrap;
}

function rTAccounts(b){
  var wrap = el('div');
  if(b.section) wrap.appendChild(el('div','blockTitle', esc(b.section)));
  var grid = el('div','tacc');
  (b.accounts||[]).forEach(function(a){ grid.appendChild(tAccount(a)); });
  wrap.appendChild(grid);
  return wrap;
}

function tAccount(a){
  var box = el('div','taccBox');
  box.appendChild(el('div','accName', esc(a.name)));
  var D = (a.debit||[]).slice(), C = (a.credit||[]).slice();
  var totD = sum(D, function(e){ return e.amount; }), totC = sum(C, function(e){ return e.amount; });
  var showTot = a.balance === true || (D.length > 1 || C.length > 1) && a.balance !== false;
  var balSide = null, balAmt = 0;
  if(a.balance === true){
    balAmt = Math.abs(totD - totC);
    if(balAmt > 0.005){
      balSide = totD > totC ? 'C' : 'D';
      (balSide === 'C' ? C : D).push({date:a.balDate||'', details:L.balCd, fol:'', amount:balAmt, _bal:1});
      if(balSide === 'C') totC += balAmt; else totD += balAmt;
    }
    showTot = true;
  }
  var n = Math.max(D.length, C.length);
  var codeRow = a.code ? '<tr><th colspan="6" style="border-bottom:none"></th><th style="border-bottom:none;font-weight:400;color:#6B7280;text-align:center">' + esc(a.code) + '</th><th style="border-bottom:none"></th></tr>' : '';
  var h = '<table class="t"><thead>' + codeRow + '<tr>' +
      '<th style="text-align:left">' + esc(L.date) + '</th><th style="text-align:left">' + esc(L.details) + '</th><th>' + esc(L.fol) + '</th><th class="num mid">' + esc(CUR) + '</th>' +
      '<th style="text-align:left">' + esc(L.date) + '</th><th style="text-align:left">' + esc(L.details) + '</th><th>' + esc(L.fol) + '</th><th class="num">' + esc(CUR) + '</th></tr></thead><tbody>';
  for(var i=0;i<n;i++){
    var d = D[i], c = C[i];
    h += '<tr data-reveal>' +
      '<td>' + esc(d?d.date:'') + '</td><td>' + esc(d?d.details:'') + '</td><td class="ctr">' + esc(d?(d.fol||''):'') + '</td><td class="num mid">' + (d?fmt(d.amount):'') + '</td>' +
      '<td>' + esc(c?c.date:'') + '</td><td>' + esc(c?c.details:'') + '</td><td class="ctr">' + esc(c?(c.fol||''):'') + '</td><td class="num">' + (c?fmt(c.amount):'') + '</td></tr>';
  }
  h += '</tbody>';
  if(showTot){
    h += '<tfoot><tr class="tot" data-reveal><td colspan="3"></td><td class="num mid">' + fmt(totD) + '</td><td colspan="3"></td><td class="num">' + fmt(totC) + '</td></tr>';
    if(balSide){
      var bd = balSide === 'C'
        ? '<td>' + esc(a.balDateNext||'') + '</td><td>' + esc(L.balBd) + '</td><td class="ctr"></td><td class="num mid">' + fmt(balAmt) + '</td><td colspan="4"></td>'
        : '<td colspan="4" class="mid"></td><td>' + esc(a.balDateNext||'') + '</td><td>' + esc(L.balBd) + '</td><td class="ctr"></td><td class="num">' + fmt(balAmt) + '</td>';
      h += '<tr data-reveal>' + bd + '</tr>';
    }
    h += '</tfoot>';
  }
  h += '</table>';
  box.insertAdjacentHTML('beforeend', h);
  return box;
}

function rLedgerCol(b){
  var a = b.account || {};
  var wrap = el('div');
  var t = el('table');
  var cap = (a.ledger ? a.ledger + ' \u2014 ' : '') + (a.name||'') + (a.code ? ' (' + a.code + ')' : '');
  var head = '<caption>' + esc(cap) + '</caption><thead><tr><th>' + esc(L.date) + '</th><th>' + esc(L.doc) + '</th><th>' + esc(L.details) + '</th><th>' + esc(L.fol) + '</th>' +
    '<th class="num">' + esc(L.debit) + '</th><th class="num">' + esc(L.credit) + '</th><th class="num">' + esc(L.balance) + '</th></tr></thead><tbody>';
  var bal = num(a.opening || 0);
  if(a.opening !== undefined && a.opening !== null){
    head += '<tr data-reveal><td class="ctr">' + esc(a.openingDate||'') + '</td><td></td><td>' + esc(a.openingLabel || L.balBd) + '</td><td class="ctr">\u2713</td><td class="num"></td><td class="num"></td><td class="num">' + fmt(bal) + '</td></tr>';
  }
  (a.rows||[]).forEach(function(r){
    bal += num(r.debit) - num(r.credit);
    head += '<tr data-reveal><td class="ctr">' + esc(r.date) + '</td><td class="ctr docNo">' + esc(r.docNo||'') + '</td><td>' + esc(r.details||'') + '</td><td class="ctr">' + esc(r.fol||'') + '</td>' +
      '<td class="num">' + fmt(r.debit,'') + '</td><td class="num">' + fmt(r.credit,'') + '</td><td class="num">' + fmt(bal) + '</td></tr>';
  });
  head += '</tbody>';
  t.innerHTML = head;
  wrap.appendChild(t);
  if(a.note) wrap.appendChild(el('div','terms', esc(a.note)));
  return wrap;
}

function rEquation(b){
  var rows = b.rows || [];
  var t = el('table');
  var h = '<caption>' + esc(b.title || 'A = OE + L') + '</caption><thead><tr><th>' + esc(L.date) + '</th><th>' + esc(L.accDr) + '</th><th>' + esc(L.accCr) + '</th>' +
    '<th class="num">' + esc(L.assets) + '</th><th class="num">' + esc(L.oe) + '</th><th class="num">' + esc(L.liab) + '</th></tr></thead><tbody>';
  function sgn(v){ if(v === null || v === undefined || v === '' || num(v) === 0) return '0'; return (num(v) > 0 ? '+' : '\u2212') + fmt(Math.abs(num(v))); }
  rows.forEach(function(r){
    h += '<tr data-reveal><td class="ctr">' + esc(r.date||'') + '</td><td>' + esc(r.debit||'') + '</td><td>' + esc(r.credit||'') + '</td>' +
      '<td class="num">' + sgn(r.a) + '</td><td class="num">' + sgn(r.oe) + '</td><td class="num">' + sgn(r.l) + '</td></tr>';
  });
  var A = sum(rows, function(r){ return r.a; }), O = sum(rows, function(r){ return r.oe; }), Li = sum(rows, function(r){ return r.l; });
  h += '</tbody><tfoot><tr class="tot" data-reveal><td colspan="3">' + esc(L.totals) + '</td><td class="num">' + sgn(A) + '</td><td class="num">' + sgn(O) + '</td><td class="num">' + sgn(Li) + '</td></tr></tfoot>';
  t.innerHTML = h;
  var wrap = el('div'); wrap.appendChild(t);
  var ok = Math.abs(A - (O + Li)) < 0.005;
  /* the check is shown when it holds; an extract that does not balance gets no remark */
  if(ok) wrap.appendChild(el('div','chk ok', '\u2713 ' + esc(L.assets) + ' ' + sgn(A) + ' \u00B7 ' + esc(L.oe) + ' + ' + esc(L.liab) + ' ' + sgn(O + Li)));
  return wrap;
}

function rTrialBalance(b){
  var rows = b.accounts || [];
  var t = el('table');
  var h = '<caption>' + esc(b.title || 'Trial balance') + '</caption><thead><tr><th style="text-align:left">' + esc(L.details) + '</th><th>' + esc(L.fol) + '</th><th class="num">' + esc(L.debit) + '</th><th class="num">' + esc(L.credit) + '</th></tr></thead><tbody>';
  rows.forEach(function(r){
    h += '<tr data-reveal><td>' + esc(r.name) + '</td><td class="ctr">' + esc(r.fol||'') + '</td><td class="num">' + fmt(r.debit,'') + '</td><td class="num">' + fmt(r.credit,'') + '</td></tr>';
  });
  var d = sum(rows, function(r){ return r.debit; }), c = sum(rows, function(r){ return r.credit; });
  h += '</tbody><tfoot><tr class="tot" data-reveal><td colspan="2">' + esc(L.totals) + '</td><td class="num">' + fmt(d) + '</td><td class="num">' + fmt(c) + '</td></tr></tfoot>';
  t.innerHTML = h;
  var wrap = el('div'); wrap.appendChild(t);
  var ok = Math.abs(d - c) < 0.005;
  if(ok) wrap.appendChild(el('div','chk ok', '\u2713 ' + esc(L.balanced)));
  return wrap;
}

/* one optional emoji, drawn before a label; anything longer than a short emoji sequence is ignored */
function ico(x, size){ var t = (typeof x === 'string') ? x.trim() : ''; return (t && t.length <= 8) ? '<span class="ico' + (size ? ' ' + size : '') + '">' + esc(t) + '</span>' : ''; }

function rText(b){
  var e = el('div','callout ' + (b.tone||''));
  e.setAttribute('data-reveal','');
  var inner = (b.heading ? '<b>' + esc(b.heading) + '</b>' : '') + esc(b.body||'').replace(/\n/g,'<br>');
  e.innerHTML = ico(b.icon) ? '<span class="cicon">' + ico(b.icon) + '</span><span class="ctxt">' + inner + '</span>' : inner;
  if(ico(b.icon)) e.classList.add('withIcon');
  return e;
}

function rFlow(b){
  var f = el('div','flow');
  (b.steps||[]).forEach(function(s, i){
    var st = el('div','step');
    st.setAttribute('data-reveal','');
    st.innerHTML = (ico(s.icon) ? '<span class="sicon">' + ico(s.icon) + '</span>' : '') + (i ? '<span class="arw">\u2192</span>' : '') + '<b>' + esc(s.label||'') + '</b>' + esc(s.text||'');
    f.appendChild(st);
  });
  return f;
}

/* big equation tiles, e.g. Bates = Eienaarsbelang + Laste. parts: [{text, tone?, sub?}] or [{op:'='}]. Each tile appears on its own line. */
function rFormula(b){
  var f = el('div','formula');
  var pendingOp = '';
  (b.parts||[]).forEach(function(p){
    if(p.op){ pendingOp = p.op; return; }
    var t = el('div','ftile ' + (p.tone||'blue'));
    t.setAttribute('data-reveal','');
    t.innerHTML = (pendingOp ? '<span class="fop">' + esc(pendingOp) + '</span>' : '') +
      '<span class="fbox">' + (ico(p.icon) ? '<span class="ficon">' + ico(p.icon) + '</span>' : '') + '<b>' + esc(p.text||'') + '</b>' + (p.sub ? '<i>' + esc(p.sub) + '</i>' : '') + '</span>';
    pendingOp = '';
    f.appendChild(t);
  });
  return f;
}

/* labelled cards in a grid. cards: [{label, text, tone?, badge?}] */
function rCards(b){
  var g = el('div','cards');
  (b.cards||[]).forEach(function(c){
    var d = el('div','card2 ' + (c.tone||'blue'));
    d.setAttribute('data-reveal','');
    d.innerHTML = (c.badge ? '<span class="badge">' + esc(c.badge) + '</span>' : '') +
      '<b>' + ico(c.icon) + esc(c.label||'') + '</b>' + (c.text ? '<span>' + esc(c.text) + '</span>' : '');
    g.appendChild(d);
  });
  return g;
}

/* up / down effect chips. items: [{label, dir:'up'|'down', note?}] */
function rChange(b){
  var g = el('div','changes');
  (b.items||[]).forEach(function(it){
    var up = it.dir === 'up';
    var d = el('div','chg ' + (up ? 'up' : 'down'));
    d.setAttribute('data-reveal','');
    d.innerHTML = '<span class="arrow">' + (up ? '▲' : '▼') + '</span><span class="ctext"><b>' + esc(it.label||'') + '</b>' + (it.note ? '<i>' + esc(it.note) + '</i>' : '') + '</span>';
    g.appendChild(d);
  });
  return g;
}

function rCalc(b){
  var t = el('table');
  var h = '<caption>' + esc(b.title||'') + '</caption><tbody>';
  (b.lines||[]).forEach(function(l){
    h += '<tr data-reveal><td>' + esc(l.label) + '</td><td class="num">' + (typeof l.value === 'number' ? fmt(l.value) : esc(l.value)) + '</td></tr>';
  });
  h += '</tbody>';
  t.innerHTML = h;
  return t;
}

var RENDER = {
  source_document: rSourceDoc, journal: rJournal, t_accounts: rTAccounts,
  ledger_columnar: rLedgerCol, equation: rEquation, trial_balance: rTrialBalance,
  text: rText, flow: rFlow, calculation: rCalc,
  formula: rFormula, cards: rCards, change: rChange
};

/* ---------- player ---------- */

var beats = DATA.beats || [];
var bi = 0, steps = [], si = 0, timer = null, playing = false, showAll = false;
var CLOCK = null;   /* the lesson's timeline, see computeSchedule */
var groups = [];   /* what is revealed together with one narration line: [{from, to, lines, blocks}] over steps */
var STEP_MS = 3300;   /* seconds per revealed line while playing */


/* ---------- revealing in groups ----------
   Narration entry k belongs to the k-th revealed element. When the lesson has fewer narration entries than elements,
   the elements are revealed in as many groups as there are entries, cut at block boundaries where possible, so every
   sentence appears together with the part of the screen it talks about and no element appears in silence. */
function makeGroups(ids, N){
  var S = ids.length, out = [];
  if(!S) return out;
  N = Math.max(1, Math.min(N, S));
  var runs = [];
  ids.forEach(function(id, i){
    if(runs.length && runs[runs.length-1].id === id) runs[runs.length-1].n++;
    else runs.push({id:id, from:i, n:1});
  });
  var m = runs.length;
  if(m >= N){
    var cum = 0, start = 0;
    for(var r = 0; r < m; r++){
      cum += runs[r].n;
      var runsLeft = m - r - 1, groupsLeft = N - out.length - 1;
      if(runsLeft > 0 && out.length < N - 1 && (cum >= Math.round(S * (out.length + 1) / N) || runsLeft === groupsLeft)){
        out.push([start, cum]); start = cum;
      }
    }
    out.push([start, S]);
  } else {
    /* more lines than blocks: every block gets a group, the rest are shared out by size (square root, so one long table
       does not take them all), never more groups than the block has elements */
    var per = runs.map(function(){ return 1; }), extra = N - m, wsum = 0;
    runs.forEach(function(r){ wsum += Math.sqrt(r.n); });
    var ideal = runs.map(function(r){ return Math.min(r.n, N * Math.sqrt(r.n) / wsum); });
    runs.forEach(function(r, i){ var f = Math.max(1, Math.min(r.n, Math.floor(ideal[i]))); extra -= f - per[i]; per[i] = f; });
    while(extra < 0){ var big = -1; per.forEach(function(v, i){ if(v > 1 && (big < 0 || per[i] > per[big])) big = i; }); if(big < 0) break; per[big]--; extra++; }
    while(extra > 0){
      var best = -1, bv = -Infinity;
      runs.forEach(function(r, i){ var rem = ideal[i] - per[i]; if(per[i] < r.n && rem > bv){ bv = rem; best = i; } });
      if(best < 0) break;
      per[best]++; extra--;
    }
    runs.forEach(function(r, i){
      for(var j = 0; j < per[i]; j++) out.push([r.from + Math.floor(r.n * j / per[i]), r.from + Math.floor(r.n * (j + 1) / per[i])]);
    });
  }
  return out;
}

function layoutBeat(b){
  var stage = document.getElementById('pStage');
  var blocks = Array.prototype.slice.call(stage.querySelectorAll('.block'));
  var ids = steps.map(function(x){ var k = blocks.indexOf(x.closest('.block')); return k < 0 ? 1000 : k; });
  var nar = b.narration || [];
  var ranges;
  var spread = steps.length > 0 && nar.length > steps.length;   /* more lines than elements: each element says several */
  var oneToOne = nar.length === 0 || nar.length === steps.length || spread;
  if(oneToOne) ranges = steps.map(function(_, i){ return [i, i + 1]; });
  else ranges = makeGroups(ids, nar.length);
  groups = ranges.map(function(r, g){
    var lines = [];
    if(spread){
      var a = Math.round(g * nar.length / steps.length), z = Math.round((g + 1) * nar.length / steps.length);
      nar.slice(a, z).forEach(function(x){ if(x) lines.push(x); });
    } else if(nar[g]) lines.push(nar[g]);
    var bl = []; for(var q = r[0]; q < r[1]; q++) if(ids[q] !== 1000 && bl.indexOf(ids[q]) < 0) bl.push(ids[q]);
    return {from:r[0], to:r[1], lines:lines, blocks:bl};
  });
  /* an element with no line of its own appears together with the next element that has one, instead of popping up in silence
     (a script that has no sentence for it); blanks at the end join the last spoken group */
  if(oneToOne && !spread && groups.some(function(g){ return g.lines.length; })){
    var merged = [], pend = null;
    groups.forEach(function(g){
      var cur = pend ? {from:pend.from, to:g.to, lines:g.lines, blocks:pend.blocks.concat(g.blocks.filter(function(x){ return pend.blocks.indexOf(x) < 0; }))} : g;
      if(g.lines.length){ merged.push(cur); pend = null; } else pend = cur;
    });
    if(pend){ var last = merged[merged.length - 1]; last.to = pend.to; pend.blocks.forEach(function(x){ if(last.blocks.indexOf(x) < 0) last.blocks.push(x); }); }
    groups = merged;
  }
}
function gIndex(){ var n = 0; for(var i = 0; i < groups.length; i++) if(groups[i].to <= si) n++; return n; }
function groupLines(g){ return (groups[g] && groups[g].lines) || []; }

function renderBeat(){
  var b = beats[bi] || {};
  var st = document.getElementById('pStage');
  st.innerHTML = '';
  st.appendChild(el('h2', null, ico(b.icon, 'big') + '<span class="num">' + (bi+1) + '.</span>' + esc(b.title||'')));
  if(b.note) st.appendChild(el('div','stageNote', esc(b.note)));
  (b.blocks||[]).forEach(function(blk){
    var fn = RENDER[blk.type];
    if(!fn) return;
    var w = el('div','block');
    var selfCaption = ['journal','ledger_columnar','equation','trial_balance','calculation','formula','cards','change'].indexOf(blk.type) > -1;
    if(blk.title && !selfCaption) w.appendChild(el('div','blockTitle', esc(blk.title)));
    try { w.appendChild(fn(blk)); } catch(e){ w.appendChild(el('div','chk bad','Block error: ' + esc(e.message))); }
    st.appendChild(w);
  });
  var glDr = 0, glCr = 0, glN = 0;
  (b.blocks||[]).forEach(function(blk){
    if(blk.type !== 't_accounts') return;
    (blk.accounts||[]).forEach(function(a){
      glN++;
      glDr += sum(a.debit||[], function(e){ return isOpen(e) ? 0 : e.amount; });
      glCr += sum(a.credit||[], function(e){ return isOpen(e) ? 0 : e.amount; });
    });
  });
  if(glN > 1 && (glDr > 0 || glCr > 0)){
    var glOk = Math.abs(glDr - glCr) < 0.005;
    if(glOk) st.appendChild(el('div','chk ok', '\u2713 ' + esc(L.balanced) + ': ' + esc(L.debit) + ' ' + fmt(glDr) + ' \u00B7 ' + esc(L.credit) + ' ' + fmt(glCr)));
  }
  if(b.quiz) st.appendChild(quizEl(b.quiz));
  steps = Array.prototype.slice.call(st.querySelectorAll('[data-reveal]'));
  layoutBeat(b);
  si = showAll ? steps.length : 0;
  paint();
  var capBox = document.getElementById('pCap');
  if(REDUCED || !b.caption){ capBox.textContent = b.caption || ''; }
  else { capBox.innerHTML = '<span>' + String(b.caption).split(/(\s+)/).map(function(w, i){ return /^\s+$/.test(w) ? w : '<span class="w" style="animation-delay:' + Math.min(1.4, i * 0.022) + 's">' + esc(w) + '</span>'; }).join('') + '</span>'; }
  /* beat entrance: restart the CSS animation on the stage and the caption bar */
  var capEl = document.getElementById('pCap');
  [st, capEl].forEach(function(n){ n.classList.remove('enter'); void n.offsetWidth; n.classList.add('enter'); });
  navPaint();
}

function paint(){
  steps.forEach(function(r, i){ r.classList.toggle('hide', i >= si); });
  var pct = steps.length ? Math.round(si / steps.length * 100) : 100;
  document.getElementById('bFill').style.width = pct + '%';
  document.getElementById('bPrev').disabled = (bi === 0 && si === 0);
  document.getElementById('bNext').disabled = (bi === beats.length - 1 && si >= steps.length);
  clockPaint();
}


/* figures in a row that has just appeared are counted up, like money arriving; the text is put back exactly afterwards */
var REDUCED = false;
try { REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch(e){}
function countUp(root){
  if(REDUCED) return;
  var cells = root.matches && root.matches('td.num') ? [root] : Array.prototype.slice.call(root.querySelectorAll('td.num'));
  cells.forEach(function(c){
    var orig = c.textContent;
    if(!/^\(?[\d\s,.  ]+\)?$/.test(orig.trim())) return;
    var neg = /^\(/.test(orig.trim());
    var target = parseFloat(orig.trim().replace(/[()\s\u00A0\u202F]/g, '').replace(',', '.'));   /* fmt writes 48 000,00 */
    if(!isFinite(target) || target === 0) return;
    var t0 = null, dur = 750;
    c.classList.add('count');
    function frame(ts){
      if(t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      c.textContent = k < 1 ? fmt((neg ? -1 : 1) * target * e, '') : orig;
      if(k < 1) requestAnimationFrame(frame); else setTimeout(function(){ c.classList.remove('count'); }, 900);
    }
    requestAnimationFrame(frame);
  });
}

/* ---------- engaging motion: a pointing hand on what has just appeared, sparkles when a beat is complete ---------- */
var POINTERS = ['👆', '👉', '☝️', '👇'];
var pointN = 0;
function pointAt(r){
  if(REDUCED || !r || r.tagName === 'TR') return;
  var old = r.querySelector(':scope > .pointer'); if(old) old.remove();
  var h = document.createElement('span');
  h.className = 'pointer p' + (pointN % 2);
  h.textContent = POINTERS[pointN % 2 === 0 ? 0 : 2];
  pointN++;
  r.appendChild(h);
  setTimeout(function(){ if(h.parentNode) h.parentNode.removeChild(h); }, 2600);
}
function celebrate(){
  if(REDUCED) return;
  var st = document.getElementById('pStage');
  if(!st || !st.querySelector('.chk.ok')) return;
  var rect = st.getBoundingClientRect();
  ['✨','⭐','✨','🎉','✨','⭐'].forEach(function(e, i){
    var s = document.createElement('span');
    s.className = 'spark';
    s.textContent = e;
    s.style.left = (18 + i * 13) + '%';
    s.style.animationDelay = (i * 0.07) + 's';
    st.appendChild(s);
    setTimeout(function(){ if(s.parentNode) s.parentNode.removeChild(s); }, 1900);
  });
}

/* ---------- intro and outro (the branded page): the logo and title arrive, the lesson starts; at the end, thanks and a replay ---------- */
var INTRO_S = 3, OUTRO_S = 4;
var BRAND = false;
try { BRAND = DATA.brand !== false && !!document.getElementById('splash'); } catch(e){}
var introOn = false, splashTimer = null;
function splashEl(){ return document.getElementById('splash'); }
function showSplash(mode){
  var sp = splashEl(); if(!sp) return;
  clearTimeout(splashTimer);
  sp.classList.remove('intro', 'outro', 'go');
  sp.classList.add(mode);
  document.getElementById('spTitle').textContent = DATA.title || '';
  document.getElementById('spMsg').textContent = L.thanks;
  var go = document.getElementById('spGo');
  go.textContent = mode === 'intro' ? ('▶ ' + L.play) : ('↻ ' + L.again);
  go.onclick = function(){ if(mode === 'intro') startFromSplash(); else replay(); };
  /* restart the CSS animations of the card */
  sp.hidden = true; void sp.offsetWidth; sp.hidden = false;
  introOn = (mode === 'intro');
  if(mode === 'outro') confetti();
}
function hideSplash(){
  var sp = splashEl(); if(!sp || sp.hidden) return;
  clearTimeout(splashTimer);
  sp.hidden = true;
  introOn = false;
}
function startFromSplash(){
  var sp = splashEl(); if(!sp) { play(true); return; }
  sp.classList.add('go');
  introOn = false;
  clockPaint();
  splashTimer = setTimeout(function(){ hideSplash(); play(true); }, REDUCED ? 300 : 2300);
}
function replay(){
  hideSplash();
  bi = 0; si = 0; spoke = {};
  renderBeat();
  play(true);
}
function outroSoon(){
  if(!BRAND) return;
  splashTimer = setTimeout(function(){ showSplash('outro'); }, 1400);
}
function confetti(){
  var c = document.getElementById('spConf'); if(!c || REDUCED) return;
  c.innerHTML = '';
  var set = ['🎉','✨','⭐','🎓','💡','✨'];
  for(var i = 0; i < 22; i++){
    var s = document.createElement('span');
    s.textContent = set[i % set.length];
    s.style.left = (Math.random() * 96) + '%';
    s.style.animationDuration = (2.4 + Math.random() * 2.2) + 's';
    s.style.animationDelay = (Math.random() * 1.2) + 's';
    s.style.fontSize = (1.4 + Math.random() * 1.6) + 'rem';
    c.appendChild(s);
  }
}

function stepFwd(){
  if(si < steps.length){
    var g = groups[gIndex()] || {from:si, to:si + 1};
    steps.forEach(function(x){ x.classList.remove('now'); });
    var shown = steps.slice(g.from, g.to);
    si = g.to;
    shown.forEach(function(r){ r.classList.remove('hide'); r.classList.add('pop', 'now'); countUp(r); pointAt(r); });
    if(si >= steps.length) celebrate();
    setTimeout(function(){ shown.forEach(function(r){ r.classList.remove('pop'); }); }, 900);
    paint();
    return true;
  }
  if(bi < beats.length - 1){ bi++; renderBeat(); return true; }
  return false;
}
function stepBack(){
  if(si > 0){ var g = gIndex(); si = g > 0 ? groups[g - 1].from : 0; paint(); return; }
  if(bi > 0){ bi--; renderBeat(); si = steps.length; paint(); }
}
/* ---------- voice-over: pre-recorded narration embedded at build time ----------
   build_narration.py stores one MP3 per spoken line in <script id="narrationAudio">,
   keyed by the exact line text. A line without audio is shown silently. */
var NARR = {};
try { var nEl = document.getElementById('narrationAudio'); if(nEl) NARR = JSON.parse(nEl.textContent) || {}; } catch(e){ NARR = {}; }
var voiceOn = true, spoke = {};
var audioEl = null;

function banner(kind, text){
  var el2 = document.getElementById('voiceBanner');
  if(!el2) return;
  if(!text){ el2.style.display = 'none'; return; }
  el2.style.display = 'block';
  el2.textContent = text;
  el2.style.background = '#EFF6FF';
  el2.style.color = '#1E40AF';
  el2.style.border = '1px solid #BFDBFE';
}

/* stop any playing line; does not fire the pending callback */
var sayToken = 0;
var TTS_URL = ((location.origin && location.origin !== 'null') ? location.origin : '') + '/.netlify/functions/tts';
function hush(){
  sayToken++;
  if(audioEl){ try { audioEl.pause(); } catch(e){} audioEl.onended = null; audioEl.onerror = null; audioEl = null; }
}

/* play one line; done fires once when it ends (or at once if there is no audio) */
function say(text, done){
  hush();
  if(!voiceOn || !text){ if(done) setTimeout(done, 0); return; }
  var finish = function(){ if(done) done(); };
  var voiceErr = (DATA.lang||'').slice(0,2) === 'af'
    ? 'Stem nie beskikbaar nie \u2014 kontroleer die internetverbinding.'
    : 'Voice unavailable \u2014 check the internet connection.';
  var play = function(src){
    audioEl = new Audio(src);
    audioEl.onended = function(){ audioEl = null; finish(); };
    audioEl.onerror = function(){ audioEl = null; banner('cloud', voiceErr); finish(); };
    var pr = audioEl.play();
    if(pr && pr.catch) pr.catch(function(){ audioEl = null; banner('cloud', voiceErr); finish(); });
  };
  if(NARR[text]){
    var src = NARR[text];
    /* a data: URI, a hosted file (http, blob or a path) or plain base64 mp3 */
    if(!/^(data:|https?:|blob:|\/)/.test(src)) src = 'data:audio/mpeg;base64,' + src;
    banner(null, ''); play(src); return;
  }
  /* embedded-audio mode (voice-over studio): no server voice to fall back on, so a line without audio is shown silently */
  if(DATA.embeddedAudioOnly){ finish(); return; }
  var token = sayToken;
  fetch(TTS_URL, {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({text: text, lang: (DATA.lang||'en').slice(0,2)})})
    .then(function(r){ if(!r.ok) throw new Error('status ' + r.status); return r.blob(); })
    .then(function(blob){
      if(token !== sayToken || !voiceOn) return;
      banner(null, '');
      play(URL.createObjectURL(blob));
    })
    .catch(function(){ if(token === sayToken){ banner('cloud', voiceErr); finish(); } });
}

function sayAll(lines, done){
  if(!lines.length){ done(); return; }
  say(lines[0], function(){ sayAll(lines.slice(1), done); });   /* hush() cancels pending callbacks, so no guard is needed here */
}
/* the caption, then (for a beat with nothing to reveal) its narration, then cb */
function sayBeatIntro(b, cb){
  var lines = [];
  if(b.caption) lines.push(b.caption);
  if(!steps.length) (b.narration || []).forEach(function(x){ if(x) lines.push(x); });
  if(!lines.length){ cb(); return false; }
  sayAll(lines, cb);
  return true;
}

function tick(){
  if(!playing) return;
  var lines = groupLines(gIndex());
  var atEnd = (si >= steps.length);
  if(!stepFwd()){ play(false); outroSoon(); return; }
  if(atEnd){                       /* we moved to a new beat: read its caption first */
    var b = beats[bi] || {};
    if(voiceOn && sayBeatIntro(b, function(){ if(playing) tick(); })) return;
  } else if(voiceOn && lines.length){
    sayAll(lines, function(){ if(playing) setTimeout(tick, 350); });
    return;
  }
  timer = setTimeout(tick, voiceOn ? 1200 : STEP_MS);
}

function play(on){
  if(on && introOn){ startFromSplash(); return; }
  playing = on;
  document.getElementById('bPlay').textContent = on ? ('\u23F8 ' + L.pause) : ('\u25B6 ' + L.play);
  clearTimeout(timer);
  if(!on){ hush(); return; }
  var b = beats[bi] || {};
  if(voiceOn && si === 0 && (b.caption || (!steps.length && (b.narration||[]).length)) && !spoke[bi]){
    spoke[bi] = 1;
    if(!sayBeatIntro(b, function(){ if(playing) tick(); })) tick();
  } else {
    tick();
  }
}

function quizEl(q){
  var box = el('div','quiz');
  box.setAttribute('data-reveal','');
  box.appendChild(el('div','q', esc(q.q||'')));
  var fb = el('div','fb'); fb.style.display = 'none';
  (q.options||[]).forEach(function(o){
    var b = el('button','opt', esc(o.text));
    b.onclick = function(){
      play(false);
      box.querySelectorAll('.opt').forEach(function(x){ x.disabled = true; });
      b.classList.add(o.correct ? 'right' : 'wrong');
      if(!o.correct){
        var idx = (q.options||[]).map(function(z){ return !!z.correct; }).indexOf(true);
        if(idx > -1) box.querySelectorAll('.opt')[idx].classList.add('right');
      }
      fb.innerHTML = '<b>' + esc(o.correct ? L.correct : L.wrong) + '.</b> ' + esc(o.explain || q.explain || '');
      fb.style.display = 'block';
    };
    box.appendChild(b);
  });
  box.appendChild(fb);
  return box;
}

var openGroup = null;
function groupsOf(){
  var out = [];
  beats.forEach(function(b, i){ if(b.group){ var g = out.filter(function(x){ return x.name === b.group; })[0]; if(!g){ g = {name:b.group, idx:[]}; out.push(g); } g.idx.push(i); } });
  return out;
}
/* a slim navigator: the slides of a multi-slide lesson are tabs, and only the sections of the open slide are listed, in one row */
function navPaint(){
  var nav = document.getElementById('pNav');
  nav.innerHTML = '';
  var groups = groupsOf();
  var list = beats.map(function(b, i){ return i; });
  if(groups.length > 1){
    var cur = beats[bi] && beats[bi].group;
    if(openGroup !== cur) openGroup = cur;
    var row1 = el('div', 'navrow gtabs');
    groups.forEach(function(g){
      var c = el('button', 'gchip' + (g.name === openGroup ? ' on' : ''), esc(g.name) + ' <i>' + g.idx.length + '</i>');
      c.title = g.name;
      c.onclick = function(){ hideSplash(); play(false); hush(); openGroup = g.name; bi = g.idx[0]; renderBeat(); if(voiceOn) say(beats[bi].caption || ''); };
      row1.appendChild(c);
    });
    nav.appendChild(row1);
    list = groups.filter(function(g){ return g.name === openGroup; })[0].idx;
  }
  var row = el('div', 'navrow pills');
  list.forEach(function(i, k){
    var b = beats[i];
    var p = el('button', 'pill' + (i === bi ? ' on' : (i < bi ? ' done' : '')), (k + 1) + '. ' + esc(b.title || ''));
    p.title = b.title || '';
    p.onclick = function(){ hideSplash(); play(false); hush(); bi = i; renderBeat(); if(voiceOn) say(beats[i].caption || ''); };
    row.appendChild(p);
  });
  nav.appendChild(row);
  var on = row.querySelector('.pill.on'); if(on && on.scrollIntoView && !REDUCED) { try { row.scrollLeft = Math.max(0, on.offsetLeft - 60); } catch(e){} }
}

document.getElementById('pTitle').innerHTML = ico(DATA.icon, 'big') + esc(DATA.title || '');
document.getElementById('pSub').textContent = DATA.subtitle || '';
var sc = DATA.scenario || {};
document.getElementById('pMeta').textContent = [sc.entity, sc.period, sc.vat].filter(Boolean).join(' \u00B7 ');
document.getElementById('pFoot').textContent = L.footer;
document.getElementById('bPrev').onclick = function(){ hideSplash(); play(false); hush(); stepBack(); };
document.getElementById('bNext').onclick = function(){ hideSplash(); var ls = groupLines(gIndex()); play(false); hush(); if(stepFwd() && voiceOn){ if(ls.length) sayAll(ls, function(){}); else say((beats[bi]||{}).caption || ''); } };
document.getElementById('bPlay').onclick = function(){ play(!playing); };
document.getElementById('bAll').textContent = L.showAll;
document.getElementById('bAll').onclick = function(){ showAll = !showAll; si = showAll ? steps.length : 0; paint(); };
(function(){
  var vb = document.getElementById('bVoice'), vs = document.getElementById('bVoiceSel');
  if(vs) vs.style.display = 'none';
  vb.onclick = function(){
    voiceOn = !voiceOn;
    vb.textContent = voiceOn ? '\u{1F50A}' : '\u{1F508}';
    vb.classList.toggle('pri', voiceOn);
    if(voiceOn){ say((beats[bi]||{}).caption || ''); }
    else { hush(); banner(null, ''); }
  };
})();
document.getElementById('bPrint').onclick = function(){ window.print(); };

/* ---------- read-aloud script pane (for Chrome read-aloud extensions) ---------- */
(function(){
  var pane = document.getElementById('scriptPane'), btn = document.getElementById('bScript');
  var af = (DATA.lang||'en').slice(0,2).toLowerCase() === 'af';
  var T = af
    ? { head:'Voorleesskrif', sel:'Merk hierdie teks', hint:'Merk die teks en gebruik jou voorlees-uitbreiding (regsklik \u2192 lees hardop), of laat die uitbreiding die hele bladsy lees.', all:'Hele les', one:'Hierdie stap' }
    : { head:'Read-aloud script', sel:'Select this text', hint:'Select the text, then use your read-aloud extension (right-click \u2192 read aloud), or let the extension read the whole page.', all:'Whole lesson', one:'This beat' };
  document.getElementById('scriptHead').textContent = T.head;
  document.getElementById('scriptHint').textContent = T.hint;
  document.getElementById('bSelAll').textContent = T.sel;
  var whole = false;
  function fill(){
    var body = document.getElementById('scriptBody');
    var list = whole ? beats : [beats[bi]];
    body.innerHTML = list.map(function(b, i){
      var n = beats.indexOf(b) + 1;
      var lines = [b.caption || ''].concat(b.narration || []).filter(Boolean);
      return '<p style="margin:0 0 4px"><b>' + n + '. ' + esc(b.title||'') + '</b></p>' +
             lines.map(function(l){ return '<p style="margin:0 0 10px">' + esc(l) + '</p>'; }).join('');
    }).join('<hr style="border:none;border-top:1px solid #E4E8EF;margin:14px 0">');
  }
  btn.onclick = function(){
    var open = pane.style.display === 'none';
    pane.style.display = open ? 'block' : 'none';
    btn.classList.toggle('pri', open);
    if(open){ fill(); if(pane.scrollIntoView) pane.scrollIntoView({behavior:'smooth', block:'nearest'}); }
  };
  document.getElementById('bSelAll').onclick = function(){
    var r = document.createRange();
    r.selectNodeContents(document.getElementById('scriptBody'));
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  document.getElementById('bSelAll').ondblclick = function(){ whole = !whole; fill(); };
  var _rb = renderBeat;
  renderBeat = function(){ _rb.apply(null, arguments); if(pane.style.display !== 'none') fill(); };
})();
document.addEventListener('keydown', function(e){
  if(e.key === 'ArrowRight'){ hideSplash(); play(false); stepFwd(); }
  if(e.key === 'ArrowLeft'){ hideSplash(); play(false); stepBack(); }
  if(e.key === ' '){ e.preventDefault(); play(!playing); }
});
play(false);
renderBeat();

/* ---------- time in the video ----------
   The player plays the lesson on a fixed timeline: each beat starts with its caption, then every group of elements
   appears together with its narration line, with a short pause after each line. The clock shows where the screen is
   on that timeline, and the page that hosts the player (the chat editor) can read it, so a change can be asked for
   "at 1:23" without knowing which beat that is. */
var LAYOUT = [], DUR = {}, GAP = 0.35, SILENT = 1.2;
function fmtT(t){ t = Math.max(0, Math.round(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
function estDur(text){ return Math.max(1.2, String(text).trim().split(/\s+/).length * 0.4); }
function dur(text){
  if(DUR[text] !== undefined) return DUR[text];
  return (NARR[text] || !DATA.embeddedAudioOnly) ? estDur(text) : 0;
}
function wavSeconds(uri){
  var b64 = uri.slice(uri.indexOf(',') + 1);
  var head = atob(b64.slice(0, 64));
  var rate = head.charCodeAt(28) | (head.charCodeAt(29) << 8) | (head.charCodeAt(30) << 16) | (head.charCodeAt(31) << 24);
  var pad = b64.slice(-2) === '==' ? 2 : (b64.slice(-1) === '=' ? 1 : 0);
  var bytes = Math.floor(b64.length * 3 / 4) - pad - 44;
  return rate > 0 && bytes > 0 ? bytes / rate : estDur('x x x');
}
function computeSchedule(){
  var t = BRAND ? INTRO_S : 0, out = {total:0, beats:[]};   /* the intro takes the first seconds */
  beats.forEach(function(b, i){
    var lay = LAYOUT[i] || {n:0, groups:[]}, start = t, items = [], reveals = [];
    var intro = [];
    if(b.caption) intro.push(b.caption);
    if(!lay.n) (b.narration || []).forEach(function(x){ if(x) intro.push(x); });
    intro.forEach(function(x, k){ items.push({t:t, kind:(k === 0 && b.caption) ? 'caption' : 'narration', text:x, blocks:[]}); t += dur(x); });
    lay.groups.forEach(function(g){
      reveals.push(t);
      if(g.lines.length){
        g.lines.forEach(function(x){ items.push({t:t, kind:'narration', text:x, blocks:g.blocks}); t += dur(x); });
        t += GAP;
      } else t += SILENT;
    });
    out.beats.push({start:start, end:t, reveals:reveals, items:items});
  });
  out.total = t + (BRAND ? OUTRO_S : 0);
  CLOCK = out;
  clockPaint();
  postHost({lessonTimeline: lightClock()});
}
function lightClock(){
  var r = function(x){ return Math.round(x * 10) / 10; };
  return {total:r(CLOCK.total), beats:CLOCK.beats.map(function(c, i){
    return {title:String((beats[i] || {}).title || '').slice(0, 80), start:r(c.start), end:r(c.end),
      blockTypes:((beats[i] || {}).blocks || []).map(function(x){ return x.type; }),
      items:c.items.map(function(it){ return {t:r(it.t), kind:it.kind, text:String(it.text).slice(0, 300), blocks:it.blocks}; })};
  })};
}
function posTime(){
  var c = CLOCK && CLOCK.beats[bi];
  if(!c || introOn) return 0;
  var g = gIndex();
  return g > 0 ? c.reveals[g - 1] : c.start;
}
function postHost(msg){ try { if(window.parent && window.parent !== window) window.parent.postMessage(msg, '*'); } catch(e){} }
function clockPaint(){
  if(!CLOCK) return;
  var t = posTime();
  var el_ = document.getElementById('bClock');
  if(el_) el_.textContent = fmtT(t) + ' / ' + fmtT(CLOCK.total);
  postHost({lessonPos:{t:Math.round(t * 10) / 10, total:Math.round(CLOCK.total * 10) / 10, beat:bi}});
}
window.addEventListener('message', function(e){
  if(e.data === 'lesson-timeline?' && CLOCK){ postHost({lessonTimeline: lightClock()}); clockPaint(); }
});
(function(){
  /* how every beat splits into groups, worked out once by laying each beat out */
  var keep = {bi:bi, showAll:showAll};
  showAll = true;
  beats.forEach(function(b, i){ bi = i; renderBeat(); LAYOUT[i] = {n:steps.length, groups:groups.map(function(g){ return {lines:g.lines, blocks:g.blocks, from:g.from, to:g.to}; })}; });
  bi = keep.bi; showAll = keep.showAll;
  /* how long each line is: exact for a WAV clip, read from the clip for an MP3 data URI, estimated otherwise */
  var texts = {};
  beats.forEach(function(b){ [b.caption].concat(b.narration || []).forEach(function(x){ if(x && String(x).trim()) texts[x] = 1; }); });
  var pending = 0;
  Object.keys(texts).forEach(function(x){
    var src = NARR[x];
    if(!src) return;
    if(/^data:audio\/(wav|x-wav)/.test(src)){ try { DUR[x] = wavSeconds(src); } catch(e){} }
    else if(/^data:audio\//.test(src)){
      pending++;
      var a = new Audio();
      var done = function(d){ if(d && isFinite(d)) DUR[x] = d; if(--pending === 0) computeSchedule(); };
      a.preload = 'metadata';
      a.onloadedmetadata = function(){ done(a.duration); };
      a.onerror = function(){ done(0); };
      a.src = src;
    }
  });
  computeSchedule();
})();
renderBeat();

(function(){
  var f = document.getElementById('bFull');
  if(!f) return;
  f.onclick = function(){
    var d = document, root = d.documentElement;
    try { if(!d.fullscreenElement && root.requestFullscreen) root.requestFullscreen(); else if(d.exitFullscreen) d.exitFullscreen(); } catch(e){}
  };
})();
/* the branded page opens on the intro */
if(BRAND) showSplash('intro');
