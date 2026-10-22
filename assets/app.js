/* ============================================================
   QCM Médecine — logique de l'application (vanilla JS, sans dépendance)
   ============================================================ */
(function () {
  "use strict";
  var D = window.QCM_DATA;
  var app = document.getElementById("app");
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ---------------- stockage (tolérant aux erreurs) ---------------- */
  function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var settings = Object.assign({ timer: false, timerMode: "question", timerQ: 90, timerT: 30, timerBank: false,
    instant: false, n: 20, includeGen: true }, load("qcm.settings", {}));
  var progress = load("qcm.progress", {});   // qid -> {s: score 0..1, t: timestamp}
  var lastPos = load("qcm.lastpos", {});     // "ue|mat" -> idx

  /* ---------------- utilitaires ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function md(s) {
    // texte -> HTML : **gras**, paragraphes, retours à la ligne
    var h = esc(s).replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
    return h.split(/\n{2,}/).map(function (p) { return "<p>" + p.replace(/\n/g, "<br>") + "</p>"; }).join("");
  }
  function inl(s) { return esc(s).replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>"); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function ueById(id) { return D.ues.filter(function (u) { return u.id === id; })[0]; }
  function matOf(ue, name) { return ue.mats.filter(function (m) { return m.name === name; })[0]; }
  function gradClass(c) { return "g-" + c; }
  var ARROW = '<svg class="arr" viewBox="0 0 24 24"><path d="M6 18L18 6M9 6h9v9"/></svg>';
  var CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var PREV = '<svg viewBox="0 0 24 24"><path d="M11 6v12L2 12zM21 6v12l-9-6z"/></svg>';
  var NEXT = '<svg viewBox="0 0 24 24"><path d="M3 6v12l9-6zM13 6v12l9-6z"/></svg>';

  /* score façon concours : 0 discordance = 1 ; 1 = 0,5 ; 2 = 0,2 ; 3+ = 0 */
  function scoreQ(q, sel) {
    var disc = 0;
    q.options.forEach(function (o) { if (!!o.correct !== !!sel[o.label]) disc++; });
    return disc === 0 ? 1 : disc === 1 ? 0.5 : disc === 2 ? 0.2 : 0;
  }
  function cls(s) { return s >= 1 ? "good" : s > 0 ? "mid" : "bad"; }
  function fmt(n) { return (Math.round(n * 100) / 100).toString().replace(".", ","); }

  /* ---------------- thème ---------------- */
  $("#themeBtn").addEventListener("click", function () {
    var t = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("qcm.theme", t); } catch (e) {}
  });
  $("#homeBtn").addEventListener("click", function () { go("#/"); });

  /* ---------------- routeur ---------------- */
  var session = null;
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  window.addEventListener("hashchange", route);
  function route() {
    stopTimer();
    var h = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    if (h[0] === "bank" && h[1] && h[2]) return startBank(h[1], h[2]);
    if (h[0] === "test" && h[1] && h[2]) {
      if (session && session.mode === "exam" && session.key === h[1] + "|" + h[2]) return renderQuiz();
      return startExam(h[1], h[2]);
    }
    if (h[0] === "results" && session && session.mode === "exam") return renderResults();
    session = null;
    renderHome();
  }

  /* ---------------- accueil ---------------- */
  function matStats(ids) {
    var done = 0, sum = 0, n = 0;
    ids.forEach(function (id) { if (D.q[id].cancelled) return; n++; var p = progress[id]; if (p) { done++; sum += p.s; } });
    return { n: n, done: done, pct: n ? done / n : 0, avg: done ? sum / done : 0 };
  }
  function renderHome() {
    $("#topTitle").textContent = "QCM Médecine";
    var total = 0, done = 0, sum = 0, gen = 0;
    Object.keys(D.q).forEach(function (id) { var q = D.q[id]; if (q.cancelled) return; total++; if (q.generated) gen++; var p = progress[id]; if (p) { done++; sum += p.s; } });
    var nMat = D.ues.reduce(function (a, u) { return a + u.mats.length; }, 0);
    var C = 2 * Math.PI * 70;
    var ringParts = D.ues.map(function (u) {
      var all = []; u.mats.forEach(function (m) { all = all.concat(m.ids); });
      return { u: u, st: matStats(all) };
    });
    var off = 0, arcs = "";
    ringParts.forEach(function (rp) {
      var frac = total ? rp.st.n / total : 0, len = frac * C * rp.st.pct, seg = frac * C;
      arcs += '<circle cx="85" cy="85" r="70" fill="none" stroke="url(#rg-' + rp.u.color + ')" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + Math.max(len, 0.001) + ' ' + C + '" stroke-dashoffset="' + (-off) + '"/>';
      off += seg;
    });
    var defs = ["cyan", "lime", "orange", "pink", "purple"].map(function (c) {
      return '<linearGradient id="rg-' + c + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--' + c + '-1)"/><stop offset="1" stop-color="var(--' + c + '-2)"/></linearGradient>';
    }).join("");

    var h = '<section class="hero fade-in">' +
      '<div class="card hero-main"><h1>Ta banque de <span>QCM</span></h1>' +
      '<p>Entraîne-toi matière par matière ou lance un test aléatoire de ' + settings.n + ' QCM. Coche les propositions justes, puis valide.</p>' +
      '<div class="hero-stats"><div class="hero-stat"><b>' + total + '</b><span>QCM</span></div>' +
      '<div class="hero-stat"><b>' + nMat + '</b><span>matières</span></div>' +
      '<div class="hero-stat"><b>' + done + '</b><span>déjà faits</span></div>' +
      '<div class="hero-stat"><b>' + (done ? Math.round(sum / done * 100) + "%" : "—") + '</b><span>réussite moyenne</span></div></div></div>' +
      '<div class="card hero-ring"><div class="ring"><svg viewBox="0 0 170 170"><defs>' + defs + '</defs>' +
      '<circle class="track" cx="85" cy="85" r="70" fill="none" stroke-width="14"/>' + arcs + '</svg>' +
      '<div class="ring-center"><b>' + (total ? Math.round(done / total * 100) : 0) + '%</b><span>de la banque parcourue</span></div></div>' +
      '<div class="ring-legend">' + ringParts.map(function (rp) {
        return '<div class="' + gradClass(rp.u.color) + '"><i class="dot"></i>' + esc(rp.u.name) + ' · ' + rp.st.done + '/' + rp.st.n + '</div>';
      }).join("") + '</div></div></section>';

    D.ues.forEach(function (u, ui) {
      h += '<section class="ue-block fade-in ' + gradClass(u.color) + '" style="animation-delay:' + (ui * 80) + 'ms">' +
        '<div class="ue-head"><div class="ue-badge">' + esc(u.name.replace("UE ", "").slice(0, 4)) + '</div><div><h2>' + esc(u.name) + '</h2><p>' + esc(u.sub) + '</p></div></div>' +
        '<div class="mat-grid">';
      u.mats.forEach(function (m) {
        var st = matStats(m.ids);
        var nGen = m.ids.filter(function (id) { return D.q[id].generated; }).length;
        h += '<div class="card mat-card"><div class="mat-top"><h3>' + esc(m.name) + '</h3><span class="mat-count">' + st.n + ' QCM' + (nGen ? ' · ' + nGen + ' ⚠' : '') + '</span></div>' +
          '<div class="bar"><i style="width:' + Math.round(st.pct * 100) + '%"></i></div>' +
          '<div class="mat-meta"><span>' + st.done + ' / ' + st.n + ' faits</span><span>' + (st.done ? 'réussite ' + Math.round(st.avg * 100) + '%' : 'pas encore commencé') + '</span></div>' +
          '<div class="mat-actions">' +
          '<a class="pill-btn flex1" style="text-decoration:none" href="#/bank/' + u.id + '/' + encodeURIComponent(m.name) + '">S\'entraîner' + ARROW + '</a>' +
          '<a class="pill-btn orange flex1" style="text-decoration:none" href="#/test/' + u.id + '/' + encodeURIComponent(m.name) + '">Test ' + settings.n + ' QCM' + ARROW + '</a>' +
          '</div></div>';
      });
      h += '</div></section>';
    });
    h += '<p class="kbd-hint">Les QCM marqués <b style="color:var(--warn)">⚠</b> ont été complétés par Claude (items ajoutés). Les données sont enregistrées uniquement sur cet appareil.</p>';
    app.innerHTML = h;
    window.scrollTo(0, 0);
  }

  /* ---------------- sessions ---------------- */
  function startBank(ueId, matName) {
    var ue = ueById(ueId), m = ue && matOf(ue, matName);
    if (!m) return go("#/");
    var key = ueId + "|" + matName;
    session = { mode: "bank", key: key, ue: ue, mat: m, all: m.ids.slice(), list: m.ids.slice(), idx: 0, sel: {}, done: {}, src: "" };
    var li = lastPos[key];
    if (typeof li === "number" && li < session.list.length) session.idx = li;
    renderQuiz();
  }

  /* Construction d'un test aléatoire :
     - les questions isolées sont des unités d'une question ;
     - les questions d'un dossier (énoncé commun) restent ensemble, dans l'ordre, par blocs consécutifs
       (jamais de question isolée de son dossier : le bloc d'info initial + les précisions précédentes sont affichés). */
  function startExam(ueId, matName) {
    var ue = ueById(ueId), m = ue && matOf(ue, matName);
    if (!m) return go("#/");
    var ids = m.ids.filter(function (id) { var q = D.q[id]; return !q.cancelled && (settings.includeGen || !q.generated); });
    var units = [], seen = {};
    ids.forEach(function (id) {
      var q = D.q[id];
      if (!q.group) { units.push([id]); return; }
      if (seen[q.group]) return;
      seen[q.group] = 1;
      var gq = ids.filter(function (x) { return D.q[x].group === q.group; });
      // découpe en blocs consécutifs de 3 à 6 questions
      var i = 0;
      while (i < gq.length) {
        var size = gq.length - i <= 6 ? gq.length - i : 3 + Math.floor(Math.random() * 3);
        units.push(gq.slice(i, i + size)); i += size;
      }
    });
    shuffle(units);
    var N = settings.n, list = [];
    for (var u = 0; u < units.length && list.length < N; u++) {
      var room = N - list.length;
      list = list.concat(units[u].slice(0, room)); // un bloc tronqué reste consécutif depuis son début
    }
    session = { mode: "exam", key: ueId + "|" + matName, ue: ue, mat: m, list: list, idx: 0, sel: {}, done: {}, finished: false, started: Date.now() };
    if (settings.timer && settings.timerMode === "total") session.deadline = Date.now() + settings.timerT * 60000;
    renderQuiz();
  }

  /* ---------------- timer ---------------- */
  var tick = null;
  function stopTimer() { if (tick) { clearInterval(tick); tick = null; } }
  function timerSpec() {
    if (!settings.timer || !session) return null;
    if (session.mode === "exam" && session.finished) return null;
    if (session.mode === "exam" && settings.timerMode === "total") return { total: settings.timerT * 60, end: session.deadline };
    var qid = session.list[session.idx];
    if (session.done[qid]) return null;
    if (session.mode === "bank" && !settings.timerBank) return null;
    if (session.mode === "exam" && session.done[qid] === undefined && session.qEnd && session.qEnd[qid] === -1) return null;
    session.qEnd = session.qEnd || {};
    if (!session.qEnd[qid]) session.qEnd[qid] = Date.now() + settings.timerQ * 1000;
    return { total: settings.timerQ, end: session.qEnd[qid], perQ: true, qid: qid };
  }
  function timerHTML() {
    return '<div class="timer" id="timer" title="Temps restant"><svg viewBox="0 0 60 60"><defs><linearGradient id="tgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--cyan-1)"/><stop offset="1" stop-color="var(--cyan-2)"/></linearGradient></defs>' +
      '<circle class="track" cx="30" cy="30" r="25" fill="none" stroke-width="6"/><circle class="arc" cx="30" cy="30" r="25" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="157.1" stroke-dashoffset="0"/></svg><span></span></div>';
  }
  function runTimer(spec) {
    stopTimer();
    var el = $("#timer"); if (!el) return;
    function upd() {
      var left = Math.max(0, Math.round((spec.end - Date.now()) / 1000));
      var mm = Math.floor(left / 60), ss = left % 60;
      el.querySelector("span").textContent = mm + ":" + (ss < 10 ? "0" : "") + ss;
      el.querySelector(".arc").setAttribute("stroke-dashoffset", (157.1 * (1 - left / spec.total)).toFixed(1));
      el.classList.toggle("low", left <= Math.min(10, spec.total * 0.15));
      if (left <= 0) {
        stopTimer();
        if (spec.perQ) {
          if (session.mode === "exam" && !settings.instant) { session.qEnd[spec.qid] = -1; lockQ(spec.qid); if (session.idx < session.list.length - 1) { session.idx++; renderQuiz(); } else renderQuiz(); }
          else validate();
        } else finishExam();
      }
    }
    upd(); tick = setInterval(upd, 1000);
  }
  function lockQ(qid) { session.locked = session.locked || {}; session.locked[qid] = true; }

  /* ---------------- écran question ---------------- */
  function srcList() {
    var s = [];
    session.all.forEach(function (id) { var x = D.q[id].source; if (s.indexOf(x) < 0) s.push(x); });
    return s;
  }
  function renderQuiz() {
    if (!session) return go("#/");
    var S = session, qid = S.list[S.idx], q = D.q[qid];
    if (!q) { app.innerHTML = '<div class="card empty">Aucune question.</div>'; return; }
    var exam = S.mode === "exam";
    var sel = S.sel[qid] || (S.sel[qid] = {});
    var showCorr = exam ? (S.finished || (settings.instant && S.done[qid])) : !!S.done[qid];
    var locked = showCorr || q.cancelled || (S.locked && S.locked[qid]);
    $("#topTitle").textContent = S.mat.name + (exam ? " · Test" : " · Entraînement");
    if (!exam) { lastPos[S.key] = S.idx; save("qcm.lastpos", lastPos); }

    var spec = timerSpec();
    var h = '<div class="fade-in ' + gradClass(S.ue.color) + '">';
    h += '<div class="qhead"><div class="crumbs"><small>' + esc(S.ue.name) + ' — ' + esc(S.ue.sub) + '</small><b>' + esc(S.mat.name) + '</b><span class="mode-tag">' + (exam ? "Test" : "Entraînement") + '</span></div>';
    if (!exam && srcList().length > 1) {
      h += '<select class="src-select" id="srcSel" aria-label="Filtrer par source"><option value="">Toutes les sources (' + S.all.length + ')</option>' +
        srcList().map(function (s) { var n = S.all.filter(function (id) { return D.q[id].source === s; }).length; return '<option value="' + esc(s) + '"' + (S.src === s ? " selected" : "") + '>' + esc(s) + ' (' + n + ')</option>'; }).join("") + '</select>';
    }
    if (spec) h += timerHTML();
    h += '</div>';

    var pct = S.list.length > 1 ? S.idx / (S.list.length - 1) * 100 : 100;
    h += '<div class="progress"><div class="progress-meta"><span>Question ' + (S.idx + 1) + ' / ' + S.list.length + '</span><span>' + Object.keys(S.done).length + ' validée(s)</span></div>' +
      '<div class="ptrack"><i style="width:' + pct + '%"></i><b style="left:' + pct + '%"></b></div></div>';

    h += '<article class="card qcard">';
    h += '<div class="qnum"><span class="num">' + esc(q.num || ("Question " + (S.idx + 1))) + '</span><span class="mat">' + esc(q.matiere) + '</span><span class="src">· ' + esc(q.source) + '</span>';
    if (q.generated) h += '<span class="chip-warn" title="' + esc(q.generatedNote) + '">⚠ Items ajoutés par Claude</span>';
    if (q.claudeCorrection) h += '<span class="chip-warn" title="Pas de correction dans la source">⚠ Correction proposée par Claude</span>';
    if (q.cancelled) h += '<span class="chip-cancel">Question annulée</span>';
    h += '</div>';
    if (q.generated) {
      var orig = q.options.filter(function (o) { return !o.added; }).map(function (o) { return o.label; }).join(", ");
      h += '<div class="warn-box"><b>⚠ Attention :</b> ' + esc(q.generatedNote || "") +
        (orig && q.options.some(function (o) { return o.added; }) ? ' <br>Item(s) d\'origine : <b>' + orig + '</b>. Les autres items (marqués « ajouté ») ont été rédigés par Claude.' : '') + '</div>';
    }
    if (q.claudeCorrection) h += '<div class="warn-box"><b>⚠ Correction non fournie par la source :</b> la correction affichée a été proposée par Claude, à vérifier avec le cours.</div>';
    if (q.note) h += '<div class="note-box">ℹ️ ' + inl(q.note) + '</div>';

    // dossier / énoncé commun
    if (q.group && D.g[q.group]) {
      var g = D.g[q.group];
      var gopen = load("qcm.dossierOpen", true);
      var prev = g.q.slice(0, g.q.indexOf(qid)).map(function (x) { return D.q[x]; }).filter(function (x) { return x.pre && x.pre.trim(); });
      h += '<details class="dossier" id="dossier"' + (gopen ? " open" : "") + '><summary><i class="dot"></i>Dossier : ' + esc(g.title) + '<span class="chev">▾</span></summary><div class="dossier-body">' + md(g.context);
      if (g.images && g.images.length) h += '<div class="figs">' + g.images.map(function (s) { return '<img src="' + esc(s) + '" alt="Figure du dossier" loading="lazy">'; }).join("") + '</div>';
      prev.forEach(function (x) { h += '<div class="precis"><small>Précision — ' + esc(x.num) + '</small>' + md(x.pre) + '</div>'; });
      h += '</div></details>';
      if (q.pre && q.pre.trim()) h += '<div class="pre-now"><small>Nouvelles informations</small>' + md(q.pre) + '</div>';
    } else if (q.pre && q.pre.trim()) {
      h += '<div class="pre-now">' + md(q.pre) + '</div>';
    }

    h += '<div class="stem">' + md(q.stem) + '</div>';
    if (q.images && q.images.length) h += '<div class="figs">' + q.images.map(function (s) { return '<img src="' + esc(s) + '" alt="Figure de la question" loading="lazy">'; }).join("") + '</div>';

    h += '<div class="opts' + (locked ? " done" : "") + '" id="opts">';
    q.options.forEach(function (o) {
      var c = "opt" + (sel[o.label] ? " sel" : "");
      var verdict = "";
      if (showCorr && !q.cancelled) {
        if (o.correct && sel[o.label]) { c += " c-ok-sel"; verdict = "Juste"; }
        else if (!o.correct && sel[o.label]) { c += " c-ko-sel"; verdict = "Faux · coché"; }
        else if (o.correct && !sel[o.label]) { c += " c-ok-miss"; verdict = "Juste · oublié"; }
        else { c += " c-ko-ok"; verdict = "Faux"; }
      }
      h += '<div class="' + c + '"><button class="opt-btn" data-l="' + esc(o.label) + '"' + (locked ? ' tabindex="-1"' : '') + '>' +
        '<span class="box">' + CHECK + '</span><span class="opt-letter">' + esc(o.label) + '</span><span class="opt-text">' + inl(o.text) +
        (o.added ? '<span class="added-tag" title="Item rédigé par Claude">⚠ ajouté</span>' : '') + '</span>' +
        (verdict ? '<span class="verdict">' + verdict + '</span>' : '') + '</button>';
      if (showCorr && o.justif) h += '<div class="justif">' + inl(o.justif) + '</div>';
      h += '</div>';
    });
    h += '</div>';

    if (showCorr && !q.cancelled) {
      var sc = scoreQ(q, sel);
      var good = q.options.filter(function (o) { return o.correct; }).map(function (o) { return o.label; }).join("");
      h += '<div class="result-banner ' + cls(sc) + '"><span class="score">' + fmt(sc) + ' / 1</span><span>' +
        (sc === 1 ? "Parfait, toutes les propositions sont correctes !" : sc > 0 ? "Presque : une ou deux discordances." : "Raté : relis la correction.") +
        ' Réponse : <b>' + good + '</b></span></div>';
      h += '<div class="legend"><span><i class="lg1"></i>coché et juste</span><span><i class="lg2"></i>coché mais faux</span><span><i class="lg3"></i>juste, non coché</span><span><i class="lg4"></i>faux, non coché</span></div>';
      var xi = q.explImages || [];
      if ((q.explanation && q.explanation.trim()) || xi.length) h += '<div class="explain"><h4>Correction</h4>' + md(q.explanation || "") +
        (xi.length ? '<div class="figs">' + xi.map(function (s) { return '<img src="' + esc(s) + '" alt="Schéma de correction" loading="lazy">'; }).join("") + '</div>' : '') + '</div>';
    } else if (exam && S.done[qid] && !showCorr) {
      h += '<div class="note-box">✔ Réponse enregistrée — la correction s\'affichera à la fin du test.</div>';
    } else if (exam && S.locked && S.locked[qid] && !S.done[qid]) {
      h += '<div class="note-box">⏱ Temps écoulé pour cette question.</div>';
    }

    // navigation
    var last = S.idx === S.list.length - 1;
    h += '<div class="qnav"><button class="navbtn prev" id="prevBtn"' + (S.idx === 0 ? " disabled" : "") + '>' + PREV + '<span>Précédente</span></button><div class="center">';
    if (q.cancelled) { /* rien à valider */ }
    else if (!exam) {
      h += S.done[qid] ? '<button class="big-btn purple" id="retryBtn">Recommencer</button>' : '<button class="big-btn lime" id="valBtn">Valider</button>';
    } else if (!S.finished) {
      if (!S.done[qid] && !(S.locked && S.locked[qid])) h += '<button class="big-btn lime" id="valBtn">Valider</button>';
      if (last || Object.keys(S.done).length === S.list.length) h += '<button class="big-btn orange" id="finishBtn">Terminer le test</button>';
    } else {
      h += '<button class="big-btn orange" id="resBtn">Résultats</button>';
    }
    h += '</div><button class="navbtn next" id="nextBtn"' + (last ? " disabled" : "") + '><span>Suivante</span>' + NEXT + '</button></div>';
    h += '</article>';

    // grille
    h += '<nav class="card qgrid" aria-label="Questions">';
    S.list.forEach(function (id, i) {
      var x = D.q[id], c = "qdot";
      if (i === S.idx) c += " cur";
      if (x.group) c += " grp";
      if (x.generated) c += " gen";
      var corrShown = exam ? (S.finished || (settings.instant && S.done[id])) : S.done[id];
      if (corrShown && !x.cancelled && S.done[id]) c += " s-" + cls(scoreQ(x, S.sel[id] || {}));
      else if (S.done[id]) c += " ans";
      else if (!exam && progress[id]) c += " s-" + cls(progress[id].s);
      h += '<button class="' + c + '" data-i="' + i + '" title="' + esc(x.num) + '">' + (i + 1) + '</button>';
    });
    h += '</nav>';
    h += '<p class="kbd-hint">Raccourcis : <kbd>A</kbd>–<kbd>F</kbd> cocher · <kbd>Entrée</kbd> valider · <kbd>←</kbd> <kbd>→</kbd> naviguer</p>';
    h += '</div>';
    app.innerHTML = h;

    // évènements
    if (!locked) app.querySelectorAll(".opt-btn").forEach(function (b) {
      b.addEventListener("click", function () { toggle(b.getAttribute("data-l")); });
    });
    on("#prevBtn", function () { S.idx--; renderQuiz(); scrollTopQ(); });
    on("#nextBtn", function () { S.idx++; renderQuiz(); scrollTopQ(); });
    on("#valBtn", validate);
    on("#retryBtn", function () { delete S.done[qid]; S.sel[qid] = {}; if (S.qEnd) delete S.qEnd[qid]; renderQuiz(); });
    on("#finishBtn", function () {
      var left = S.list.length - Object.keys(S.done).length;
      if (left > 0 && !confirmInline(left)) return;
      finishExam();
    });
    on("#resBtn", function () { go("#/results"); });
    on("#srcSel", function () {}, "change");
    var ss = $("#srcSel");
    if (ss) ss.addEventListener("change", function () {
      S.src = ss.value;
      S.list = S.all.filter(function (id) { return !S.src || D.q[id].source === S.src; });
      S.idx = 0; renderQuiz();
    });
    app.querySelectorAll(".qdot").forEach(function (b) { b.addEventListener("click", function () { S.idx = +b.getAttribute("data-i"); renderQuiz(); scrollTopQ(); }); });
    app.querySelectorAll(".figs img").forEach(function (im) { im.addEventListener("click", function () { var lb = $("#lightbox"); lb.querySelector("img").src = im.src; lb.hidden = false; }); });
    var dz = $("#dossier"); if (dz) dz.addEventListener("toggle", function () { save("qcm.dossierOpen", dz.open); });
    if (spec) runTimer(spec);
  }
  var finishArmed = 0;
  function confirmInline(left) {
    // double clic pour confirmer s'il reste des questions (pas de boîte de dialogue bloquante)
    var b = $("#finishBtn");
    if (Date.now() - finishArmed < 4000) return true;
    finishArmed = Date.now();
    if (b) { b.textContent = left + " sans réponse — cliquer pour confirmer"; }
    return false;
  }
  function on(sel, fn, ev) { var e = $(sel); if (e) e.addEventListener(ev || "click", fn); }
  function scrollTopQ() { var c = $(".qhead"); if (c && c.getBoundingClientRect().top < 0) c.scrollIntoView({ behavior: "smooth" }); }

  function toggle(l) {
    var S = session, qid = S.list[S.idx];
    var sel = S.sel[qid] || (S.sel[qid] = {});
    if (sel[l]) delete sel[l]; else sel[l] = true;
    var o = app.querySelector('.opt-btn[data-l="' + l + '"]');
    if (o) o.parentNode.classList.toggle("sel", !!sel[l]);
  }
  function validate() {
    var S = session, qid = S.list[S.idx], q = D.q[qid];
    if (!S || S.done[qid] || q.cancelled) return;
    S.done[qid] = true;
    stopTimer();
    var sc = scoreQ(q, S.sel[qid] || {});
    progress[qid] = { s: sc, t: Date.now() }; save("qcm.progress", progress);
    if (S.mode === "exam" && !settings.instant) {
      if (S.idx < S.list.length - 1) { S.idx++; renderQuiz(); scrollTopQ(); return; }
    }
    renderQuiz();
  }
  function finishExam() {
    var S = session; if (!S || S.mode !== "exam") return;
    stopTimer();
    S.list.forEach(function (id) {
      if (!S.done[id]) { S.done[id] = true; progress[id] = { s: scoreQ(D.q[id], S.sel[id] || {}), t: Date.now() }; }
    });
    save("qcm.progress", progress);
    S.finished = true; S.ended = Date.now();
    go("#/results");
  }

  /* ---------------- résultats ---------------- */
  function renderResults() {
    var S = session;
    $("#topTitle").textContent = S.mat.name + " · Résultats";
    var tot = 0, n = S.list.length;
    S.list.forEach(function (id) { tot += scoreQ(D.q[id], S.sel[id] || {}); });
    var pct = n ? tot / n : 0, C = 2 * Math.PI * 70;
    var dur = Math.round(((S.ended || Date.now()) - S.started) / 1000);
    var h = '<div class="fade-in ' + gradClass(S.ue.color) + '"><div class="card res-top"><div class="ring"><svg viewBox="0 0 170 170"><defs><linearGradient id="rgr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--g1)"/><stop offset="1" stop-color="var(--g2)"/></linearGradient></defs>' +
      '<circle class="track" cx="85" cy="85" r="70" fill="none" stroke-width="14"/><circle cx="85" cy="85" r="70" fill="none" stroke="url(#rgr)" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (C * pct) + ' ' + C + '"/></svg>' +
      '<div class="ring-center"><b>' + fmt(tot) + '</b><span>sur ' + n + '</span></div></div>' +
      '<div><h2>' + (pct >= .8 ? "Excellent !" : pct >= .5 ? "Pas mal !" : "Continue, ça vient !") + '</h2>' +
      '<p class="muted">' + esc(S.ue.name) + ' · ' + esc(S.mat.name) + ' — ' + Math.round(pct * 100) + '% en ' + Math.floor(dur / 60) + ' min ' + (dur % 60) + ' s</p>' +
      '<p class="muted" style="font-size:.82rem">Barème : 0 discordance = 1 pt · 1 discordance = 0,5 · 2 = 0,2 · 3 et plus = 0.</p>' +
      '<div class="res-actions"><button class="big-btn orange" id="againBtn">Nouveau test</button><button class="pill-btn" id="reviewBtn">Revoir la correction' + ARROW + '</button><button class="pill-btn lime" id="homeBtn2">Accueil' + ARROW + '</button></div></div></div>';
    h += '<div class="res-list">';
    S.list.forEach(function (id, i) {
      var q = D.q[id], s = scoreQ(q, S.sel[id] || {});
      h += '<button class="res-item ' + cls(s) + '" data-i="' + i + '"><span class="pts">' + fmt(s) + '</span><span class="t"><b>' + (i + 1) + '.</b> ' + (q.group && D.g[q.group] ? '<span class="muted">[' + esc(D.g[q.group].title) + '] </span>' : '') + (q.generated ? "⚠ " : "") + esc(q.stem) + '</span></button>';
    });
    h += '</div></div>';
    app.innerHTML = h;
    window.scrollTo(0, 0);
    on("#againBtn", function () { var k = S.key.split("|"); session = null; startExam(k[0], k[1]); location.hash = "#/test/" + k[0] + "/" + encodeURIComponent(k[1]); });
    on("#reviewBtn", function () { S.idx = 0; location.hash = "#/test/" + S.key.split("|")[0] + "/" + encodeURIComponent(S.key.split("|")[1]); });
    on("#homeBtn2", function () { go("#/"); });
    app.querySelectorAll(".res-item").forEach(function (b) {
      b.addEventListener("click", function () { S.idx = +b.getAttribute("data-i"); location.hash = "#/test/" + S.key.split("|")[0] + "/" + encodeURIComponent(S.key.split("|")[1]); });
    });
  }

  /* ---------------- clavier ---------------- */
  document.addEventListener("keydown", function (e) {
    if (!$("#settingsModal").hidden || !$("#lightbox").hidden) { if (e.key === "Escape") closeAll(); return; }
    if (!session || !$("#opts") || e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toUpperCase();
    if (/^[A-H]$/.test(k) && !$("#opts").classList.contains("done")) { var b = app.querySelector('.opt-btn[data-l="' + k + '"]'); if (b) { e.preventDefault(); toggle(k); } }
    else if (/^[1-8]$/.test(k) && !$("#opts").classList.contains("done")) { var L = "ABCDEFGH"[+k - 1]; if (app.querySelector('.opt-btn[data-l="' + L + '"]')) toggle(L); }
    else if (e.key === "Enter") { var v = $("#valBtn"); if (v) { e.preventDefault(); v.click(); } }
    else if (e.key === "ArrowRight") { var n = $("#nextBtn"); if (n && !n.disabled) n.click(); }
    else if (e.key === "ArrowLeft") { var p = $("#prevBtn"); if (p && !p.disabled) p.click(); }
  });

  /* ---------------- paramètres ---------------- */
  var M = $("#settingsModal");
  function closeAll() { M.hidden = true; $("#lightbox").hidden = true; }
  $("#lightbox").addEventListener("click", function () { this.hidden = true; });
  M.addEventListener("click", function (e) { if (e.target === M || e.target.hasAttribute("data-close")) closeAll(); });
  $("#settingsBtn").addEventListener("click", function () { syncSettings(); M.hidden = false; });
  function syncSettings() {
    $("#setTimer").checked = settings.timer;
    $("#timerOpts").classList.toggle("off", !settings.timer);
    M.querySelectorAll("#setTimerMode button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === settings.timerMode); });
    $("#setTimerQ").value = settings.timerQ; $("#setTimerT").value = settings.timerT;
    $("#setTimerQ").parentNode.style.display = settings.timerMode === "question" ? "" : "none";
    $("#setTimerT").parentNode.style.display = settings.timerMode === "total" ? "" : "none";
    var s = settings.timerQ; $("#setTimerQOut").textContent = (s >= 60 ? Math.floor(s / 60) + " min " + (s % 60 ? s % 60 + " s" : "") : s + " s") + " / question";
    $("#setTimerTOut").textContent = settings.timerT + " min pour le test";
    $("#setTimerBank").checked = settings.timerBank;
    $("#setInstant").checked = settings.instant;
    $("#setN").textContent = settings.n;
    $("#setGen").checked = settings.includeGen;
  }
  function commit() { save("qcm.settings", settings); syncSettings(); }
  $("#setTimer").addEventListener("change", function () { settings.timer = this.checked; commit(); });
  M.querySelectorAll("#setTimerMode button").forEach(function (b) { b.addEventListener("click", function () { settings.timerMode = b.getAttribute("data-v"); commit(); }); });
  $("#setTimerQ").addEventListener("input", function () { settings.timerQ = +this.value; commit(); });
  $("#setTimerT").addEventListener("input", function () { settings.timerT = +this.value; commit(); });
  $("#setTimerBank").addEventListener("change", function () { settings.timerBank = this.checked; commit(); });
  $("#setInstant").addEventListener("change", function () { settings.instant = this.checked; commit(); });
  $("#setGen").addEventListener("change", function () { settings.includeGen = this.checked; commit(); });
  $("#nMinus").addEventListener("click", function () { settings.n = Math.max(5, settings.n - 5); commit(); });
  $("#nPlus").addEventListener("click", function () { settings.n = Math.min(60, settings.n + 5); commit(); });
  var resetArm = 0;
  $("#resetBtn").addEventListener("click", function () {
    if (Date.now() - resetArm > 4000) { resetArm = Date.now(); this.textContent = "Confirmer ?"; return; }
    progress = {}; lastPos = {}; save("qcm.progress", progress); save("qcm.lastpos", lastPos);
    this.textContent = "Effacé ✓"; if (!session) renderHome();
  });
  M.addEventListener("transitionend", function () {});
  // quand on ferme les paramètres, on rafraîchit l'accueil (nombre de QCM par test)
  new MutationObserver(function () { if (M.hidden && !session) renderHome(); }).observe(M, { attributes: true, attributeFilter: ["hidden"] });

  route();
})();
