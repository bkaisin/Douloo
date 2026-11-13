import { TFS, TF_BY_KEY, VIEWS, RANGES, SHORT_TFS, REFRESH_MS, PAPRIKA_REFRESH_MS, STABLES_TTL_MS } from './config.js';
import * as api from './api.js';
import * as store from './store.js';
import {
  FALLBACK_STABLES, buildUniverse, carryShortTerm, applyShortTerm, needsPaprika, stats,
  buildNarratives, snapshotOf, normalizeMarket, byRank,
} from './data.js';
import { formatPct, timeAgo, esc, safeImg } from './format.js';
import { textColor } from './colors.js';
import { ICONS, LOGO } from './icons.js';
import { renderList } from './list.js';
import { BubbleField } from './bubbles.js';
import { renderTreemap } from './treemap.js';
import { Sheet, tokenSheet, narrativeSheet, settingsSheet } from './sheet.js';

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- state
const DEFAULT_PREFS = {
  mode: 'tokens',
  tf: '1d',
  view: 'list',
  range: '1-100',
  favOnly: false,
  sort: { key: 'rank', dir: 1 },
  theme: 'dark',
  showStables: false,
  apiKey: '',
};
const prefs = { ...DEFAULT_PREFS, ...store.read('prefs', {}) };
if (!TF_BY_KEY[prefs.tf]) prefs.tf = '1d';
if (!VIEWS.some((v) => v.key === prefs.view)) prefs.view = 'list';
if (!RANGES.some((r) => r.key === prefs.range)) prefs.range = '1-100';
if (!prefs.sort || typeof prefs.sort.key !== 'string') prefs.sort = { ...DEFAULT_PREFS.sort };

const favs = new Set(store.read('favs', []));
let customIds = store.read('custom', []);
let tokens = [];
let narratives = [];
let narrData = null;
let stableIds = new Set(FALLBACK_STABLES);
let paprika = null;
let lastUpdate = 0;
let lastShortUpdate = 0;
let loading = false;
let failures = 0;
let errorMsg = '';
let refreshTimer = 0;
let search = { q: '', status: 'idle', results: [] };
let searchTimer = 0;

const savePrefs = () => store.write('prefs', prefs);
const saveFavs = () => store.write('favs', [...favs]);

// ---------------------------------------------------------------- elements
const els = {
  brand: $('#brand'),
  modeSeg: $('#modeSeg'),
  tfSeg: $('#tfSeg'),
  viewSeg: $('#viewSeg'),
  refreshBtn: $('#refreshBtn'),
  themeBtn: $('#themeBtn'),
  settingsBtn: $('#settingsBtn'),
  summary: $('#summary'),
  searchInput: $('#searchInput'),
  searchIcon: $('#searchIcon'),
  favBtn: $('#favBtn'),
  rangeWrap: $('#rangeWrap'),
  rangeSel: $('#rangeSel'),
  count: $('#count'),
  updated: $('#updated'),
  listView: $('#listView'),
  list: $('#list'),
  vizView: $('#vizView'),
  vizStats: $('#vizStats'),
  stage: $('#stage'),
  treemap: $('#treemap'),
  toast: $('#toast'),
  themeColor: $('meta[name="theme-color"]'),
};

const field = new BubbleField(els.stage, { onSelect: (entity) => openEntity(entity) });
const sheet = new Sheet($('#sheet'), { onAction: onSheetAction });

// ---------------------------------------------------------------- controls
function buildControls() {
  els.brand.innerHTML = `${LOGO}<span>Douloo</span>`;
  els.modeSeg.innerHTML = [
    ['tokens', 'Tokens'],
    ['narratives', 'Narratifs'],
  ].map(([k, l]) => `<button type="button" data-mode="${k}">${l}</button>`).join('');
  els.tfSeg.innerHTML = TFS.map((t) => `<button type="button" data-tf="${t.key}" aria-label="${t.label}">${t.short}</button>`).join('');
  els.viewSeg.innerHTML = VIEWS.map((v) => `<button type="button" data-view="${v.key}" aria-label="${v.label}" title="${v.label}">${ICONS[v.key]}</button>`).join('');
  els.refreshBtn.innerHTML = ICONS.refresh;
  els.settingsBtn.innerHTML = ICONS.gear;
  els.searchIcon.innerHTML = ICONS.search;
  els.rangeSel.innerHTML = RANGES.map((r) => `<option value="${r.key}">${r.label}</option>`).join('');
}

function syncControls() {
  for (const b of els.modeSeg.children) b.classList.toggle('on', b.dataset.mode === prefs.mode);
  for (const b of els.tfSeg.children) b.classList.toggle('on', b.dataset.tf === prefs.tf);
  for (const b of els.viewSeg.children) {
    const on = b.dataset.view === prefs.view;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  const tokensMode = prefs.mode === 'tokens';
  els.favBtn.hidden = !tokensMode;
  els.favBtn.classList.toggle('on', prefs.favOnly);
  els.favBtn.setAttribute('aria-pressed', String(prefs.favOnly));
  els.favBtn.innerHTML = `${prefs.favOnly ? ICONS.starFill : ICONS.star}<span>Favoris</span>`;
  els.rangeWrap.hidden = !(tokensMode && prefs.view !== 'list' && !prefs.favOnly && !query());
  els.rangeSel.value = prefs.range;
  els.searchInput.placeholder = tokensMode ? 'Rechercher ou ajouter un token' : 'Rechercher un narratif';
}

function applyTheme() {
  document.documentElement.dataset.theme = prefs.theme;
  els.themeColor?.setAttribute('content', prefs.theme === 'light' ? '#f3f3f5' : '#111214');
  els.themeBtn.innerHTML = prefs.theme === 'light' ? ICONS.moon : ICONS.sun;
  els.themeBtn.setAttribute('aria-label', prefs.theme === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair');
}

// ---------------------------------------------------------------- selection
const query = () => els.searchInput.value.trim().toLowerCase();

function entities() {
  return prefs.mode === 'tokens' ? tokens : narratives;
}

function filtered() {
  let items = entities();
  const q = query();
  if (prefs.mode === 'tokens' && prefs.favOnly) items = items.filter((t) => favs.has(t.id));
  if (q) items = items.filter((t) => t.name.toLowerCase().includes(q) || t.sym.toLowerCase().includes(q));
  return items;
}

function vizItems() {
  const items = filtered();
  if (prefs.mode !== 'tokens' || prefs.favOnly || query()) return items;
  const r = RANGES.find((x) => x.key === prefs.range) || RANGES[0];
  return items.slice(r.from, r.to);
}

function sortItems(items) {
  const { key, dir } = prefs.sort;
  const val = (i) => {
    if (key === 'rank') return i.rank;
    if (key === 'name') return i.name.toLowerCase();
    if (key === 'price' || key === 'mcap' || key === 'count') return i[key];
    return i.ch[key];
  };
  return [...items].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
  });
}

// ---------------------------------------------------------------- rendering
function render() {
  syncControls();
  const isList = prefs.view === 'list';
  document.body.classList.toggle('viz', !isList);
  els.listView.hidden = !isList;
  els.vizView.hidden = isList;
  if (isList) {
    field.setVisible(false);
    const items = filtered();
    renderSummary(items);
    renderListView(items);
    setCount(items.length);
  } else {
    renderViz();
  }
  renderStatus();
  refreshSheet();
}

function renderSummary(items) {
  els.summary.innerHTML = TFS.map((t) => {
    const s = stats(items, t.key);
    const sel = t.key === prefs.tf;
    const total = s.up + s.down;
    const bar = total
      ? `<i class="up" style="flex:${s.up}"></i><i class="down" style="flex:${s.down}"></i>`
      : '<i class="none" style="flex:1"></i>';
    return `<button type="button" class="card${sel ? ' sel' : ''}" data-tf="${t.key}" aria-pressed="${sel}">
      <span class="card-top"><span class="card-l">${t.label}</span><span class="card-v" style="color:${textColor(s.median, prefs.theme)}">${formatPct(s.median)}</span></span>
      <span class="ratio">${bar}</span>
      <span class="card-bot"><span class="up">▲ ${s.up}</span><span class="down">${s.down} ▼</span></span>
    </button>`;
  }).join('');
}

function emptyText() {
  if (!tokens.length) return loading ? 'Chargement des données…' : errorMsg || 'Aucune donnée pour le moment.';
  if (prefs.mode === 'tokens' && prefs.favOnly && !favs.size) return `Aucun favori pour l'instant. Touchez l'étoile ${ICONS.star} d'un token pour l'ajouter.`;
  if (query()) return 'Aucun résultat dans la liste.';
  return 'Rien à afficher.';
}

function searchSectionHtml() {
  const q = query();
  if (prefs.mode !== 'tokens' || q.length < 2) return '';
  let body;
  if (search.q !== q || search.status === 'loading') body = '<div class="add-empty">Recherche sur CoinGecko…</div>';
  else if (search.status === 'error') body = '<div class="add-empty">Recherche indisponible pour le moment.</div>';
  else {
    const have = new Set(tokens.map((t) => t.id));
    const res = search.results.filter((c) => !have.has(c.id));
    body = res.length
      ? res.map((c) => {
          const src = safeImg(c.large || c.thumb);
          return `<div class="add-row">${src ? `<img class="av" src="${src}" alt="" width="26" height="26" loading="lazy">` : '<span class="av av-txt"></span>'}
            <span class="add-name">${esc(c.name)}</span><span class="add-sym">${esc(String(c.symbol || '').toUpperCase())}</span>
            <span class="add-rank">${c.market_cap_rank ? `#${c.market_cap_rank}` : ''}</span>
            <button type="button" class="btn small" data-add="${esc(c.id)}">${ICONS.plus}<span>Ajouter</span></button></div>`;
        }).join('')
      : '<div class="add-empty">Aucun autre token trouvé.</div>';
  }
  return `<div class="add-section"><div class="add-title">Ajouter depuis CoinGecko</div>${body}</div>`;
}

function renderListView(items) {
  renderList(els.list, sortItems(items), {
    mode: prefs.mode,
    tf: prefs.tf,
    sort: prefs.sort,
    favs,
    theme: prefs.theme,
    emptyText: emptyText(),
    extraHtml: searchSectionHtml(),
  });
}

function renderViz() {
  const items = vizItems();
  const tf = prefs.tf;
  const s = stats(items, tf);
  const legend = {
    swarm: 'position = variation · taille = |variation|',
    treemap: 'taille = capitalisation · couleur = variation',
  }[prefs.view];
  els.vizStats.innerHTML = items.length
    ? `<span class="down">▼ ${s.down} en baisse</span><span class="mid">médiane <b style="color:${textColor(s.median, prefs.theme)}">${formatPct(s.median)}</b></span><span class="up">${s.up} en hausse ▲</span>${s.missing ? `<span class="muted">${s.missing} sans donnée ${TF_BY_KEY[tf].short}</span>` : ''}<span class="legend">${legend}</span>`
    : `<span class="muted">${emptyText()}</span>`;
  setCount(items.length);
  if (prefs.view === 'treemap') {
    field.setVisible(false);
    els.treemap.hidden = false;
    renderTreemap(els.treemap, items, { tf, theme: prefs.theme });
  } else {
    els.treemap.hidden = true;
    els.treemap.innerHTML = '';
    field.setVisible(true);
    field.resize();
    const data = items
      .filter((i) => i.ch[tf] != null)
      .map((i) => ({ id: i.id, sym: i.sym, image: i.image, value: i.ch[tf], entity: i }));
    field.setData(data, { tf, theme: prefs.theme });
  }
}

function setCount(n) {
  const noun = prefs.mode === 'tokens' ? 'token' : 'narratif';
  els.count.textContent = `${n} ${noun}${n > 1 ? 's' : ''}`;
}

function renderStatus() {
  els.refreshBtn.classList.toggle('spin', loading);
  let txt = lastUpdate ? `Mis à jour ${timeAgo(lastUpdate)}` : loading ? 'Chargement…' : '';
  if (errorMsg && !loading) txt = `⚠︎ ${lastUpdate ? `Données ${timeAgo(lastUpdate)}` : 'Hors ligne'}`;
  els.updated.textContent = txt;
  els.updated.title = errorMsg;
  els.updated.classList.toggle('warn', !!errorMsg && !loading);
}

let toastTimer = 0;
function toast(msg, ms = 3200) {
  els.toast.textContent = msg;
  els.toast.classList.add('in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('in'), ms);
}

// ---------------------------------------------------------------- sheet
function findEntity(id) {
  return id.startsWith('n:') ? narratives.find((n) => n.id === id) : tokens.find((t) => t.id === id);
}

function openEntity(entity, back = null) {
  if (!entity) return;
  const state = { type: entity.isNarrative ? 'narrative' : 'token', id: entity.id, back };
  sheet.open(state, sheetHtml(state));
}

function sheetHtml(state) {
  if (state.type === 'settings') {
    return settingsSheet({ theme: prefs.theme, showStables: prefs.showStables, apiKey: prefs.apiKey, lastUpdate });
  }
  const e = findEntity(state.id);
  if (!e) return null;
  if (state.type === 'narrative') return narrativeSheet(e, { tf: prefs.tf, theme: prefs.theme });
  return tokenSheet(e, { tf: prefs.tf, theme: prefs.theme, isFav: favs.has(e.id), back: !!state.back });
}

function refreshSheet() {
  if (!sheet.isOpen) return;
  const html = sheetHtml(sheet.state);
  if (html == null) sheet.close();
  else sheet.update(html);
}

function onSheetAction(target) {
  const st = sheet.state;
  if (!st) return;
  if (target.dataset.tf) return setTf(target.dataset.tf);
  if (target.dataset.open) return openEntity(findEntity(target.dataset.open), st.id);
  if (target.dataset.themeSet) return setTheme(target.dataset.themeSet);
  switch (target.dataset.action) {
    case 'close':
      return sheet.close();
    case 'back':
      return st.back ? openEntity(findEntity(st.back)) : sheet.close();
    case 'fav':
      return toggleFav(st.id);
    case 'remove':
      return removeCustom(st.id);
    case 'stables':
      prefs.showStables = target.checked;
      savePrefs();
      toast(prefs.showStables ? 'Stablecoins affichés' : 'Stablecoins masqués');
      return refresh();
    case 'savekey': {
      prefs.apiKey = $('#cgkey').value.trim();
      savePrefs();
      toast(prefs.apiKey ? 'Clé API enregistrée' : 'Clé API supprimée');
      return refresh();
    }
    default:
  }
}

// ---------------------------------------------------------------- actions
function setTf(tf) {
  if (!TF_BY_KEY[tf] || tf === prefs.tf) return;
  prefs.tf = tf;
  savePrefs();
  render();
}

function setTheme(theme) {
  prefs.theme = theme;
  savePrefs();
  applyTheme();
  field.repaintAll();
  render();
}

function toggleFav(id) {
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  saveFavs();
  render();
}

async function addCustom(id) {
  if (!customIds.includes(id)) customIds.push(id);
  store.write('custom', customIds);
  favs.add(id);
  saveFavs();
  toast('Ajout en cours…');
  try {
    let t = tokens.find((x) => x.id === id);
    if (!t) {
      const [row] = await api.fetchMarketsByIds([id], prefs.apiKey);
      if (!row) throw new Error('not found');
      t = normalizeMarket(row);
      t.custom = true;
      t.extra = true;
      tokens.push(t);
      tokens.sort(byRank);
      const res = await Promise.allSettled(SHORT_TFS.map((p) => api.fetchLlamaChanges([id], p)));
      SHORT_TFS.forEach((p, i) => {
        if (res[i].status === 'fulfilled') t.ch[p] = res[i].value[id] ?? null;
      });
    } else {
      t.custom = true;
    }
    recompute();
    saveSnapshot();
    render();
    toast(`${t.sym} ajouté à tes favoris`);
  } catch (e) {
    console.warn(e);
    toast("Impossible d'ajouter ce token pour l'instant. Réessaie dans un moment.");
  }
}

function removeCustom(id) {
  customIds = customIds.filter((x) => x !== id);
  store.write('custom', customIds);
  const t = tokens.find((x) => x.id === id);
  if (t?.extra) tokens = tokens.filter((x) => x.id !== id);
  else if (t) t.custom = false;
  favs.delete(id);
  saveFavs();
  recompute();
  saveSnapshot();
  toast('Token retiré');
  render();
}

function scheduleRemoteSearch() {
  clearTimeout(searchTimer);
  const q = query();
  if (prefs.mode !== 'tokens' || q.length < 2) return;
  searchTimer = setTimeout(async () => {
    search = { q, status: 'loading', results: [] };
    try {
      const results = await api.searchCoins(q, prefs.apiKey);
      if (query() !== q) return;
      search = { q, status: 'done', results };
    } catch {
      if (query() !== q) return;
      search = { q, status: 'error', results: [] };
    }
    if (prefs.view === 'list') renderListView(filtered());
  }, 450);
}

// ---------------------------------------------------------------- data
function recompute() {
  narratives = buildNarratives(tokens, narrData);
}

function saveSnapshot() {
  store.write('snapshot', { ts: lastUpdate, short: lastShortUpdate, tokens: snapshotOf(tokens) });
}

function loadSnapshot() {
  const snap = store.read('snapshot', null);
  if (!snap || !Array.isArray(snap.tokens)) return;
  tokens = snap.tokens;
  lastUpdate = snap.ts || 0;
  lastShortUpdate = snap.short || 0;
}

async function ensureStables() {
  const cached = store.read('stables', null);
  if (cached && Date.now() - cached.ts < STABLES_TTL_MS) {
    stableIds = new Set([...cached.ids, ...FALLBACK_STABLES]);
    return;
  }
  try {
    const ids = await api.fetchStablecoinIds(prefs.apiKey);
    stableIds = new Set([...ids, ...FALLBACK_STABLES]);
    store.write('stables', { ts: Date.now(), ids });
  } catch (e) {
    console.warn('stablecoins', e);
    if (cached) stableIds = new Set([...cached.ids, ...FALLBACK_STABLES]);
  }
}

async function refreshShortTerm() {
  const ids = tokens.map((t) => t.id);
  const res = await Promise.allSettled(SHORT_TFS.map((p) => api.fetchLlamaChanges(ids, p)));
  const llama = {};
  SHORT_TFS.forEach((p, i) => (llama[p] = res[i].status === 'fulfilled' ? res[i].value : null));
  applyShortTerm(tokens, llama, null);
  if (res.some((r) => r.status === 'fulfilled')) lastShortUpdate = Date.now();
  if (needsPaprika(tokens)) {
    if (!paprika || Date.now() - paprika.ts > PAPRIKA_REFRESH_MS) {
      try {
        paprika = { ts: Date.now(), rows: await api.fetchPaprikaTickers() };
      } catch (e) {
        console.warn('paprika', e);
      }
    }
    if (paprika) applyShortTerm(tokens, {}, paprika.rows);
  }
}

function describeError(e) {
  if (e?.status === 429) return 'CoinGecko limite les requêtes gratuites : nouvel essai automatique dans quelques minutes.';
  if (e?.name === 'AbortError' || e instanceof TypeError) return 'Connexion impossible : dernières données affichées.';
  return `Erreur de chargement (${e?.message || e})`;
}

async function refresh() {
  if (loading) return;
  loading = true;
  renderStatus();
  try {
    await ensureStables();
    const pages = await Promise.all([1, 2].map((p) => api.fetchMarketsPage(p, prefs.apiKey)));
    let markets = pages.flat();
    const have = new Set(markets.map((m) => m.id));
    const missing = customIds.filter((id) => !have.has(id));
    if (missing.length) {
      try {
        markets = markets.concat(await api.fetchMarketsByIds(missing, prefs.apiKey));
      } catch (e) {
        console.warn('custom tokens', e);
      }
    }
    const prev = new Map(tokens.map((t) => [t.id, t]));
    const next = buildUniverse(markets, { stableIds, showStables: prefs.showStables, customIds });
    if (Date.now() - lastShortUpdate < 10 * 60_000) carryShortTerm(next, prev);
    tokens = next;
    lastUpdate = Date.now();
    errorMsg = '';
    failures = 0;
    recompute();
    render();
    await refreshShortTerm();
    recompute();
    saveSnapshot();
  } catch (e) {
    console.warn(e);
    failures++;
    errorMsg = describeError(e);
    toast(errorMsg, 5000);
  } finally {
    loading = false;
    render();
    schedule();
  }
}

function schedule() {
  clearTimeout(refreshTimer);
  const delay = failures ? REFRESH_MS * Math.min(5, failures + 1) : REFRESH_MS;
  refreshTimer = setTimeout(() => {
    if (document.visibilityState === 'visible') refresh();
  }, delay);
}

// ---------------------------------------------------------------- events
function bind() {
  els.modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b || b.dataset.mode === prefs.mode) return;
    prefs.mode = b.dataset.mode;
    if (['price'].includes(prefs.sort.key) && prefs.mode === 'narratives') prefs.sort = { key: 'rank', dir: 1 };
    if (prefs.sort.key === 'count' && prefs.mode === 'tokens') prefs.sort = { key: 'rank', dir: 1 };
    savePrefs();
    render();
  });
  els.tfSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tf]');
    if (b) setTf(b.dataset.tf);
  });
  els.summary.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tf]');
    if (b) setTf(b.dataset.tf);
  });
  els.viewSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b || b.dataset.view === prefs.view) return;
    prefs.view = b.dataset.view;
    savePrefs();
    window.scrollTo(0, 0);
    render();
  });
  els.refreshBtn.addEventListener('click', () => refresh());
  els.themeBtn.addEventListener('click', () => setTheme(prefs.theme === 'dark' ? 'light' : 'dark'));
  els.settingsBtn.addEventListener('click', () => {
    const state = { type: 'settings' };
    sheet.open(state, sheetHtml(state));
  });
  els.favBtn.addEventListener('click', () => {
    prefs.favOnly = !prefs.favOnly;
    savePrefs();
    render();
  });
  els.rangeSel.addEventListener('change', () => {
    prefs.range = els.rangeSel.value;
    savePrefs();
    render();
  });
  let inputTimer = 0;
  els.searchInput.addEventListener('input', () => {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(render, 120);
    scheduleRemoteSearch();
  });
  els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      els.searchInput.value = '';
      render();
    }
  });

  els.list.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      const key = sortBtn.dataset.sort;
      if (prefs.sort.key === key) prefs.sort.dir *= -1;
      else prefs.sort = { key, dir: key === 'rank' || key === 'name' ? 1 : -1 };
      savePrefs();
      return render();
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) return toggleFav(fav.dataset.fav);
    const add = e.target.closest('[data-add]');
    if (add) {
      add.disabled = true;
      return addCustom(add.dataset.add);
    }
    if (e.target.closest('a')) return;
    const row = e.target.closest('.row[data-id]');
    if (row) openEntity(findEntity(row.dataset.id));
  });
  els.list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const row = e.target.closest('.row[data-id]');
    if (row && e.target === row) openEntity(findEntity(row.dataset.id));
  });
  els.treemap.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile[data-id]');
    if (tile) openEntity(findEntity(tile.dataset.id));
  });

  // Re-layout the list when its width changes (rotation, split view on iPad…).
  let lastListWidth = 0;
  new ResizeObserver(() => {
    const w = els.list.clientWidth;
    if (prefs.view === 'list' && w && Math.abs(w - lastListWidth) > 2) {
      lastListWidth = w;
      renderListView(filtered());
    }
  }).observe(els.list);
  let tmTimer = 0;
  new ResizeObserver(() => {
    if (prefs.view !== 'treemap') return;
    clearTimeout(tmTimer);
    tmTimer = setTimeout(() => renderTreemap(els.treemap, vizItems(), { tf: prefs.tf, theme: prefs.theme }), 60);
  }).observe(els.treemap);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (prefs.view === 'swarm') field.start();
      if (Date.now() - lastUpdate > REFRESH_MS - 5000) refresh();
    } else {
      field.stop();
    }
  });
  setInterval(renderStatus, 5000);
}

// ---------------------------------------------------------------- boot
async function loadNarratives() {
  try {
    const res = await fetch('data/narratives.json');
    narrData = await res.json();
    recompute();
    render();
  } catch (e) {
    console.warn('narratives', e);
  }
}

function boot() {
  buildControls();
  applyTheme();
  bind();
  loadSnapshot();
  render();
  loadNarratives();
  refresh();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e));
  }
}

boot();
