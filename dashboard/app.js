// Token Radar dashboard (radar-2): the ranked board, a filterable table, a per-protocol
// detail view with the model's own arithmetic, and the live-token set aside.
// Static page, no network: it reads window.RADAR from data.js, written by main.ts from
// the same board, so the page and board.json can never disagree.
// State lives in the URL hash: #/ is the board, #/detail/<slug> a protocol,
// #/category/<name> a filtered board, #/live the live-token view.
(function () {
  var DATA = window.RADAR;
  if (!DATA) { document.getElementById('app').textContent = 'No radar data (data.js missing).'; return; }

  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });

  var state = { q: '', cat: 'all', chain: 'all', wl: false, tab: 'pre', sort: 'implied', dir: -1, selected: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtUsd(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n == null) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n > 0 ? 'up' : n < 0 ? 'down' : 'muted') + '">' + s + '</span>';
  }
  function fmtAge(d) {
    if (d == null) return '—';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }
  function fmtMult(n) { return '×' + n.toFixed(2); }

  // The model in one function: the page recomputes a row from the snapshot figures and
  // checks the result against board.json.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d == null ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days == null ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var breadth = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), m.breadth_max_chains) * m.breadth_per_chain;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth));
  }

  function readHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/');
    state.selected = null;
    if (parts[0] === 'detail' && parts[1]) { state.selected = decodeURIComponent(parts[1]); state.tab = 'pre'; }
    else if (parts[0] === 'category' && parts[1]) { state.cat = decodeURIComponent(parts[1]); state.tab = 'pre'; }
    else if (parts[0] === 'live') { state.tab = 'live'; }
  }
  function writeHash() {
    var h = '#/';
    if (state.selected) h = '#/detail/' + encodeURIComponent(state.selected);
    else if (state.tab === 'live') h = '#/live';
    else if (state.cat !== 'all') h = '#/category/' + encodeURIComponent(state.cat);
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  function categories() {
    var set = {};
    DATA.rows.forEach(function (r) { set[r.category || 'Other'] = true; });
    return Object.keys(set).sort();
  }
  function chains() {
    var set = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { set[c] = true; }); });
    return Object.keys(set).sort();
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !WATCH[r.slug]) return false;
      if (state.cat !== 'all' && (r.category || 'Other') !== state.cat) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sortedRows(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var va, vb;
      if (key === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'growth') { va = a.change_7d == null ? -9999 : a.change_7d; vb = b.change_7d == null ? -9999 : b.change_7d; }
      else if (key === 'age') { va = a.age_days == null ? -1 : a.age_days; vb = b.age_days == null ? -1 : b.age_days; }
      else if (key === 'rank') { va = a.rank; vb = b.rank; }
      else { va = a.implied_value_usd; vb = b.implied_value_usd; }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.rank - b.rank;
    });
  }

  function sortBtn(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' ▼' : ' ▲') : '';
    return '<button type="button" data-sort="' + key + '">' + esc(label) + arrow + '</button>';
  }

  function rowHtml(r) {
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><b>' + esc(r.name) + '</b>' + (WATCH[r.slug] ? '<span class="badge">Watchlist</span>' : '') +
        '<br><span class="muted">' + esc(r.slug) + ' · ' + (r.chains || []).slice(0, 3).map(esc).join(', ') + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
      '</tr>';
  }

  function boardHtml() {
    var list = sortedRows(filteredRows());
    var cats = categories(), chs = chains();
    var h = '<section class="panel"><div class="controls">' +
      '<div class="field"><label for="q">Search</label><input id="q" type="search" placeholder="Protocol name or slug" value="' + esc(state.q) + '"></div>' +
      '<div class="field"><label for="cat">Category</label><select id="cat"><option value="all">All categories</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain"><option value="all">All chains</option>' +
      chs.map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.chain ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>&nbsp;</label><button type="button" id="wlBtn" class="' + (state.wl ? 'on' : '') + '">Watchlist only</button></div>' +
      '<div class="field"><label>&nbsp;</label><button type="button" id="clearBtn">Clear filters</button></div>' +
      '</div>' +
      '<div class="count">' + list.length + ' of ' + DATA.rows.length + ' pre-token protocols shown · ranked by implied value · select a row for its model and farm plan</div>';
    if (list.length === 0) {
      h += '<div class="empty"><h2>No protocol matches that filter</h2><p>Try a different search or category.</p></div></section>';
      return h;
    }
    h += '<div style="overflow-x:auto"><table><thead><tr>' +
      '<th class="num">' + sortBtn('rank', 'Rank') + '</th>' +
      '<th>' + sortBtn('name', 'Protocol') + '</th>' +
      '<th>Category</th>' +
      '<th class="num">' + sortBtn('tvl', 'TVL') + '</th>' +
      '<th class="num">' + sortBtn('growth', '7d') + '</th>' +
      '<th class="num">' + sortBtn('age', 'Age') + '</th>' +
      '<th class="num">' + sortBtn('implied', 'Implied value') + '</th>' +
      '</tr></thead><tbody>' + list.map(rowHtml).join('') + '</tbody></table></div></section>';
    return h;
  }

  function liveHtml() {
    var h = '<section class="panel"><h2>Live-token protocols — the market&rsquo;s own values</h2>' +
      '<p>These protocols already trade, so the board shows what the market pays for them, not a model. Their median market-cap-to-TVL ratio is what the pre-token board&rsquo;s category multiples are built from.</p>' +
      '<table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th><th class="num">7d</th></tr></thead><tbody>' +
      DATA.live.map(function (r) {
        return '<tr><td><b>' + esc(r.name) + '</b><br><span class="muted">' + esc(r.slug) + '</span></td>' +
          '<td>' + esc(r.category || '—') + '</td><td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
          '<td class="num">' + fmtUsd(r.mcap_usd) + '</td><td class="num">' + (r.multiple == null ? '—' : fmtMult(r.multiple)) + '</td>' +
          '<td class="num">' + fmtPct(r.change_7d) + '</td></tr>';
      }).join('') + '</tbody></table></section>';
    return h;
  }

  function modelHtml() {
    var m = DATA.model;
    var rows = DATA.multiples.map(function (x) {
      return '<tr><td>' + esc(x.category) + '</td><td class="num">' + x.comparables + '</td><td class="num">' + fmtMult(x.multiple) + '</td></tr>';
    }).join('');
    return '<section class="panel"><h2>How the implied value is built</h2>' +
      '<div class="model-grid"><div><p>Every row runs through one function of the snapshot&rsquo;s own figures. No protocol name is special-cased, and no row is hand-picked.</p>' +
      '<p class="math">implied = TVL × category multiple<br>× (1 + growth × ' + m.growth_weight + ')<br>× maturity × breadth</p>' +
      '<p><b>Category multiple:</b> the median market-cap-to-TVL ratio of the live protocols in the same category (at least ' + m.min_comparables + ' comparables), clamped to ' + m.multiple_floor + '–' + m.multiple_cap + '. Categories with too few comparables use the global median, <b>' + fmtMult(DATA.global_multiple) + '</b>.</p>' +
      '<p><b>Growth:</b> the 7-day TVL change, clamped to ' + m.growth_floor + '%–' + m.growth_cap + '%, weighted ' + m.growth_weight + '. <b>Maturity:</b> 0.6 rising to 1.0 over ' + (m.maturity_days / 365) + ' years with no token (unknown age counts as ' + m.unknown_age_days + ' days). <b>Breadth:</b> +' + (m.breadth_per_chain * 100) + '% per extra chain, up to ' + m.breadth_max_chains + '.</p>' +
      '<p>Implied value is a model, not a promise — and never a prediction that a token will launch.</p></div>' +
      '<div><table><thead><tr><th>Category</th><th class="num">Live comps</th><th class="num">Multiple</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p>Categories with fewer than ' + m.min_comparables + ' live comparables use the global median ' + fmtMult(DATA.global_multiple) + '.</p></div></div></section>';
  }

  function detailHtml(r) {
    var recomputed = impliedOf(r);
    var agrees = recomputed === r.implied_value_usd;
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, r.change_7d == null ? 0 : r.change_7d));
    var age = r.age_days == null ? m.unknown_age_days : r.age_days;
    var steps = (r.farm_steps || []).map(function (s, i) {
      return '<li><div>' + esc(s) + '</div></li>';
    }).join('');
    return '<div class="dialog-body"><h2>' + esc(r.name) + '</h2>' +
      '<p class="muted">Rank #' + r.rank + ' · ' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + (r.chains || []).map(esc).join(', ') + (WATCH[r.slug] ? ' · <span class="badge">Watchlist</span>' : '') + '</p>' +
      '<div class="facts">' +
      '<div><span>TVL</span><b>' + fmtUsd(r.tvl_usd) + '</b></div>' +
      '<div><span>7-day change</span><b>' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b></div>' +
      '<div><span>Age (no token)</span><b>' + fmtAge(r.age_days) + '</b></div>' +
      '<div><span>Implied value</span><b>' + fmtUsd(r.implied_value_usd) + '</b></div>' +
      '<div><span>Category multiple</span><b>' + fmtMult(r.category_multiple) + (r.category_comparables > 0 ? ' (' + r.category_comparables + ' comps)' : ' (global)') + '</b></div>' +
      '<div><span>Listed</span><b>' + esc(r.listed_at || '—') + '</b></div>' +
      '</div>' +
      '<h3>The model for this row</h3>' +
      '<p class="math">' + fmtUsd(r.tvl_usd) + ' TVL × ' + fmtMult(r.category_multiple) + ' category multiple<br>' +
      '× ' + fmtMult(r.growth_multiplier) + ' growth (' + (growth > 0 ? '+' : '') + growth.toFixed(1) + '% over 7 days)<br>' +
      '× ' + fmtMult(r.maturity_multiplier) + ' maturity (' + fmtAge(age) + ' with no token)<br>' +
      '× ' + fmtMult(r.breadth_multiplier) + ' breadth (' + (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') + ')<br>' +
      '= <b>' + fmtUsd(r.implied_value_usd) + '</b></p>' +
      '<p class="muted">The page recomputes this row as ' + fmtUsd(recomputed) + (agrees ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.</p>' +
      '<h3>Farm plan — 7 steps</h3><ol class="steps">' + steps + '</ol>' +
      '<p class="muted">A plan for this protocol only: the steps come from its own category, chains, TVL and age. Never pay anyone to claim an airdrop, and never share a seed phrase.</p>' +
      '<div class="close-row"><button type="button" id="closeDlg">Close</button></div></div>';
  }

  function render() {
    var app = document.getElementById('app');
    var h = '<div class="wrap">' +
      '<header class="hero"><h1>Token Radar <span class="amber">· pre-token protocols, ranked</span></h1>' +
      '<p>What a token would be worth if the protocol&rsquo;s record stayed as it is — and what to do to farm it before one exists. The watchlist is the floor: every protocol with at least ' + fmtUsd(DATA.floor_usd) + ' of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor.</p>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + DATA.board_size + '</b><span>protocols ranked</span></div>' +
      '<div class="stat"><b>' + DATA.watchlist_size + '</b><span>on the watchlist</span></div>' +
      '<div class="stat"><b>' + DATA.early_size + '</b><span>early finds below the floor</span></div>' +
      '<div class="stat"><b>' + DATA.live_size + '</b><span>live-token protocols set aside</span></div>' +
      '<div class="stat"><b>' + esc(DATA.as_of) + '</b><span>snapshot date (UTC)</span></div>' +
      '</div></header>' +
      '<div class="tabs" style="margin-bottom:12px"><button type="button" id="tabPre" class="' + (state.tab === 'pre' ? 'on' : '') + '">Pre-token board</button> ' +
      '<button type="button" id="tabLive" class="' + (state.tab === 'live' ? 'on' : '') + '">Live token</button></div>' +
      (state.tab === 'live' ? liveHtml() : boardHtml()) +
      modelHtml() +
      '<footer>Snapshot: ' + esc(DATA.source) + '. Implied values are this radar&rsquo;s model (' + esc(DATA.model_version) + '), not a price and not a prediction that a token will launch. A protocol that records no token may still have one its DefiLlama record does not carry.</footer>' +
      '</div>' +
      '<dialog id="dlg"></dialog>';
    app.innerHTML = h;
    app.setAttribute('aria-busy', 'false');
    bind();
    if (state.selected) openDetail(state.selected, false);
  }

  function bind() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; state.selected = null; writeHash(); render(); });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; state.selected = null; writeHash(); render(); });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; state.selected = null; writeHash(); render(); });
    var wl = document.getElementById('wlBtn');
    if (wl) wl.addEventListener('click', function () { state.wl = !state.wl; state.selected = null; writeHash(); render(); });
    var clear = document.getElementById('clearBtn');
    if (clear) clear.addEventListener('click', function () { state.q = ''; state.cat = 'all'; state.chain = 'all'; state.wl = false; state.selected = null; writeHash(); render(); });
    var tabPre = document.getElementById('tabPre');
    if (tabPre) tabPre.addEventListener('click', function () { state.tab = 'pre'; state.selected = null; writeHash(); render(); });
    var tabLive = document.getElementById('tabLive');
    if (tabLive) tabLive.addEventListener('click', function () { state.tab = 'live'; state.selected = null; writeHash(); render(); });
    var sorts = document.querySelectorAll('[data-sort]');
    for (var i = 0; i < sorts.length; i++) {
      sorts[i].addEventListener('click', function () {
        var key = this.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
        render();
      });
    }
    var rows = document.querySelectorAll('tbody tr[data-slug]');
    for (var j = 0; j < rows.length; j++) {
      rows[j].addEventListener('click', function () { openDetail(this.getAttribute('data-slug'), true); });
      rows[j].addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(this.getAttribute('data-slug'), true); } });
      rows[j].setAttribute('tabindex', '0');
    }
  }

  function openDetail(slug, push) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    if (!row) return;
    state.selected = slug;
    if (push) writeHash();
    var dlg = document.getElementById('dlg');
    dlg.innerHTML = detailHtml(row);
    if (!dlg.open) dlg.showModal();
    var close = document.getElementById('closeDlg');
    if (close) close.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () { state.selected = null; writeHash(); }, { once: true });
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.selected) { state.selected = null; writeHash(); } });
})();
