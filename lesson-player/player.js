var DATA = JSON.parse(document.getElementById('lessonData').textContent);

var DEF = {
  en:{date:'Date',doc:'Doc no',details:'Details',fol:'Fol',debit:'Debit',credit:'Credit',balance:'Balance',
      total:'Total',totals:'Totals',balCd:'Balance c/d',balBd:'Balance b/d',play:'Play',pause:'Pause',
      showAll:'Show all',step:'Step',of:'of',correct:'Correct',wrong:'Not quite',continue:'Continue',
      assets:'Assets',oe:'Owner\u2019s equity',liab:'Liabilities',accDr:'Account debited',accCr:'Account credited',
      balanced:'Debits = Credits',unbalanced:'Debits do not equal credits',excerpt:'Extract only \u2014 totals are not expected to balance',footer:'Generated with Accounting Explainer Studio'},
  af:{date:'Datum',doc:'Dok. nr.',details:'Besonderhede',fol:'Fol',debit:'Debiet',credit:'Krediet',balance:'Saldo',
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
  var lines = d.lines || [];
  var showQty = lines.some(function(l){ return l.qty !== undefined && l.qty !== null; });
  var h = '<div class="dh"><div><div class="dt">' + esc(d.docType||'') + '</div>' +
          (d.from ? '<div style="font-size:.8rem">' + esc(d.from) + '</div>' : '') + '</div>' +
          '<div class="dn">' + esc(L.doc) + '<b>' + esc(d.docNo||'') + '</b>' + esc(d.date||'') + '</div></div>';
  if(d.to) h += '<div class="party"><b>' + esc(d.toLabel || 'To') + ':</b> ' + esc(d.to) + '</div>';
  if(lines.length){
    h += '<table><thead><tr><th style="text-align:left">' + esc(L.details) + '</th>' +
         (showQty ? '<th class="num">Qty</th><th class="num">' + esc(CUR) + '</th>' : '') +
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
  wrap.appendChild(el('div','chk ' + (ok?'ok':'info'), (ok?'\u2713 ':'') + esc(L.assets) + ' ' + sgn(A) + ' \u00B7 ' + esc(L.oe) + ' + ' + esc(L.liab) + ' ' + sgn(O + Li) + (ok ? '' : ' \u2014 ' + esc(L.excerpt))));
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
  wrap.appendChild(el('div','chk ' + (ok?'ok':'info'), (ok?'\u2713 ' + esc(L.balanced) : esc(L.excerpt) + ': ' + fmt(d) + ' \u00B7 ' + fmt(c))));
  return wrap;
}

function rText(b){
  var e = el('div','callout ' + (b.tone||''));
  e.innerHTML = (b.heading ? '<b>' + esc(b.heading) + '</b>' : '') + esc(b.body||'').replace(/\n/g,'<br>');
  return e;
}

function rFlow(b){
  var f = el('div','flow');
  (b.steps||[]).forEach(function(s, i){
    if(i) f.appendChild(el('div','arw','\u2192'));
    var st = el('div','step');
    st.innerHTML = '<b>' + esc(s.label||'') + '</b>' + esc(s.text||'');
    f.appendChild(st);
  });
  return f;
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
  text: rText, flow: rFlow, calculation: rCalc
};

/* ---------- player ---------- */

var beats = DATA.beats || [];
var bi = 0, steps = [], si = 0, timer = null, playing = false, showAll = false;
var STEP_MS = 3300;   /* seconds per revealed line while playing */

function renderBeat(){
  var b = beats[bi] || {};
  var st = document.getElementById('pStage');
  st.innerHTML = '';
  st.appendChild(el('h2', null, '<span class="num">' + (bi+1) + '.</span>' + esc(b.title||'')));
  if(b.note) st.appendChild(el('div','stageNote', esc(b.note)));
  (b.blocks||[]).forEach(function(blk){
    var fn = RENDER[blk.type];
    if(!fn) return;
    var w = el('div','block');
    var selfCaption = ['journal','ledger_columnar','equation','trial_balance','calculation'].indexOf(blk.type) > -1;
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
    st.appendChild(el('div','chk ' + (glOk ? 'ok' : 'info'),
      (glOk ? '\u2713 ' + esc(L.balanced) : esc(L.excerpt)) + ': ' + esc(L.debit) + ' ' + fmt(glDr) + ' \u00B7 ' + esc(L.credit) + ' ' + fmt(glCr)));
  }
  if(b.quiz) st.appendChild(quizEl(b.quiz));
  steps = Array.prototype.slice.call(st.querySelectorAll('[data-reveal]'));
  si = showAll ? steps.length : 0;
  paint();
  document.getElementById('pCap').textContent = b.caption || '';
  navPaint();
}

function paint(){
  steps.forEach(function(r, i){ r.classList.toggle('hide', i >= si); });
  var pct = steps.length ? Math.round(si / steps.length * 100) : 100;
  document.getElementById('bFill').style.width = pct + '%';
  document.getElementById('bPrev').disabled = (bi === 0 && si === 0);
  document.getElementById('bNext').disabled = (bi === beats.length - 1 && si >= steps.length);
}

function stepFwd(){
  if(si < steps.length){
    si++;
    var r = steps[si-1];
    r.classList.remove('hide');
    r.classList.add('pop');
    setTimeout(function(){ r.classList.remove('pop'); }, 460);
    paint();
    return true;
  }
  if(bi < beats.length - 1){ bi++; renderBeat(); return true; }
  return false;
}
function stepBack(){
  if(si > 0){ si--; paint(); return; }
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
  if(NARR[text]){ banner(null, ''); play(NARR[text].indexOf('data:') === 0 ? NARR[text] : 'data:audio/mpeg;base64,' + NARR[text]); return; }
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

/* what to say for the line that is about to be revealed */
function lineFor(i){
  var b = beats[bi] || {};
  var n = b.narration || [];
  return n[i] || null;
}

function tick(){
  if(!playing) return;
  var line = lineFor(si);
  var atEnd = (si >= steps.length);
  if(!stepFwd()){ play(false); return; }
  if(atEnd){                       /* we moved to a new beat: read its caption first */
    var b = beats[bi] || {};
    if(voiceOn && b.caption){ say(b.caption, function(){ if(playing) tick(); }); return; }
  } else if(voiceOn && line){
    say(line, function(){ if(playing) setTimeout(tick, 350); });
    return;
  }
  timer = setTimeout(tick, voiceOn ? 1200 : STEP_MS);
}

function play(on){
  playing = on;
  document.getElementById('bPlay').textContent = on ? ('\u23F8 ' + L.pause) : ('\u25B6 ' + L.play);
  clearTimeout(timer);
  if(!on){ hush(); return; }
  var b = beats[bi] || {};
  if(voiceOn && si === 0 && b.caption && !spoke[bi]){
    spoke[bi] = 1;
    say(b.caption, function(){ if(playing) tick(); });
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

function navPaint(){
  var nav = document.getElementById('pNav');
  nav.innerHTML = '';
  beats.forEach(function(b, i){
    var p = el('button','pill' + (i === bi ? ' on' : (i < bi ? ' done' : '')), (i+1) + '. ' + esc(b.title||''));
    p.onclick = function(){ play(false); hush(); bi = i; renderBeat(); if(voiceOn) say(beats[i].caption || ''); };
    nav.appendChild(p);
  });
}

document.getElementById('pTitle').textContent = DATA.title || '';
document.getElementById('pSub').textContent = DATA.subtitle || '';
var sc = DATA.scenario || {};
document.getElementById('pMeta').textContent = [sc.entity, sc.period, sc.vat].filter(Boolean).join(' \u00B7 ');
document.getElementById('pFoot').textContent = L.footer;
document.getElementById('bPrev').onclick = function(){ play(false); hush(); stepBack(); };
document.getElementById('bNext').onclick = function(){ var l = lineFor(si); play(false); hush(); if(stepFwd() && voiceOn) say(l || (beats[bi]||{}).caption || ''); };
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
  if(e.key === 'ArrowRight'){ play(false); stepFwd(); }
  if(e.key === 'ArrowLeft'){ play(false); stepBack(); }
  if(e.key === ' '){ e.preventDefault(); play(!playing); }
});
play(false);
renderBeat();
