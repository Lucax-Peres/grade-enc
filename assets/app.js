/*
 * Grade ENC — lógica da página.
 * Organização:
 *   1. Modelo (catálogo + o que você editou)      5. Visualização em lista (celular)
 *   2. Semestres e planejamento                    6. Resumo e previsão
 *   3. Navegação por abas (celular)                7. Gaveta de edição
 *   4. Fluxograma (SVG + cartões)                  8. Persistência, backup e PWA
 */
(function () {
  "use strict";

  // ===================== 1. MODELO =====================
  const { CAT, PRE, BASE_DONE, BASE_CUR, BASE_PLAN } = GRADE;
  const BYCODE = {};
  CAT.forEach(([code, name, h, col, row]) => (BYCODE[code] = { code, name, h, col, row }));
  const CODES = CAT.map((c) => c[0]).sort();
  const TOTAL = CAT.reduce((s, c) => s + c[2], 0);
  const STATUS_LABEL = { feita: "Concluída", cursando: "Cursando", planejada: "Planejada", pendente: "Pendente" };
  const STANDALONE = !!window.GRADE_STANDALONE;

  const baseStatus = (c) =>
    BASE_DONE.includes(c) ? "feita" : BASE_CUR.includes(c) ? "cursando" : BASE_PLAN.includes(c) ? "planejada" : "pendente";

  // O estado guarda só o que você MUDOU em relação ao PDF ("overrides").
  function nowSem() { const d = new Date(); return d.getFullYear() + "/" + (d.getMonth() < 6 ? 1 : 2); }
  function freshState() {
    return { v: 1, ov: {}, cfg: { atual: nowSem(), ingresso: "", cap: BASE_CUR.reduce((s, c) => s + BYCODE[c].h, 0), enforce: true } };
  }
  function normalize(p) {
    const f = freshState();
    return { v: 1, ov: p && typeof p.ov === "object" && p.ov ? p.ov : {}, cfg: Object.assign(f.cfg, (p && p.cfg) || {}) };
  }
  const LS_KEY = "grade-enc-v1";
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  let S = freshState();
  try { const raw = lsGet(LS_KEY); if (raw) { const p = JSON.parse(raw); if (p && p.v === 1) S = normalize(p); } } catch (e) {}

  /** Disciplina "resolvida": dados do PDF + suas edições. */
  function D(c) {
    const o = S.ov[c] || {}, b = BYCODE[c];
    return {
      code: c, name: b.name, h: b.h, col: b.col, row: b.row,
      status: o.status || baseStatus(c),
      sem: o.sem || "",
      nota: o.nota === 0 || o.nota ? o.nota : "",
      notas: o.notas || "",
      datas: Array.isArray(o.datas) ? o.datas : [],
      pre: Array.isArray(o.pre) ? o.pre : PRE[c] || [],
    };
  }
  /** Grava uma alteração; remove campos que voltaram a ser iguais ao PDF. */
  function setOv(c, patch) {
    const o = Object.assign({}, S.ov[c] || {}, patch);
    Object.keys(o).forEach((k) => { if (o[k] === "" || o[k] == null) delete o[k]; });
    if (o.datas && !o.datas.length) delete o.datas;
    if (o.status === baseStatus(c)) delete o.status;
    if (o.pre && JSON.stringify(o.pre.slice().sort()) === JSON.stringify((PRE[c] || []).slice().sort())) delete o.pre;
    if (Object.keys(o).length) S.ov[c] = o; else delete S.ov[c];
    scheduleSave();
  }
  const dependents = (c) => CODES.filter((x) => D(x).pre.includes(c));
  const preMissing = (d) => d.pre.filter((p) => BYCODE[p] && D(p).status !== "feita");

  // ===================== 2. SEMESTRES E PLANEJAMENTO =====================
  // "2026/2" vira um índice inteiro (ano*2 + semestre-1) para facilitar contas.
  function parseSem(s) { const m = /^\s*(\d{4})\s*[\/.\-]\s*([12])\s*$/.exec(s || ""); return m ? +m[1] * 2 + (+m[2] - 1) : null; }
  const semLabel = (i) => Math.floor(i / 2) + "/" + ((i % 2) + 1);
  const semEnd = (i) => (i % 2 === 0 ? "julho" : "dezembro") + " de " + Math.floor(i / 2);
  const fmt = (n) => n.toLocaleString("pt-BR");
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const nota2 = (n) => n.toFixed(2).replace(".", ",");
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  /** Tamanho da maior cadeia de pré-requisitos que começa em cada disciplina restante. */
  function chainDepths(remaining, remSet) {
    const memo = {};
    function depth(c, seen) {
      if (memo[c] != null) return memo[c];
      if (seen.has(c)) return 1; // proteção contra ciclos criados por edição
      seen.add(c);
      let m = 0;
      dependents(c).forEach((x) => { if (remSet.has(x)) m = Math.max(m, depth(x, seen)); });
      seen.delete(c);
      return (memo[c] = 1 + m);
    }
    remaining.forEach((d) => depth(d.code, new Set()));
    return memo;
  }

  /**
   * Monta o plano semestre a semestre (ordenação topológica com limite de horas):
   *  - "cursando" conta como concluída ao fim do semestre atual;
   *  - em cada semestre entram as disciplinas liberadas, priorizando as que
   *    destravam a cadeia mais longa (caminho crítico), até o teto de horas.
   */
  function computePlan() {
    const cur = parseSem(S.cfg.atual) ?? parseSem(nowSem());
    const cap = Math.max(34, +S.cfg.cap || 374);
    const all = CODES.map(D);
    const completed = new Set(all.filter((d) => d.status === "feita" || d.status === "cursando").map((d) => d.code));
    let remaining = all.filter((d) => d.status === "pendente" || d.status === "planejada");
    const remSet = new Set(remaining.map((d) => d.code));

    const memo = chainDepths(remaining, remSet);
    const crit = remaining.reduce((m, d) => Math.max(m, memo[d.code]), 0);

    const pinnedAt = (d) => (d.status === "planejada" ? parseSem(d.sem) : null);
    const plan = [];
    let sem = cur + 1, guard = 0;
    while (remaining.length && guard++ < 30) {
      const placed = []; let load = 0;
      const pinned = remaining.filter((d) => pinnedAt(d) != null && pinnedAt(d) <= sem);
      pinned.forEach((d) => { placed.push(Object.assign({ pinned: true }, d)); load += d.h; });
      const free = remaining.filter((d) => !pinned.includes(d) && !(pinnedAt(d) != null && pinnedAt(d) > sem));
      const avail = free
        .filter((d) => !S.cfg.enforce || d.pre.every((p) => completed.has(p) || !BYCODE[p]))
        .sort((a, b) => memo[b.code] - memo[a.code] || a.col - b.col || a.code.localeCompare(b.code));
      for (const d of avail) if (load + d.h <= cap) { placed.push(d); load += d.h; }
      if (!placed.length) {
        if (avail.length) { placed.push(avail[0]); load = avail[0].h; }
        else if (!remaining.some((d) => pinnedAt(d) > sem)) remaining.forEach((d) => { placed.push(d); load += d.h; });
      }
      if (placed.length) plan.push({ sem, items: placed, load });
      placed.forEach((d) => completed.add(d.code));
      const pc = new Set(placed.map((d) => d.code));
      remaining = remaining.filter((d) => !pc.has(d.code));
      sem++;
    }
    const remH = all.filter((d) => remSet.has(d.code)).reduce((s, d) => s + d.h, 0);
    return { cur, cap, plan, crit, remH };
  }

  // ===================== 3. NAVEGAÇÃO POR ABAS (celular) =====================
  const TABS = ["resumo", "grade", "previsao"];
  function showTab(name) {
    if (!TABS.includes(name)) name = "resumo";
    document.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("on", p.dataset.pane === name));
    document.querySelectorAll("#tabbar a").forEach((a) => {
      if (a.dataset.tab === name) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("hashchange", () => { showTab(location.hash.slice(1)); window.scrollTo(0, 0); });
  showTab(location.hash.slice(1));

  // Lista x Fluxograma: no celular a lista é o padrão.
  const mqMobile = window.matchMedia("(max-width: 720px)");
  let view = lsGet("grade-enc-view") || (mqMobile.matches ? "lista" : "fluxo");
  function setView(v) {
    view = v;
    document.getElementById("view-lista").hidden = v !== "lista";
    document.getElementById("view-fluxo").hidden = v !== "fluxo";
    document.querySelectorAll(".switch [data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
  }
  document.querySelector(".switch").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]"); if (!b) return;
    setView(b.dataset.view); lsSet("grade-enc-view", b.dataset.view);
  });
  setView(view);

  // ===================== 4. FLUXOGRAMA =====================
  const CW = 156, CH = 94, CG = 46, RG = 22, PADX = 18, PADT = 52;
  const X = (c) => PADX + c * (CW + CG), Y = (r) => PADT + r * (CH + RG);
  const flow = document.getElementById("flow"), svg = document.getElementById("edges");
  flow.style.width = PADX * 2 + 8 * CW + 7 * CG + "px";
  flow.style.height = PADT + 8 * (CH + RG) + 4 + "px";
  const NODES = {};
  for (let c = 0; c < 8; c++) {
    const h = document.createElement("div");
    h.className = "colhead"; h.style.left = X(c) + "px"; h.style.width = CW + "px"; h.dataset.col = c;
    h.innerHTML = "<span>" + (c + 1) + 'º semestre <span class="mono" data-cnt></span></span><div class="mini"><span></span></div>';
    flow.appendChild(h);
  }
  let selected = null;
  CODES.forEach((c) => {
    const b = BYCODE[c], el = document.createElement("button");
    el.type = "button"; el.className = "node"; el.dataset.code = c;
    el.style.left = X(b.col) + "px"; el.style.top = Y(b.row) + "px"; el.style.width = CW + "px"; el.style.height = CH + "px";
    el.innerHTML = '<span class="code"><span>ENC-' + c + '</span><span class="tag"></span></span><span class="nm"></span><span class="ft"><span class="pen"></span><span>' + b.h + " h</span></span>";
    el.querySelector(".nm").textContent = b.name;
    el.addEventListener("click", () => openDrawer(c));
    el.addEventListener("mouseenter", () => highlight(c));
    el.addEventListener("mouseleave", () => highlight(selected));
    el.addEventListener("focus", () => highlight(c));
    el.addEventListener("blur", () => highlight(selected));
    flow.appendChild(el); NODES[c] = el;
  });

  /** Seta ortogonal: sai pela direita da origem, anda pelos corredores entre colunas/linhas. */
  function edgePath(a, b) {
    const A = BYCODE[a], B = BYCODE[b];
    const x1 = X(A.col) + CW, y1 = Y(A.row) + CH / 2, x2 = X(B.col), y2 = Y(B.row) + CH / 2;
    if (B.col === A.col + 1) { const ch = x1 + 10 + (B.row % 6) * 5; return `M${x1} ${y1}H${ch}V${y2}H${x2 - 6}`; }
    if (B.col > A.col + 1) {
      const chA = x1 + 10 + (A.row % 6) * 5, yg = Y(B.row) - RG / 2 + ((A.row % 3) - 1) * 4, chB = x2 - 12 - (A.row % 5) * 5;
      return `M${x1} ${y1}H${chA}V${yg}H${chB}V${y2}H${x2 - 6}`;
    }
    const yb = Y(Math.max(A.row, B.row)) + CH + RG / 2;
    return `M${x1} ${y1}H${x1 + 10}V${yb}H${x2 - 14}V${y2}H${x2 - 6}`;
  }
  function renderEdges() {
    const mk = (id, color) => `<marker id="${id}" viewBox="0 0 8 8" refX="1" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="${color}"/></marker>`;
    let s = "<defs>" + mk("ah", "var(--edge)") + mk("ahh", "var(--accent)") + "</defs>";
    CODES.forEach((t) => D(t).pre.forEach((f) => { if (BYCODE[f]) s += `<path class="edge" data-f="${f}" data-t="${t}" d="${edgePath(f, t)}" marker-end="url(#ah)"/>`; }));
    svg.innerHTML = s;
    highlight(selected);
  }
  function highlight(c) {
    const on = !!c;
    flow.classList.toggle("dim", on);
    Object.values(NODES).forEach((n) => n.classList.remove("hl", "sel"));
    svg.querySelectorAll(".edge").forEach((e) => {
      const hit = on && (e.dataset.f === c || e.dataset.t === c);
      e.classList.toggle("hl", hit);
      e.setAttribute("marker-end", hit ? "url(#ahh)" : "url(#ah)");
      if (hit) { NODES[e.dataset.f].classList.add("hl"); NODES[e.dataset.t].classList.add("hl"); }
    });
    if (on) NODES[c].classList.add("hl");
    if (selected) NODES[selected].classList.add("sel");
  }
  const tagText = (d) => (d.nota !== "" ? "nota " + String(d.nota).replace(".", ",") : d.status === "pendente" ? "" : STATUS_LABEL[d.status].toLowerCase());
  function renderFlow() {
    CODES.forEach((c) => {
      const d = D(c), el = NODES[c];
      el.className = "node st-" + d.status;
      if ((d.status === "cursando" || d.status === "planejada") && preMissing(d).length) el.classList.add("warn");
      el.querySelector(".tag").textContent = tagText(d);
      el.querySelector(".pen").textContent = d.notas ? "✎ anotação" : d.sem || "";
      el.setAttribute("aria-label", "ENC-" + c + " " + d.name + ", " + d.h + " horas, " + STATUS_LABEL[d.status]);
    });
    flow.querySelectorAll(".colhead").forEach((h) => {
      const ds = CODES.map(D).filter((d) => d.col === +h.dataset.col);
      const tot = ds.reduce((s, d) => s + d.h, 0), done = ds.filter((d) => d.status === "feita").reduce((s, d) => s + d.h, 0);
      h.querySelector("[data-cnt]").textContent = "· " + ds.filter((d) => d.status === "feita").length + "/" + ds.length;
      h.querySelector(".mini span").style.width = (100 * done) / tot + "%";
    });
    renderEdges();
  }

  // ===================== 5. LISTA POR SEMESTRE =====================
  const FILTERS = [["todas", "Todas"], ["cursando", "Cursando"], ["falta", "Faltam"], ["feita", "Concluídas"], ["planejada", "Planejadas"]];
  let filter = "todas";
  const openGroups = new Set();
  let groupsInit = false;
  const qInput = document.getElementById("q");
  const matchFilter = (d) =>
    filter === "todas" || (filter === "falta" ? d.status === "pendente" || d.status === "planejada" : d.status === filter);

  function renderList() {
    const all = CODES.map(D);
    document.getElementById("filters").innerHTML = FILTERS.map(([k, label]) => {
      const n = all.filter((d) => k === "todas" || (k === "falta" ? d.status === "pendente" || d.status === "planejada" : d.status === k)).length;
      return `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${label}<span>${n}</span></button>`;
    }).join("");

    const q = norm(qInput.value.trim());
    const searching = q.length > 0 || filter !== "todas";
    if (!groupsInit) { for (let c = 0; c < 8; c++) if (all.some((d) => d.col === c && d.status !== "feita")) openGroups.add(c); groupsInit = true; }

    let html = "";
    for (let c = 0; c < 8; c++) {
      const col = all.filter((d) => d.col === c).sort((a, b) => a.row - b.row);
      const shown = col.filter((d) => matchFilter(d) && (!q || norm(d.name).includes(q) || d.code.includes(q)));
      if (!shown.length) continue;
      const tot = col.reduce((s, d) => s + d.h, 0), done = col.filter((d) => d.status === "feita");
      const doneH = done.reduce((s, d) => s + d.h, 0);
      const open = searching || openGroups.has(c);
      html += `<details class="semgroup" data-col="${c}"${open ? " open" : ""}>
        <summary><b>${c + 1}º semestre</b><span class="mono">${done.length}/${col.length} · ${fmt(tot)} h</span>
          <span class="mini"><span style="width:${(100 * doneH) / tot}%"></span></span></summary>
        ${shown.map((d) => {
          const warn = (d.status === "cursando" || d.status === "planejada") && preMissing(d).length;
          return `<button type="button" class="row st-${d.status}" data-open="${d.code}">
            <span class="bar"></span>
            <span class="txt"><span class="nm">${esc(d.name)}</span>
              <span class="meta"><span>ENC-${d.code}</span><span>${d.h} h</span>${d.sem ? `<span>${esc(d.sem)}</span>` : ""}${d.notas ? '<span class="pen">✎ anotação</span>' : ""}</span></span>
            <span class="right"><span class="pill">${d.nota !== "" ? "nota " + String(d.nota).replace(".", ",") : STATUS_LABEL[d.status]}</span>${warn ? '<span class="warn-dot" title="Pré-requisito pendente">!</span>' : ""}</span>
          </button>`;
        }).join("")}
      </details>`;
    }
    document.getElementById("semlist").innerHTML = html || `<div class="empty">Nenhuma disciplina encontrada para esse filtro.</div>`;
  }
  document.getElementById("filters").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; renderList(); });
  qInput.addEventListener("input", renderList);
  document.getElementById("semlist").addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); if (b) openDrawer(b.dataset.open); });
  document.getElementById("semlist").addEventListener("toggle", (e) => {
    const g = e.target.closest(".semgroup"); if (!g || qInput.value || filter !== "todas") return;
    if (g.open) openGroups.add(+g.dataset.col); else openGroups.delete(+g.dataset.col);
  }, true);

  // ===================== 6. RESUMO E PREVISÃO =====================
  function renderSummary(P) {
    const all = CODES.map(D);
    const sum = (st) => all.filter((d) => d.status === st).reduce((s, d) => s + d.h, 0);
    const cnt = (st) => all.filter((d) => d.status === st).length;
    const hd = sum("feita"), hc = sum("cursando"), hp = sum("planejada"), hn = sum("pendente");
    const bar = document.getElementById("hoursbar").children;
    bar[0].style.width = (100 * hd) / TOTAL + "%"; bar[1].style.width = (100 * hc) / TOTAL + "%"; bar[2].style.width = (100 * hp) / TOTAL + "%";
    const graded = all.filter((d) => d.status === "feita" && d.nota !== "" && !isNaN(+d.nota));
    const cr = graded.length ? graded.reduce((s, d) => s + d.nota * d.h, 0) / graded.reduce((s, d) => s + d.h, 0) : null;
    const last = P.plan.length ? P.plan[P.plan.length - 1].sem : P.cur;
    const st = [
      ['<span class="sw" style="background:var(--done)"></span>Concluídas', fmt(hd) + " h", cnt("feita") + " disciplinas · " + Math.round((100 * hd) / TOTAL) + "% do curso"],
      ['<span class="sw" style="background:var(--cur)"></span>Cursando', fmt(hc) + " h", cnt("cursando") + " disciplinas em " + semLabel(P.cur)],
      ['<span class="sw" style="background:var(--pend)"></span>Faltam depois', fmt(hp + hn) + " h", cnt("planejada") + cnt("pendente") + " disciplinas de " + fmt(TOTAL) + " h"],
      ["Conclusão prevista", semLabel(last), "fim em " + semEnd(last)],
    ];
    st.push(["Média ponderada (CR)", cr != null ? nota2(cr) : "—", cr != null ? graded.length + " de " + cnt("feita") + " concluídas com nota · peso = horas" : "Lance as notas das matérias concluídas"]);
    document.getElementById("stats").innerHTML = st.map((s, i) =>
      `<div class="stat${i === 3 ? " forecast" : ""}"><small>${s[0]}</small><b>${s[1]}</b><small>${s[2]}</small></div>`).join("");
  }

  /** Média de cada semestre e a acumulada até ele, a partir das notas com "Cursada em". */
  function renderCrHistory() {
    const box = document.getElementById("crhist");
    const graded = CODES.map(D).filter((d) => d.status === "feita" && d.nota !== "" && !isNaN(+d.nota));
    box.hidden = !graded.length;
    if (!graded.length) { box.innerHTML = ""; return; }
    const bySem = new Map();
    graded.forEach((d) => {
      const i = parseSem(d.sem); if (i == null) return;
      if (!bySem.has(i)) bySem.set(i, []);
      bySem.get(i).push(d);
    });
    let pts = 0, hrs = 0;
    const rows = [...bySem.keys()].sort((a, b) => a - b).map((i) => {
      const ds = bySem.get(i), sp = ds.reduce((s, d) => s + d.nota * d.h, 0), sh = ds.reduce((s, d) => s + d.h, 0);
      pts += sp; hrs += sh;
      const m = sp / sh;
      return `<tr><th scope="row" class="mono">${semLabel(i)}</th>
        <td class="crbar" aria-hidden="true"><span style="width:${m * 10}%"></span></td>
        <td class="mono">${nota2(m)}</td><td class="mono">${nota2(pts / hrs)}</td></tr>`;
    }).join("");
    const noSem = graded.length - [...bySem.values()].reduce((s, a) => s + a.length, 0);
    box.innerHTML = `<div class="eyebrow">Média por semestre</div>` +
      (rows ? `<table class="crtable"><thead><tr><th scope="col">Semestre</th><td aria-hidden="true"></td><th scope="col">Média</th><th scope="col">Acumulada</th></tr></thead><tbody>${rows}</tbody></table>` : "") +
      (noSem ? `<p class="msg">${noSem === 1 ? "1 nota não aparece aqui" : noSem + " notas não aparecem aqui"} por falta do semestre. Preencha “Cursada em” na matéria.</p>` : "");
  }

  /** O que dá para cursar agora e o que libera se você passar no que está cursando. */
  function renderNext() {
    const all = CODES.map(D);
    const open = all.filter((d) => d.status === "pendente" || d.status === "planejada");
    const openSet = new Set(open.map((d) => d.code));
    const chain = chainDepths(open, openSet);
    const unlocks = (c) => {
      const seen = new Set();
      (function walk(x) { dependents(x).forEach((y) => { if (openSet.has(y) && !seen.has(y)) { seen.add(y); walk(y); } }); })(c);
      seen.delete(c);
      return seen.size;
    };
    const okNow = (p) => !BYCODE[p] || D(p).status === "feita";
    const okSoon = (p) => okNow(p) || D(p).status === "cursando";
    const blocksCur = (c) => dependents(c).filter((x) => D(x).status === "cursando");
    const rank = (a, b) => blocksCur(b.code).length - blocksCur(a.code).length || chain[b.code] - chain[a.code] || unlocks(b.code) - unlocks(a.code) || a.col - b.col || a.code.localeCompare(b.code);
    const ready = open.filter((d) => d.pre.every(okNow)).sort(rank);
    const soon = open.filter((d) => !d.pre.every(okNow) && d.pre.every(okSoon)).sort(rank);
    const row = (d) => {
      const n = unlocks(d.code), k = chain[d.code], cur = blocksCur(d.code);
      return `<button type="button" class="row st-${d.status}" data-open="${d.code}">
        <span class="bar"></span>
        <span class="txt"><span class="nm">${esc(d.name)}</span>
          <span class="meta"><span>ENC-${d.code}</span><span>${d.h} h</span>${d.status === "planejada" ? "<span>planejada</span>" : ""}${k > 1 ? `<span>cadeia de ${k} sem.</span>` : ""}${cur.length ? `<span class="needcur">pré-requisito de ${cur.map((x) => "ENC-" + x).join(", ")}, que você está cursando</span>` : ""}</span></span>
        <span class="right">${n ? `<span class="pill">destrava ${n}</span>` : ""}</span>
      </button>`;
    };
    const group = (title, list, empty) => `<div class="semgroup nextgroup"><div class="nexthead"><b>${title}</b><span class="mono">${list.length}</span></div>${list.length ? list.map(row).join("") : `<p class="msg">${empty}</p>`}</div>`;
    document.getElementById("next").innerHTML =
      group("Liberadas agora", ready, "Nenhuma disciplina liberada no momento.") +
      group("Liberadas se passar no que está cursando", soon, "Nenhuma disciplina depende só do que você está cursando.");
  }
  document.getElementById("next").addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); if (b) openDrawer(b.dataset.open); });

  function renderForecast(P) {
    const all = CODES.map(D);
    const hd = all.filter((d) => d.status === "feita").reduce((s, d) => s + d.h, 0);
    const hc = all.filter((d) => d.status === "cursando").reduce((s, d) => s + d.h, 0);
    const bySem = (pace) => Math.ceil(P.remH / pace);
    const ing = parseSem(S.cfg.ingresso);
    const last = P.plan.length ? P.plan[P.plan.length - 1].sem : P.cur;
    const left = P.plan.length;
    let hist;
    if (ing != null && ing < P.cur) {
      const el = P.cur - ing, pace = hd / el, total = el + 1 + left;
      hist = `<p>Seu ritmo histórico: <b class="mono">${fmt(Math.round(pace))} h/sem</b> (${fmt(hd)} h em ${el} semestres). Nesse ritmo faltariam <b>${bySem(pace)}</b> semestres. Duração total estimada do curso: <b>${total} semestres</b> (≈ ${(total / 2).toFixed(1).replace(".", ",")} anos).</p>`;
    } else hist = `<p class="msg">Preencha o semestre de ingresso para comparar com o seu ritmo histórico.</p>`;
    const critTxt = P.crit > 1 ? `a cadeia mais longa de pré-requisitos ainda pendente exige <b>${P.crit}</b> semestres seguidos` : "nenhuma cadeia de pré-requisitos obriga mais de um semestre";
    document.getElementById("why").innerHTML = `
      <div class="eyebrow">Resultado</div>
      <div class="big">${left ? `${left} semestre${left > 1 ? "s" : ""} após ${semLabel(P.cur)}` : "Termina em " + semLabel(P.cur)}</div>
      <p>Formatura prevista ao fim de <b>${semLabel(last)}</b> (≈ ${semEnd(last)}).</p>
      <div class="calc">faltam         = ${fmt(TOTAL)} − ${fmt(hd)} − ${fmt(hc)} = ${fmt(P.remH)} h
pela carga     = ⌈${fmt(P.remH)} ÷ ${fmt(P.cap)}⌉ = ${P.remH ? bySem(P.cap) : 0} sem.
pela cadeia    = ${P.crit} sem.
plano abaixo   = ${left} sem.</div>
      <p>O plano respeita o maior desses limites: ${critTxt}, e cada semestre comporta no máximo ${fmt(P.cap)} h. Se o plano ficou maior que os dois, é porque alguma disciplina só libera depois de outra ou porque as cargas não encaixam no teto.</p>
      <p>No ritmo da grade ideal (391 h/sem) faltariam <b>${bySem(391) || 0}</b> semestre(s).</p>${hist}`;
    const cols = [{ sem: P.cur, items: all.filter((d) => d.status === "cursando"), load: hc, now: true }].concat(P.plan);
    document.getElementById("plan").innerHTML = cols.map((s) => `<div class="sem${s.now ? " now" : ""}">
        <header><b>${semLabel(s.sem)}</b><span class="eyebrow">${s.now ? "agora · " : ""}${fmt(s.load)} h</span></header>
        <div class="loadbar"><span style="width:${Math.min(100, (100 * s.load) / P.cap)}%"></span></div>
        <ul>${s.items.map((d) => `<li><button type="button" data-open="${d.code}"><span class="c">${d.code}</span><span class="n">${esc(d.name)}${d.pinned ? '<span class="pin">fixada</span>' : ""}</span><span class="h">${d.h}</span></button></li>`).join("")}</ul></div>`).join("");
  }
  document.getElementById("plan").addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); if (b) openDrawer(b.dataset.open); });

  function render() {
    const P = computePlan();
    renderSummary(P); renderCrHistory(); renderNext(); renderFlow(); renderList(); renderForecast(P); syncCfg();
    if (selected) fillDrawerLists();
  }

  // Configurações da previsão
  const iAt = document.getElementById("s-atual"), iIng = document.getElementById("s-ingresso"),
    iCap = document.getElementById("s-cap"), iCapR = document.getElementById("s-cap-r"), iEnf = document.getElementById("s-enforce");
  function syncCfg() {
    if (document.activeElement !== iAt) iAt.value = S.cfg.atual;
    if (document.activeElement !== iIng) iIng.value = S.cfg.ingresso;
    if (document.activeElement !== iCap) iCap.value = S.cfg.cap;
    iCapR.value = S.cfg.cap; iEnf.checked = !!S.cfg.enforce;
  }
  function cfgChange(k, v) { S.cfg[k] = v; scheduleSave(); render(); }
  iAt.addEventListener("input", () => { if (parseSem(iAt.value) != null) cfgChange("atual", iAt.value.trim()); });
  iIng.addEventListener("input", () => { const v = iIng.value.trim(); if (v === "" || parseSem(v) != null) cfgChange("ingresso", v); });
  iCap.addEventListener("input", () => { const v = +iCap.value; if (v >= 34) cfgChange("cap", v); });
  iCapR.addEventListener("input", () => cfgChange("cap", +iCapR.value));
  iEnf.addEventListener("change", () => cfgChange("enforce", iEnf.checked));
  document.getElementById("t-edges").addEventListener("change", (e) => flow.classList.toggle("noedges", !e.target.checked));

  // ===================== 7. GAVETA DE EDIÇÃO =====================
  const drawer = document.getElementById("drawer"), scrim = document.getElementById("scrim");
  const dSem = document.getElementById("d-sem"), dNota = document.getElementById("d-nota"),
    dNotas = document.getElementById("d-notas"), dAdd = document.getElementById("d-addpre");
  const dtForm = document.getElementById("d-dt-form"), dtTipo = document.getElementById("d-dt-tipo"),
    dtData = document.getElementById("d-dt-data"), dtTitulo = document.getElementById("d-dt-titulo"),
    dtMsg = document.getElementById("d-dt-msg"), dtList = document.getElementById("d-datas");
  let lastFocus = null;

  // Provas e trabalhos: guardados como { tipo, data: "AAAA-MM-DD", titulo }.
  function parseDay(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); if (!m) return null;
    const t = new Date(+m[1], +m[2] - 1, +m[3]);
    return t.getMonth() === +m[2] - 1 ? t : null;
  }
  function daysUntil(t) {
    const n = new Date();
    return Math.round((t - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
  }
  const relDay = (n) => n === 0 ? "hoje" : n === 1 ? "amanhã" : n === -1 ? "ontem" : n > 1 ? "em " + n + " dias" : "há " + -n + " dias";
  function renderDates(d) {
    const items = d.datas.map((x, i) => {
      const t = x && parseDay(x.data);
      return t ? { i, t, n: daysUntil(t), tipo: x.tipo === "trabalho" ? "Trabalho" : "Prova", titulo: x.titulo || "" } : null;
    }).filter(Boolean);
    const next = items.filter((x) => x.n >= 0).sort((a, b) => a.t - b.t);
    const past = items.filter((x) => x.n < 0).sort((a, b) => b.t - a.t);
    dtList.innerHTML = next.concat(past).map((x) => `<li class="ditem${x.n < 0 ? " past" : x.n <= 3 ? " soon" : ""}">
        <span class="dtype">${x.tipo}</span>
        <span class="dtxt"><b>${x.t.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</b><small>${x.titulo ? esc(x.titulo) + " · " : ""}<span class="drel">${relDay(x.n)}</span></small></span>
        <button type="button" data-rm-dt="${x.i}" aria-label="Remover ${x.tipo.toLowerCase()} de ${x.t.toLocaleDateString("pt-BR")}">×</button>
      </li>`).join("") || '<li class="msg">Nenhuma data cadastrada.</li>';
  }
  function openDrawer(c) {
    if (!selected) lastFocus = document.activeElement;
    selected = c;
    const d = D(c);
    document.getElementById("d-code").textContent = "ENC-" + c + " · " + d.h + " h · " + (d.col + 1) + "º semestre da grade";
    document.getElementById("d-name").textContent = d.name;
    dSem.value = d.sem; dNota.value = d.nota; dNotas.value = d.notas;
    dtData.value = ""; dtTitulo.value = ""; dtMsg.textContent = "";
    fillDrawerLists();
    drawer.hidden = false; scrim.hidden = false; drawer.scrollTop = 0;
    highlight(c);
    (drawer.querySelector('#d-status [aria-pressed="true"]') || document.getElementById("d-close")).focus({ preventScroll: true });
  }
  function closeDrawer() {
    drawer.hidden = true; scrim.hidden = true; selected = null; highlight(null);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  function fillDrawerLists() {
    const c = selected; if (!c) return;
    const d = D(c);
    drawer.querySelectorAll("#d-status button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === d.status)));
    renderDates(d);
    document.getElementById("d-sem-l").textContent = d.status === "feita" ? "Cursada em" : d.status === "planejada" ? "Planejar para" : "Semestre";
    const miss = preMissing(d);
    document.getElementById("d-alert").innerHTML = (d.status === "cursando" || d.status === "planejada") && miss.length
      ? `<div class="alert">Pré-requisito ainda não concluído: ${miss.map((p) => "ENC-" + p + " " + esc(BYCODE[p].name)).join(", ")}.</div>` : "";
    document.getElementById("d-pre").innerHTML = d.pre.length
      ? d.pre.map((p) => `<span class="pchip${D(p).status === "feita" ? " ok" : ""}">ENC-${p} ${esc(BYCODE[p] ? BYCODE[p].name : "")}<button type="button" data-rm="${p}" aria-label="Remover ENC-${p}">×</button></span>`).join("")
      : '<span class="msg">Nenhum</span>';
    const lib = dependents(c);
    document.getElementById("d-libera").innerHTML = lib.length
      ? lib.map((p) => `<span class="pchip">ENC-${p} ${esc(BYCODE[p].name)}</span>`).join("")
      : '<span class="msg">Nenhuma disciplina depende desta</span>';
    dAdd.innerHTML = '<option value="">+ adicionar pré-requisito…</option>' +
      CODES.filter((x) => x !== c && !d.pre.includes(x)).map((x) => `<option value="${x}">ENC-${x} ${esc(BYCODE[x].name)}</option>`).join("");
  }
  document.getElementById("d-status").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || !selected) return; setOv(selected, { status: b.dataset.v }); render(); });
  dSem.addEventListener("input", () => { if (!selected) return; setOv(selected, { sem: dSem.value.trim() }); render(); });
  dNota.addEventListener("input", () => { if (!selected) return; const v = dNota.value === "" ? "" : Math.max(0, Math.min(10, +dNota.value)); setOv(selected, { nota: v }); render(); });
  dNotas.addEventListener("input", () => { if (!selected) return; setOv(selected, { notas: dNotas.value }); renderFlow(); renderList(); });
  dtForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!selected) return;
    if (!parseDay(dtData.value)) { dtMsg.textContent = "Escolha uma data para adicionar."; dtData.focus(); return; }
    setOv(selected, { datas: D(selected).datas.concat({ tipo: dtTipo.value, data: dtData.value, titulo: dtTitulo.value.trim() }) });
    dtData.value = ""; dtTitulo.value = ""; dtMsg.textContent = "Data adicionada.";
    renderDates(D(selected));
  });
  dtList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm-dt]"); if (!b || !selected) return;
    setOv(selected, { datas: D(selected).datas.filter((_, i) => i !== +b.dataset.rmDt) });
    dtMsg.textContent = "Data removida.";
    renderDates(D(selected));
  });
  document.getElementById("d-pre").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (!b) return; setOv(selected, { pre: D(selected).pre.filter((p) => p !== b.dataset.rm) }); render(); });
  dAdd.addEventListener("change", () => { if (!dAdd.value) return; setOv(selected, { pre: D(selected).pre.concat(dAdd.value) }); render(); });
  document.getElementById("d-reset").addEventListener("click", () => { if (!selected) return; const datas = D(selected).datas; delete S.ov[selected]; if (datas.length) S.ov[selected] = { datas }; scheduleSave(); openDrawer(selected); render(); });
  document.getElementById("d-close").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });

  // ===================== 8. PERSISTÊNCIA, BACKUP E PWA =====================
  // No site (Vercel): salva no navegador (localStorage).
  // Dentro do claude.ai: também sincroniza com o banco do artifact.
  const pill = document.getElementById("savepill"), ptxt = document.getElementById("savetxt");
  const setPill = (s, t) => { pill.dataset.s = s; ptxt.textContent = t; };
  const LOCAL_TXT = STANDALONE ? "Salvo neste aparelho" : "Salvo neste navegador";
  let docRef = null, canCloud = false, saveTimer = null, writing = false, dirty = false, lastRemote = "";
  const snapshotJSON = () => JSON.stringify({ v: 1, ov: S.ov, cfg: S.cfg });

  function scheduleSave() {
    lsSet(LS_KEY, snapshotJSON());
    if (!canCloud) { setPill("local", LOCAL_TXT); return; }
    setPill("saving", "Salvando…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; flush(); }, 700);
  }
  async function flush() {
    if (!canCloud) return;
    if (writing) { dirty = true; return; }
    writing = true; dirty = false;
    const body = JSON.parse(snapshotJSON());
    try { await docRef.set(body); lastRemote = JSON.stringify(body); setPill("cloud", "Salvo na nuvem"); }
    catch (e) {
      if (e && e.code === "unavailable") setTimeout(flush, 800 + Math.random() * 800);
      else { canCloud = false; setPill("local", "Salvo só neste navegador"); }
    } finally { writing = false; if (dirty) flush(); }
  }
  setPill("local", lsGet(LS_KEY) ? LOCAL_TXT : "Estado do PDF");

  (async () => {
    if (!window.claude || !window.claude.use) return;
    let db = null;
    try { db = await window.claude.use("db"); } catch (e) {}
    if (!db) return;
    try { const user = await window.claude.use("user"); canCloud = user ? (await user.isOwner()) !== false : true; } catch (e) { canCloud = true; }
    docRef = db.doc("progresso/estado");
    if (canCloud) document.getElementById("backup-hint").textContent = "Aqui no claude.ai seus dados ficam salvos na nuvem. O backup em JSON serve para levar tudo para o app publicado no Vercel (ou trazer de volta).";
    const timer = setTimeout(() => { if (canCloud) setPill("local", "Nuvem indisponível · salvo neste navegador"); }, 10000);
    docRef.onSnapshot((snap) => {
      if (!snap.metadata.fromCache) clearTimeout(timer);
      if (snap.metadata.hasPendingWrites) return;
      if (snap.exists) {
        const data = snap.data(), js = JSON.stringify(data);
        if (js !== lastRemote && !writing && !dirty && !saveTimer) {
          lastRemote = js;
          const n = normalize(data);
          if (JSON.stringify({ v: 1, ov: n.ov, cfg: n.cfg }) !== snapshotJSON()) {
            S = n; lsSet(LS_KEY, snapshotJSON()); render(); if (selected) openDrawer(selected);
          }
        }
        if (canCloud) setPill("cloud", "Salvo na nuvem");
      } else if (canCloud) setPill("cloud", "Nuvem pronta");
    }, () => { clearTimeout(timer); canCloud = false; setPill("local", "Salvo só neste navegador"); });
  })();

  // Backup
  const msg = document.getElementById("toolmsg");
  document.getElementById("b-export").addEventListener("click", async () => {
    const data = JSON.stringify({ v: 1, ov: S.ov, cfg: S.cfg, exportadoEm: new Date().toISOString() }, null, 2);
    const filename = "grade-enc-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    let dl = null;
    if (window.claude && window.claude.use) { try { dl = await window.claude.use("downloads"); } catch (e) {} }
    if (dl) {
      try { await dl.save({ filename, data }); msg.textContent = "Backup salvo."; }
      catch (e) { msg.textContent = e && e.code === "declined" ? "Download cancelado." : "Não foi possível salvar o arquivo aqui."; }
      return;
    }
    if (STANDALONE) { // site normal: download direto
      const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      msg.textContent = "Backup baixado: " + filename;
      return;
    }
    try { await navigator.clipboard.writeText(data); msg.textContent = "JSON copiado para a área de transferência."; }
    catch (e) { msg.textContent = "Exportação indisponível nesta visualização."; }
  });
  document.getElementById("f-import").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { const p = JSON.parse(r.result); if (p.v !== 1) throw 0; S = normalize(p); scheduleSave(); render(); msg.textContent = "Backup importado."; }
      catch (err) { msg.textContent = "Arquivo inválido: use um JSON exportado por esta página."; }
      e.target.value = "";
    };
    r.readAsText(f);
  });
  let resetArmed = false;
  const bReset = document.getElementById("b-reset");
  bReset.addEventListener("click", () => {
    if (!resetArmed) {
      resetArmed = true; bReset.textContent = "Toque de novo para confirmar";
      setTimeout(() => { resetArmed = false; bReset.textContent = "Restaurar tudo como no PDF"; }, 4000);
      return;
    }
    resetArmed = false; bReset.textContent = "Restaurar tudo como no PDF";
    const cfg = S.cfg; S = freshState(); S.cfg = cfg; scheduleSave(); render();
    msg.textContent = "Situações, notas, anotações e datas voltaram ao estado do PDF.";
  });

  // PWA: service worker (modo offline) e botão "Instalar app"
  if (STANDALONE) {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
    const installed = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const box = document.getElementById("install"), bInstall = document.getElementById("b-install"), txt = document.getElementById("install-txt");
    let deferred = null;
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; box.hidden = false; bInstall.hidden = false; });
    bInstall.addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null; bInstall.hidden = true;
      txt.textContent = outcome === "accepted" ? "App instalado. Procure “Grade ENC” na tela inicial." : "Instalação cancelada. Você pode instalar depois pelo menu do navegador.";
    });
    if (!installed && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
      box.hidden = false;
      txt.textContent = "No iPhone: toque em Compartilhar (□↑) no Safari e depois em “Adicionar à Tela de Início”.";
    }
  }

  render();
})();
