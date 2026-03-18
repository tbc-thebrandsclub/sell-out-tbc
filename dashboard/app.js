// ============================================================
// TBC C.A.R.S. - Control de Activos y Rutas de Sell-out
// ============================================================

// Register datalabels plugin (disabled by default, enabled per-chart)
if (window.ChartDataLabels) Chart.register(ChartDataLabels);
Chart.defaults.plugins.datalabels = { display: false };

let selectedCampaignId = null;
let chartInstances = {};
let currentTab = 'command-center';
const tabRendered = { 'command-center': false, 'ranking': false, 'top-ventas': false, 'laboratorio': false };
let campaignInitialized = false;

const DIV_COLORS = {
  'Vestuario Infantil': '#6366f1',
  'Ropa Interior': '#34d399',
  'Calzado': '#f97316',
  'Vestuario Adulto': '#eab308',
  'Accesorios y Otros': '#ec4899',
};
// Colores corporativos reales de cada cadena B2B
const CHAIN_COLOR_MAP = {
  'Jumbo':         '#10B72B', // Verde Jumbo (Cencosud)
  'Ripley':        '#7B2D8E', // Morado Ripley
  'Paris':         '#009CE0', // Azul cielo Paris (Cencosud)
  'Hites':         '#0052CC', // Azul cobalto Hites
  'Falabella':     '#AAD500', // Verde limón Falabella
  'La Polar':      '#D90000', // Rojo La Polar
  'Tottus':        '#57AC32', // Verde manzana Tottus (Falabella Group)
  'Johnson':       '#F58220', // Naranja Johnson (Cencosud)
  'Walmart':       '#0071CE', // Azul Walmart
  'Hiper Lider':   '#004B93', // Azul oscuro Lider
  'Lider Express': '#1E3A8A', // Navy Lider Express
  'Acuenta':       '#E31837', // Rojo Acuenta (Walmart Chile)
  'Ekono':         '#00B4D8', // Cyan Ekono (Walmart Chile)
  'Cencosud':      '#E4002B', // Rojo Cencosud (corporativo)
};
const CHAIN_COLORS_ORDERED = Object.values(CHAIN_COLOR_MAP);
function chainColor(name) { return CHAIN_COLOR_MAP[name] || '#64748b'; }

// ── Theme Toggle ────────────────────────────────────────
function initThemeToggle() {
  const saved = localStorage.getItem('tbc-theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');

  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('tbc-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('tbc-theme', 'light');
    }
    // Update Chart.js text colors for current theme
    updateChartThemeColors();
  });
}

function getThemeChartColors() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    text: isLight ? '#475569' : '#94a3b8',
    textMuted: isLight ? '#94a3b8' : '#64748b',
    grid: isLight ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.06)',
    title: isLight ? '#0b3b74' : '#94a3b8',
  };
}

function updateChartThemeColors() {
  const c = getThemeChartColors();
  Object.values(chartInstances).forEach(chart => {
    if (!chart || !chart.options) return;
    // Update scales
    if (chart.options.scales) {
      Object.values(chart.options.scales).forEach(scale => {
        if (scale.ticks) scale.ticks.color = scale.ticks.color === '#f97316' ? '#f97316' : c.text;
        if (scale.grid) scale.grid.color = c.grid;
        if (scale.title && scale.title.color && scale.title.color !== '#f97316') scale.title.color = c.textMuted;
      });
    }
    // Update legend
    if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
      chart.options.plugins.legend.labels.color = c.text;
    }
    chart.update('none');
  });
}

// ── Initialization ──────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Apply saved theme immediately (before loading screen ends)
  const saved = localStorage.getItem('tbc-theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');

  setTimeout(() => {
    document.getElementById("loading-screen").classList.add("hidden");
    initDashboard();
  }, 1600);
});

function initDashboard() {
  initThemeToggle();
  renderHeaderDate();
  renderDataStatusBar();
  initTabs();
  populateGlobalFilters();
  renderChainFreshness();
  renderChainMonitoring();
  renderSelloutSection();
  initDailyTotalToggle();
  initScrollAnimations();
  initLightbox();
  tabRendered['command-center'] = true;

  // Footer timestamp
  const gen = document.getElementById("footer-generated");
  if (gen && typeof REAL_SELLOUT !== 'undefined') {
    gen.textContent = "Actualizado: " + new Date(REAL_SELLOUT.generatedAt).toLocaleString("es-CL");
  }
}

// ── Tab Navigation ──────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  if (currentTab === tabId) return;

  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tabId)
  );
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === 'tab-' + tabId)
  );

  const cf = document.getElementById('campaign-filters');
  if (cf) cf.style.display = tabId === 'laboratorio' ? '' : 'none';

  currentTab = tabId;

  if (!tabRendered[tabId]) {
    if (tabId === 'command-center') renderSelloutSection();
    if (tabId === 'ranking') renderRankingPage();
    if (tabId === 'top-ventas') renderTopVentasPage();
    if (tabId === 'laboratorio') renderLabPage();
    tabRendered[tabId] = true;
  }
}

// ── Header ──────────────────────────────────────────────
function renderHeaderDate() {
  const now = new Date();
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  document.getElementById("header-date").textContent = now.toLocaleDateString("es-CL", opts);
}

// ── Data Status Bar ─────────────────────────────────────
function renderDataStatusBar() {
  const bar = document.getElementById('data-status-bar');
  if (!bar) return;
  const data = typeof REAL_SELLOUT !== 'undefined' ? REAL_SELLOUT : null;
  if (!data || !data._meta) {
    bar.innerHTML = '<span class="status-item"><span class="status-indicator stale"></span><span class="status-value">Sin datos cargados</span></span>';
    return;
  }
  const m = data._meta;
  const freshClass = m.freshness === 'ok' ? 'ok' : m.freshness === 'warning' ? 'warning' : 'stale';
  const freshLabel = m.freshness === 'ok' ? 'Actualizado' : m.freshness === 'warning' ? 'Actualizar pronto' : 'Desactualizado';

  const genDate = m.generatedAt ? new Date(m.generatedAt).toLocaleDateString('es-CL', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';

  bar.innerHTML = [
    '<span class="status-item"><span class="status-indicator ' + freshClass + '"></span><span class="status-value">' + freshLabel + '</span></span>',
    '<span class="status-separator"></span>',
    '<span class="status-item"><span class="status-label">Ventas:</span><span class="status-value">' + (m.salesRecords ? m.salesRecords.toLocaleString('es-CL') : '—') + ' reg</span></span>',
    '<span class="status-item"><span class="status-label">Periodo:</span><span class="status-value">' + (m.salesDateFrom || '—') + ' a ' + (m.salesDateTo || '—') + ' (' + (m.salesDays || 0) + 'd)</span></span>',
    '<span class="status-separator"></span>',
    '<span class="status-item"><span class="status-label">Stock:</span><span class="status-value">' + (m.stockRecords ? m.stockRecords.toLocaleString('es-CL') : '—') + ' reg</span></span>',
    '<span class="status-separator"></span>',
    '<span class="status-item"><span class="status-label">Cadenas:</span><span class="status-value">' + (m.chains ? m.chains.length : 0) + '</span></span>',
    '<span class="status-item"><span class="status-label">Tiendas:</span><span class="status-value">' + (m.uniqueStores || 0) + '</span></span>',
    '<span class="status-item"><span class="status-label">SKUs:</span><span class="status-value">' + (m.uniqueSKUs ? m.uniqueSKUs.toLocaleString('es-CL') : 0) + '</span></span>',
    '<span class="status-separator"></span>',
    '<span class="status-item"><span class="status-label">Generado:</span><span class="status-value">' + genDate + '</span></span>',
  ].join('');
}

// ── Global Filters ──────────────────────────────────────
// ── Multi-select widget ──────────────────────────────────
function initMultiSelect(containerId, items, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const placeholder = container.dataset.placeholder || 'Todos';
  container.innerHTML = '';
  const trigger = document.createElement('div');
  trigger.className = 'ms-trigger';
  trigger.textContent = placeholder;
  const dropdown = document.createElement('div');
  dropdown.className = 'ms-dropdown';
  items.forEach(item => {
    const val = typeof item === 'string' ? item : item.value;
    const label = typeof item === 'string' ? item : item.label;
    const opt = document.createElement('label');
    opt.className = 'ms-option';
    opt.innerHTML = `<input type="checkbox" value="${val}"><span>${label}</span>`;
    opt.querySelector('input').addEventListener('change', () => {
      updateTrigger();
      if (onChange) onChange();
    });
    dropdown.appendChild(opt);
  });
  const clear = document.createElement('div');
  clear.className = 'ms-clear';
  clear.textContent = 'Limpiar';
  clear.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.querySelectorAll('input').forEach(cb => { cb.checked = false; });
    updateTrigger();
    if (onChange) onChange();
  });
  dropdown.appendChild(clear);
  container.appendChild(trigger);
  container.appendChild(dropdown);
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close other dropdowns
    document.querySelectorAll('.multi-select.open').forEach(ms => { if (ms !== container) ms.classList.remove('open'); });
    container.classList.toggle('open');
  });
  function updateTrigger() {
    const checked = [...dropdown.querySelectorAll('input:checked')];
    dropdown.querySelectorAll('.ms-option').forEach(o => {
      o.classList.toggle('checked', o.querySelector('input').checked);
    });
    if (checked.length === 0) {
      trigger.textContent = placeholder;
      trigger.classList.remove('has-selection');
    } else if (checked.length === 1) {
      trigger.textContent = checked[0].value;
      trigger.classList.add('has-selection');
    } else {
      trigger.textContent = `${checked.length} sel.`;
      trigger.classList.add('has-selection');
    }
  }
  container._getValues = () => {
    return [...dropdown.querySelectorAll('input:checked')].map(cb => cb.value);
  };
}
// Close dropdowns on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.multi-select.open').forEach(ms => ms.classList.remove('open'));
});

function populateGlobalFilters() {
  const data = typeof REAL_SELLOUT !== 'undefined' ? REAL_SELLOUT : null;
  if (!data) return;

  const dateFrom = document.getElementById('filter-date-from');
  const dateTo = document.getElementById('filter-date-to');
  if (data.kpis.dateRange) {
    // Default: last complete Mon-Sun week relative to latest data date
    const latest = new Date(data.kpis.dateRange.to + 'T12:00:00');
    const dayOfWeek = latest.getDay(); // 0=Sun, 1=Mon, ...
    // Find last Sunday (end of last complete week)
    const lastSunday = new Date(latest);
    lastSunday.setDate(latest.getDate() - (dayOfWeek === 0 ? 0 : dayOfWeek));
    // Monday of that week
    const lastMonday = new Date(lastSunday);
    lastMonday.setDate(lastSunday.getDate() - 6);
    // Ensure Monday is within data range
    const earliest = new Date(data.kpis.dateRange.from + 'T12:00:00');
    if (lastMonday >= earliest) {
      dateFrom.value = lastMonday.toISOString().slice(0, 10);
      dateTo.value = lastSunday.toISOString().slice(0, 10);
    } else {
      dateFrom.value = data.kpis.dateRange.from;
      dateTo.value = data.kpis.dateRange.to;
    }
    // Store full range for reference
    dateFrom.min = data.kpis.dateRange.from;
    dateTo.max = data.kpis.dateRange.to;
  }

  const cb = onGlobalFilterChange;
  initMultiSelect('filter-chain', data.allChains || [], cb);
  initMultiSelect('filter-division', (data.byDivision || []).map(d => d.division), cb);
  initMultiSelect('filter-license-global', data.allLicenses || [], cb);
  initMultiSelect('filter-year-product', (data.allYearsProduct || []).map(y => ({ value: y, label: y })), cb);
  initMultiSelect('filter-quarter', (data.allQuarters || []).map(q => ({ value: q, label: q })), cb);
  initMultiSelect('filter-temporada', data.allTemporadas || [], cb);
  initMultiSelect('filter-clase', data.allClases || [], cb);
  initMultiSelect('filter-subclase', data.allSubclases || [], cb);
  initMultiSelect('filter-categoria', data.allCategorias || [], cb);

  ['filter-date-from','filter-date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', cb);
  });
}

function _msValues(id) {
  const el = document.getElementById(id);
  return el && el._getValues ? el._getValues() : [];
}

function getGlobalFilters() {
  return {
    dateFrom: document.getElementById('filter-date-from')?.value || '',
    dateTo: document.getElementById('filter-date-to')?.value || '',
    chains: _msValues('filter-chain'),
    divisions: _msValues('filter-division'),
    licenses: _msValues('filter-license-global'),
    years: _msValues('filter-year-product'),
    quarters: _msValues('filter-quarter'),
    temporadas: _msValues('filter-temporada'),
    clases: _msValues('filter-clase'),
    subclases: _msValues('filter-subclase'),
    categorias: _msValues('filter-categoria'),
  };
}

// Helper: proportionally scale dailySales using a breakdown map
// selectedKeys can be a string or array of strings
function scaleDailySales(dailySales, breakdownMap, selectedKeys) {
  const keys = Array.isArray(selectedKeys) ? selectedKeys : [selectedKeys];
  return dailySales.map(d => {
    const licBreakdown = breakdownMap[d.license];
    if (!licBreakdown) return null;
    const totalU = Object.values(licBreakdown).reduce((s, v) => s + v.units, 0);
    if (totalU === 0) return null;
    const selectedU = keys.reduce((s, k) => s + (licBreakdown[k]?.units || 0), 0);
    if (selectedU === 0) return null;
    const ratio = selectedU / totalU;
    return { ...d, units: Math.round(d.units * ratio), clp: Math.round(d.clp * ratio) };
  }).filter(d => d && d.units > 0);
}

function getFilteredData() {
  const src = typeof REAL_SELLOUT !== 'undefined' ? REAL_SELLOUT : null;
  if (!src) return null;
  const f = getGlobalFilters();
  const noFilter = !f.dateFrom && !f.dateTo && !f.chains.length && !f.divisions.length
                && !f.licenses.length && !f.years.length && !f.quarters.length && !f.temporadas.length
                && !f.clases.length && !f.subclases.length && !f.categorias.length;
  if (noFilter) return src;

  const licDivBreakdown = src.licenseDivisionBreakdown || {};

  let dailySales = src.dailySales || [];
  let _productFilterRatioU = 1, _productFilterRatioC = 1;

  // ═══════════════════════════════════════════════════════════
  // _bcd (dailyByChainDivision) is the SINGLE SOURCE OF TRUTH
  // for all chain × division × date aggregations.
  // All other aggregates are derived from it.
  // ═══════════════════════════════════════════════════════════
  let _bcd = src.dailyByChainDivision || [];
  const _bcdOrig = _bcd; // keep original for ratio computations

  // ── Step 1: Apply all EXACT filters to _bcd ──
  if (f.dateFrom) { _bcd = _bcd.filter(d => d.date >= f.dateFrom); dailySales = dailySales.filter(d => d.date >= f.dateFrom); }
  if (f.dateTo)   { _bcd = _bcd.filter(d => d.date <= f.dateTo);   dailySales = dailySales.filter(d => d.date <= f.dateTo); }
  if (f.chains.length)    { const s = new Set(f.chains);    _bcd = _bcd.filter(d => s.has(d.chain)); }
  if (f.divisions.length) { const s = new Set(f.divisions); _bcd = _bcd.filter(d => s.has(d.division)); }

  // ── Step 2: Derive dailyByChain and byDivisionDaily from filtered _bcd ──
  const _aggByKey = (arr, keyFn, initFn) => {
    const agg = {};
    arr.forEach(d => { const k = keyFn(d); if (!agg[k]) agg[k] = initFn(d); agg[k].units += d.units; agg[k].clp += d.clp; });
    return Object.values(agg).sort((a, b) => a.date ? a.date.localeCompare(b.date) : 0);
  };
  let dailyByChain = _aggByKey(_bcd,
    d => d.date + '|' + d.chain,
    d => ({ date: d.date, chain: d.chain, units: 0, clp: 0 })
  );
  let byDivisionDaily = _aggByKey(_bcd,
    d => d.date + '|' + d.division,
    d => ({ date: d.date, division: d.division, units: 0, clp: 0 })
  );

  // ── Step 3: Chain filter on dailySales (proportional, license-level) ──
  if (f.chains.length) {
    const chainLicData = {};
    f.chains.forEach(ch => {
      const lics = (src.salesByChainLicense || {})[ch] || {};
      Object.entries(lics).forEach(([lic, d]) => {
        if (!chainLicData[lic]) chainLicData[lic] = { units: 0, clp: 0 };
        chainLicData[lic].units += d.units; chainLicData[lic].clp += d.clp;
      });
    });
    const licTotals = {};
    Object.values(src.salesByChainLicense || {}).forEach(lics => {
      Object.entries(lics).forEach(([lic, d]) => {
        if (!licTotals[lic]) licTotals[lic] = { units: 0, clp: 0 };
        licTotals[lic].units += d.units; licTotals[lic].clp += d.clp;
      });
    });
    dailySales = dailySales.map(d => {
      const chainD = chainLicData[d.license]; const totalD = licTotals[d.license];
      if (!chainD || !totalD || totalD.units === 0) return null;
      const ratio = chainD.units / totalD.units;
      return { ...d, units: Math.round(d.units * ratio), clp: Math.round(d.clp * ratio) };
    }).filter(d => d && d.units > 0);
  }

  // ── Step 4: Division filter on dailySales (proportional, license-level) ──
  if (f.divisions.length) {
    dailySales = scaleDailySales(dailySales, licDivBreakdown, f.divisions);
  }

  // ── Step 5: License filter (exact) ──
  if (f.licenses.length) {
    const licSet = new Set(f.licenses);
    dailySales = dailySales.filter(d => licSet.has(d.license));
  }

  // ── Step 6: Temporal + product attribute filters (proportional) ──
  if (f.years.length) dailySales = scaleDailySales(dailySales, src.licenseYearBreakdown || {}, f.years);
  if (f.quarters.length) dailySales = scaleDailySales(dailySales, src.licenseQuarterBreakdown || {}, f.quarters);
  if (f.temporadas.length) dailySales = scaleDailySales(dailySales, src.licenseTemporadaBreakdown || {}, f.temporadas);
  if (f.clases.length) dailySales = scaleDailySales(dailySales, src.licenseClaseBreakdown || {}, f.clases);
  if (f.subclases.length) dailySales = scaleDailySales(dailySales, src.licenseSubclaseBreakdown || {}, f.subclases);
  if (f.categorias.length) dailySales = scaleDailySales(dailySales, src.licenseCategoriaBreakdown || {}, f.categorias);

  // ── Step 7: Compute product filter ratio and apply to _bcd-derived arrays ──
  if (f.licenses.length || f.years.length || f.quarters.length || f.temporadas.length || f.clases.length || f.subclases.length || f.categorias.length) {
    const allLicSummary = src.licenseSummary || [];
    const origTotalU = allLicSummary.reduce((s, l) => s + l.units, 0) || 1;
    const origTotalC = allLicSummary.reduce((s, l) => s + l.clp, 0) || 1;
    let filteredLics = allLicSummary.slice();
    if (f.licenses.length) { const ls = new Set(f.licenses); filteredLics = filteredLics.filter(l => ls.has(l.license)); }
    const _scaleByBreak = (lics, brk, vals) => lics.map(l => {
      const b = brk[l.license]; if (!b) return null;
      const tU = Object.values(b).reduce((s, v) => s + v.units, 0);
      const fU = vals.reduce((s, v) => s + (b[v]?.units || 0), 0);
      if (fU === 0) return null; const r = tU > 0 ? fU / tU : 0;
      return { ...l, units: Math.round(l.units * r), clp: Math.round(l.clp * r) };
    }).filter(Boolean);
    if (f.temporadas.length) filteredLics = _scaleByBreak(filteredLics, src.licenseTemporadaBreakdown || {}, f.temporadas);
    if (f.years.length) filteredLics = _scaleByBreak(filteredLics, src.licenseYearBreakdown || {}, f.years);
    if (f.quarters.length) filteredLics = _scaleByBreak(filteredLics, src.licenseQuarterBreakdown || {}, f.quarters);
    if (f.clases.length) filteredLics = _scaleByBreak(filteredLics, src.licenseClaseBreakdown || {}, f.clases);
    if (f.subclases.length) filteredLics = _scaleByBreak(filteredLics, src.licenseSubclaseBreakdown || {}, f.subclases);
    if (f.categorias.length) filteredLics = _scaleByBreak(filteredLics, src.licenseCategoriaBreakdown || {}, f.categorias);
    const filtTotalU = filteredLics.reduce((s, l) => s + l.units, 0);
    const filtTotalC = filteredLics.reduce((s, l) => s + l.clp, 0);
    _productFilterRatioU = filtTotalU / origTotalU;
    _productFilterRatioC = filtTotalC / origTotalC;
    if (_productFilterRatioU < 1) {
      dailyByChain = dailyByChain.map(d => ({ ...d, units: Math.round(d.units * _productFilterRatioU), clp: Math.round(d.clp * _productFilterRatioC) })).filter(d => d.units > 0);
      byDivisionDaily = byDivisionDaily.map(d => ({ ...d, units: Math.round(d.units * _productFilterRatioU), clp: Math.round(d.clp * _productFilterRatioC) })).filter(d => d.units > 0);
    }
  }

  // ── Step 8: Aggregate totals from dailyByChain (single source of truth) ──
  const dtAgg = {};
  dailyByChain.forEach(d => {
    if (!dtAgg[d.date]) dtAgg[d.date] = { date: d.date, units: 0, clp: 0 };
    dtAgg[d.date].units += d.units; dtAgg[d.date].clp += d.clp;
  });
  let filteredDailyTotals = Object.values(dtAgg).sort((a, b) => a.date.localeCompare(b.date));

  // ── Step 9: Normalize dailySales to match filteredDailyTotals ──
  const licColors = src.byLicense || [];
  const _colorForLic = (lic, i) => { const o = licColors.find(c => c.license === lic); return o ? o.color : ["#6366f1","#f97316","#22c55e","#eab308","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#3b82f6","#84cc16","#06b6d4","#d946ef","#f43f5e","#10b981"][i % 15]; };
  if (f.chains.length || f.divisions.length || f.years.length || f.quarters.length || f.temporadas.length || f.clases.length || f.subclases.length || f.categorias.length) {
    const authTotals = {}; filteredDailyTotals.forEach(d => { authTotals[d.date] = { units: d.units, clp: d.clp }; });
    const salesTotals = {}; dailySales.forEach(d => { if (!salesTotals[d.date]) salesTotals[d.date] = { units: 0, clp: 0 }; salesTotals[d.date].units += d.units; salesTotals[d.date].clp += d.clp; });
    dailySales = dailySales.map(d => {
      const auth = authTotals[d.date]; const cur = salesTotals[d.date];
      if (!auth || !cur || cur.units === 0) return d;
      return { ...d, units: Math.round(d.units * auth.units / cur.units), clp: Math.round(d.clp * (cur.clp > 0 ? auth.clp / cur.clp : 1)) };
    });
  }
  // Aggregate byLicense from dailySales
  const licAgg = {};
  dailySales.forEach(d => { if (!licAgg[d.license]) licAgg[d.license] = { license: d.license, units: 0, clp: 0 }; licAgg[d.license].units += d.units; licAgg[d.license].clp += d.clp; });
  const byLicense = Object.values(licAgg).sort((a, b) => b.units - a.units);
  byLicense.forEach((l, i) => { l.color = _colorForLic(l.license, i); });

  // Aggregate byChain from dailyByChain
  const chainAgg = {};
  dailyByChain.forEach(d => { if (!chainAgg[d.chain]) chainAgg[d.chain] = { chain: d.chain, units: 0, clp: 0 }; chainAgg[d.chain].units += d.units; chainAgg[d.chain].clp += d.clp; });
  let byChain = Object.values(chainAgg).sort((a, b) => b.clp - a.clp);

  // ── Step 10: rankingByChainStore — filter then RECONCILE with _bcd totals ──
  let rankingByChainStore = src.rankingByChainStore || {};
  if (f.chains.length) {
    const chainSet = new Set(f.chains); const filtered = {};
    Object.entries(rankingByChainStore).forEach(([ch, stores]) => { if (chainSet.has(ch)) filtered[ch] = stores; });
    rankingByChainStore = filtered;
  }
  if (f.divisions.length) {
    const filteredRanking = {};
    Object.entries(rankingByChainStore).forEach(([ch, stores]) => {
      const filtered = stores.filter(s => s.byDivision && f.divisions.some(div => s.byDivision[div])).map(s => {
        let uSum = 0, cSum = 0, costSum = 0, stockSum = 0;
        const filteredDivs = {};
        f.divisions.forEach(div => {
          const dd = s.byDivision[div];
          if (dd) { uSum += dd.units; cSum += dd.clp; costSum += (dd.costos || 0); stockSum += (dd.stock || 0); filteredDivs[div] = dd; }
        });
        const sales4w = s.weeksOfStock > 0 && s.stockUnits > 0 ? s.stockUnits / s.weeksOfStock * 4 : 0;
        const divStockRatio = s.stockUnits > 0 ? stockSum / s.stockUnits : 0;
        const weeklyAvg = sales4w * divStockRatio / 4;
        return { ...s, units: uSum, clp: cSum, costos: costSum,
          margin: cSum > 0 ? Math.round((cSum - costSum) / cSum * 1000) / 10 : 0,
          stockUnits: stockSum, weeksOfStock: weeklyAvg > 0 ? Math.round(stockSum / weeklyAvg * 10) / 10 : 0,
          byDivision: filteredDivs };
      });
      if (filtered.length) filteredRanking[ch] = filtered;
    });
    rankingByChainStore = filteredRanking;
  }

  // RECONCILE: Scale each chain's ranking stores so the chain total matches _bcd exactly.
  // This replaces the old date-ratio and product-ratio cascading which caused inconsistencies.
  const _bcdByChain = {}; // exact totals from _bcd (already date+chain+division filtered)
  _bcd.forEach(d => {
    if (!_bcdByChain[d.chain]) _bcdByChain[d.chain] = { units: 0, clp: 0 };
    _bcdByChain[d.chain].units += d.units;
    _bcdByChain[d.chain].clp += d.clp;
  });
  // Apply product filter ratio to _bcd totals too (license/temporada/etc are proportional)
  if (_productFilterRatioU < 1) {
    Object.values(_bcdByChain).forEach(v => { v.units = Math.round(v.units * _productFilterRatioU); v.clp = Math.round(v.clp * _productFilterRatioC); });
  }
  const reconciledRanking = {};
  Object.entries(rankingByChainStore).forEach(([ch, stores]) => {
    const bcdTarget = _bcdByChain[ch];
    if (!bcdTarget || bcdTarget.units === 0) return;
    const rankTotal = stores.reduce((s, st) => s + st.units, 0);
    const rankTotalC = stores.reduce((s, st) => s + st.clp, 0);
    if (rankTotal === 0) return;
    const uR = bcdTarget.units / rankTotal;
    const cR = rankTotalC > 0 ? bcdTarget.clp / rankTotalC : uR;
    reconciledRanking[ch] = stores.map(s => {
      const u = Math.round(s.units * uR);
      const c = Math.round(s.clp * cR);
      const cost = Math.round((s.costos || 0) * uR);
      return { ...s, units: u, clp: c, costos: cost,
        margin: c > 0 ? Math.round((c - cost) / c * 1000) / 10 : 0 };
    });
  });
  rankingByChainStore = reconciledRanking;

  // KPIs derived from filteredDailyTotals (same source as chart — always consistent)
  const totalUnits = filteredDailyTotals.reduce((s, d) => s + d.units, 0);
  const totalCLP = filteredDailyTotals.reduce((s, d) => s + d.clp, 0);
  const dates = filteredDailyTotals.map(d => d.date);
  const filteredStoreCount = Object.values(rankingByChainStore).reduce((s, stores) => s + stores.length, 0);
  const kpis = {
    ...src.kpis,
    totalUnits, totalCLP,
    avgUnitsPerDay: dates.length ? Math.round(totalUnits / dates.length) : 0,
    avgUnitsPerStore: filteredStoreCount > 0 ? Math.round(totalUnits / filteredStoreCount) : 0,
    uniqueStores: filteredStoreCount,
    uniqueChains: byChain.length,
    numDays: dates.length,
    dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : src.kpis.dateRange,
  };

  // Aggregate byDivision from byDivisionDaily (derived from _bcd)
  let byDivision = src.byDivision || [];
  if (f.chains.length || f.divisions.length || f.dateFrom || f.dateTo) {
    const divAgg = {};
    byDivisionDaily.forEach(d => {
      if (!divAgg[d.division]) divAgg[d.division] = { division: d.division, units: 0, clp: 0 };
      divAgg[d.division].units += d.units; divAgg[d.division].clp += d.clp;
    });
    const divStoreCounts = {};
    Object.values(rankingByChainStore).flat().forEach(s => {
      Object.keys(s.byDivision || {}).forEach(div => { divStoreCounts[div] = (divStoreCounts[div] || 0) + 1; });
    });
    const totalDivUnits = Object.values(divAgg).reduce((s, d) => s + d.units, 0);
    byDivision = Object.values(divAgg).map(d => {
      const orig = (src.byDivision || []).find(o => o.division === d.division) || {};
      return { ...orig, ...d,
        pctOfTotal: totalDivUnits > 0 ? Math.round(d.units / totalDivUnits * 1000) / 10 : 0,
        storeCount: divStoreCounts[d.division] || 0 };
    }).sort((a, b) => b.units - a.units);
    if (f.divisions.length) { const ds = new Set(f.divisions); byDivision = byDivision.filter(d => ds.has(d.division)); }
  }

  // Filter divisionMixByChain
  let divisionMixByChain = src.divisionMixByChain || [];
  if (f.chains.length) {
    const chainSet = new Set(f.chains);
    divisionMixByChain = divisionMixByChain.filter(d => chainSet.has(d.chain));
  }

  // ── Filtrar velocityMetrics ──
  let velocityMetrics = src.velocityMetrics ? { ...src.velocityMetrics } : null;
  if (velocityMetrics) {
    // Use filtered date range for activeDays
    const filteredDates = new Set(filteredDailyTotals.map(d => d.date));
    const filtActiveDays = filteredDates.size || velocityMetrics.activeDays || 1;
    let velByChain = velocityMetrics.velocityByChain || [];
    if (f.chains.length || f.divisions.length || f.dateFrom || f.dateTo) {
      // Recalculate from byChain (derived from _bcd — exact)
      velByChain = byChain.map(ch => ({
        chain: ch.chain, unitsPerDay: Math.round(ch.units / filtActiveDays), trend: 0
      })).filter(v => v.unitsPerDay > 0).sort((a, b) => b.unitsPerDay - a.unitsPerDay);
    }
    velocityMetrics = { ...velocityMetrics, velocityByChain: velByChain, activeDays: filtActiveDays };
  }

  // ── Filtrar priceMetrics ──
  let priceMetrics = src.priceMetrics ? { ...src.priceMetrics } : null;
  if (priceMetrics && f.divisions.length) {
    const divSet = new Set(f.divisions);
    priceMetrics = {
      ...priceMetrics,
      byDivision: (priceMetrics.byDivision || []).filter(d => divSet.has(d.division)),
    };
  }

  // ── Filtrar stock OOS ──
  let stock = src.stock ? { ...src.stock } : null;
  if (stock) {
    let filteredChains = stock.oosByChain || [];
    let filteredDivs = stock.oosByDivision || [];
    let filteredLics = stock.oosByLicense || [];
    if (f.chains.length) { const s = new Set(f.chains); filteredChains = filteredChains.filter(d => s.has(d.chain)); }
    if (f.divisions.length) { const s = new Set(f.divisions); filteredDivs = filteredDivs.filter(d => s.has(d.division)); }
    if (f.licenses.length) { const s = new Set(f.licenses); filteredLics = filteredLics.filter(d => s.has(d.license)); }
    // Temporada/Year/Quarter: determine relevant licenses from breakdown maps, filter oosByLicense
    let relevantLics = null;
    if (f.temporadas.length) {
      const tBreak = src.licenseTemporadaBreakdown || {};
      const lics = new Set();
      Object.entries(tBreak).forEach(([lic, temps]) => { if (f.temporadas.some(t => temps[t])) lics.add(lic); });
      relevantLics = relevantLics ? new Set([...relevantLics].filter(l => lics.has(l))) : lics;
    }
    if (f.years.length) {
      const yBreak = src.licenseYearBreakdown || {};
      const lics = new Set();
      Object.entries(yBreak).forEach(([lic, years]) => { if (f.years.some(y => years[y])) lics.add(lic); });
      relevantLics = relevantLics ? new Set([...relevantLics].filter(l => lics.has(l))) : lics;
    }
    if (f.quarters.length) {
      const qBreak = src.licenseQuarterBreakdown || {};
      const lics = new Set();
      Object.entries(qBreak).forEach(([lic, qs]) => { if (f.quarters.some(q => qs[q])) lics.add(lic); });
      relevantLics = relevantLics ? new Set([...relevantLics].filter(l => lics.has(l))) : lics;
    }
    const _filterRelevantLics = (breakdownKey, selectedVals) => {
      const brk = src[breakdownKey] || {};
      const lics = new Set();
      Object.entries(brk).forEach(([lic, vals]) => { if (selectedVals.some(v => vals[v])) lics.add(lic); });
      relevantLics = relevantLics ? new Set([...relevantLics].filter(l => lics.has(l))) : lics;
    };
    if (f.clases.length) _filterRelevantLics('licenseClaseBreakdown', f.clases);
    if (f.subclases.length) _filterRelevantLics('licenseSubclaseBreakdown', f.subclases);
    if (f.categorias.length) _filterRelevantLics('licenseCategoriaBreakdown', f.categorias);
    if (relevantLics) {
      filteredLics = filteredLics.filter(d => relevantLics.has(d.license));
      // Recalculate oosByDivision proportionally using licenseDivisionBreakdown (has ALL licenses)
      const licDivBk = src.licenseDivisionBreakdown || {};
      const divRelevance = {}; // division → { relevant: units, total: units }
      Object.entries(licDivBk).forEach(([lic, divs]) => {
        Object.entries(divs).forEach(([div, data]) => {
          if (!divRelevance[div]) divRelevance[div] = { relevant: 0, total: 0 };
          divRelevance[div].total += data.units || 0;
          if (relevantLics.has(lic)) divRelevance[div].relevant += data.units || 0;
        });
      });
      filteredDivs = filteredDivs.map(d => {
        const rel = divRelevance[d.division];
        if (!rel || rel.total === 0) return null;
        const ratio = rel.relevant / rel.total;
        if (ratio === 0) return null;
        return {
          ...d,
          totalSKUs: Math.round(d.totalSKUs * ratio),
          oosSKUs: Math.round(d.oosSKUs * ratio),
          oosRate: d.totalSKUs > 0 ? Math.round(Math.round(d.oosSKUs * ratio) / Math.max(1, Math.round(d.totalSKUs * ratio)) * 1000) / 10 : 0
        };
      }).filter(Boolean).sort((a, b) => b.oosRate - a.oosRate);
      if (f.divisions.length) {
        const ds = new Set(f.divisions);
        filteredDivs = filteredDivs.filter(d => ds.has(d.division));
      }
    }
    const needsRecalc = f.chains.length || f.divisions.length || f.licenses.length || relevantLics;
    if (needsRecalc) {
      // Priority for KPI base: chain > license (when temporada/year/Q filtered) > division
      let base;
      if (f.chains.length) base = filteredChains;
      else if (relevantLics || f.licenses.length) base = filteredLics;
      else if (f.divisions.length) base = filteredDivs;
      else base = filteredLics;
      const totalSKUs = base.reduce((s, d) => s + d.totalSKUs, 0);
      const totalOOS = base.reduce((s, d) => s + d.oosSKUs, 0);
      const filteredStockUnits = Object.values(rankingByChainStore)
        .flat().reduce((s, st) => s + (st.stockUnits || 0), 0);
      stock = {
        ...stock,
        oosByChain: filteredChains,
        oosByDivision: filteredDivs,
        oosByLicense: filteredLics,
        totalSKUs,
        totalOOS,
        oosRate: totalSKUs > 0 ? Math.round(totalOOS / totalSKUs * 1000) / 10 : 0,
        totalStockUnits: filteredStockUnits,
      };
    }
  }

  return {
    ...src,
    kpis,
    dailySales,
    byLicense,
    byChain,
    dailyTotals: filteredDailyTotals,
    dailyByChain,
    byDivisionDaily,
    rankingByChainStore,
    byDivision,
    divisionMixByChain,
    velocityMetrics,
    priceMetrics,
    stock,
  };
}

function onGlobalFilterChange() {
  // Mark non-active tabs as needing re-render
  if (currentTab !== 'command-center') tabRendered['command-center'] = false;
  if (currentTab !== 'ranking') tabRendered['ranking'] = false;
  if (currentTab !== 'top-ventas') tabRendered['top-ventas'] = false;
  if (currentTab !== 'laboratorio') tabRendered['laboratorio'] = false;

  if (currentTab === 'command-center') {
    renderSelloutSection();
  } else if (currentTab === 'ranking') {
    renderRankingPage();
  } else if (currentTab === 'top-ventas') {
    renderTopVentasPage();
  } else if (currentTab === 'laboratorio') {
    renderLabPage();
  }
}

// ── Campaign Filters (Tab 1 only) ──────────────────────
function populateCampaignFilters() {
  const clientFilter = document.getElementById("filter-client");
  const licenseFilter = document.getElementById("filter-license");
  const gestorFilter = document.getElementById("filter-gestor");

  [...new Set(CAMPAIGNS.map(c => c.client))].forEach(cl => {
    const opt = document.createElement("option");
    opt.value = cl; opt.textContent = cl;
    clientFilter.appendChild(opt);
  });

  [...new Set(CAMPAIGNS.flatMap(c => c.licenses))].forEach(lic => {
    const opt = document.createElement("option");
    opt.value = lic; opt.textContent = lic;
    licenseFilter.appendChild(opt);
  });

  [...new Set(CAMPAIGNS.flatMap(c => c.stores.map(s => s.gestor)))].sort().forEach(g => {
    const opt = document.createElement("option");
    opt.value = g; opt.textContent = g;
    gestorFilter.appendChild(opt);
  });

  [clientFilter, document.getElementById("filter-status"), licenseFilter, gestorFilter].forEach(el => {
    el.addEventListener("change", applyCampaignFilters);
  });
}

function applyCampaignFilters() {
  const client = document.getElementById("filter-client").value;
  const status = document.getElementById("filter-status").value;
  const license = document.getElementById("filter-license").value;
  const gestor = document.getElementById("filter-gestor").value;

  let firstVisible = null;
  document.querySelectorAll(".campaign-card").forEach(card => {
    const c = CAMPAIGNS.find(cam => cam.id === card.dataset.campaignId);
    if (!c) return;
    let show = true;
    if (client && c.client !== client) show = false;
    if (status && c.status !== status) show = false;
    if (license && !c.licenses.includes(license)) show = false;
    if (gestor && !c.stores.some(s => s.gestor === gestor)) show = false;
    card.style.display = show ? "" : "none";
    if (show && !firstVisible) firstVisible = c.id;
  });

  if (firstVisible) selectCampaign(firstVisible);

  if (gestor) {
    document.querySelectorAll("#store-table-body tr").forEach(row => {
      const gc = row.querySelector(".gestor-name");
      if (gc) row.style.display = gc.textContent === gestor ? "" : "none";
    });
  }
}

// ── KPIs ────────────────────────────────────────────────
function renderKPIs() {
  const stats = getGlobalStats();
  animateCounter("kpi-implementation", 0, stats.pctImplementation, "%");
  animateCounter("kpi-campaigns", 0, stats.activeCampaigns, "");
  animateCounter("kpi-pdv", 0, stats.totalImplemented, "");
  animateCounter("kpi-coverage", 0, stats.pctCoverage, "%");
  animateCounter("kpi-licenses", 0, stats.uniqueLicenses, "");

  document.getElementById("kpi-implementation-sub").textContent = `${stats.totalImplemented} de ${stats.totalTarget} PDV`;
  document.getElementById("kpi-campaigns-sub").textContent = `${stats.totalCampaigns} total`;
  document.getElementById("kpi-pdv-sub").textContent = `en ${stats.uniqueClients} cadenas`;
  document.getElementById("kpi-coverage-sub").textContent = `gestores en terreno`;
  document.getElementById("kpi-licenses-sub").textContent = `propiedades activas`;
}

function animateCounter(elementId, start, end, suffix) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const duration = 1200;
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * eased);
    el.textContent = current.toLocaleString("es-CL") + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── Campaign Cards ──────────────────────────────────────
function renderCampaignCards() {
  const grid = document.getElementById("campaign-grid");
  grid.innerHTML = "";
  CAMPAIGNS.forEach(c => {
    const stats = getCampaignStats(c);
    const card = document.createElement("div");
    card.className = "campaign-card fade-in";
    card.dataset.campaignId = c.id;
    const statusLabel = { active: "En Ejecución", completed: "Completada", planning: "Planificación" }[c.status] || c.status;
    const typeLabel = c.businessType === "continuidad" ? "Continuidad" : "Puntual";
    card.innerHTML = `
      <div class="campaign-header">
        <div class="campaign-name">${c.name}</div>
        <div class="campaign-status status-${c.status}">${statusLabel}</div>
      </div>
      <div class="campaign-meta">
        <div class="campaign-meta-item"><span class="label">Cliente:</span> ${c.client}</div>
        <div class="campaign-meta-item"><span class="label">Canal:</span> ${c.channel}</div>
        <div class="campaign-meta-item"><span class="label">Inicio:</span> ${formatDate(c.startDate)}</div>
        <div class="campaign-meta-item">
          <span class="business-type-tag type-${c.businessType}">${typeLabel}</span>
          ${c.isMultiLicense ? '<span class="business-type-tag type-continuidad">Multi-Licencia</span>' : ''}
        </div>
      </div>
      <div class="license-tags">${c.licenses.map(l => `<span class="license-tag">${l}</span>`).join("")}</div>
      <div class="campaign-progress">
        <div class="progress-header">
          <span class="progress-label">Implementación</span>
          <span class="progress-value">${stats.implemented}/${stats.total} PDV (${stats.pctImplementation}%)</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:0%" data-target="${stats.pctImplementation}"></div></div>
      </div>`;
    card.addEventListener("click", () => selectCampaign(c.id));
    grid.appendChild(card);
  });
  requestAnimationFrame(() => {
    document.querySelectorAll(".progress-fill").forEach(bar => {
      setTimeout(() => { bar.style.width = bar.dataset.target + "%"; }, 200);
    });
  });
}

function selectCampaign(campaignId) {
  selectedCampaignId = campaignId;
  const campaign = CAMPAIGNS.find(c => c.id === campaignId);
  if (!campaign) return;
  document.querySelectorAll(".campaign-card").forEach(card => {
    card.classList.toggle("active", card.dataset.campaignId === campaignId);
  });
  renderStoreTable(campaign);
  renderPhotoGallery(campaign);
  renderImplementationChart(campaign);
  renderCoverageChart(campaign);
  updateCampaignKPIs(campaign);
}

function updateCampaignKPIs(campaign) {
  const detailEl = document.getElementById("campaign-detail-title");
  if (detailEl) detailEl.textContent = campaign.name;
}

// ── Store Table ─────────────────────────────────────────
function renderStoreTable(campaign) {
  const tbody = document.getElementById("store-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  campaign.stores.forEach(store => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="store-name-cell" title="${store.name}">${store.shortName}</td>
      <td>${store.region}</td>
      <td><span class="gestor-name">${store.gestor}</span></td>
      <td>${store.implemented ? '<span class="status-badge badge-success">Implementado</span>' : '<span class="status-badge badge-warning">Pendiente</span>'}</td>
      <td>${store.cobertura ? '<span class="status-badge badge-success">Si</span>' : '<span class="status-badge badge-danger">No</span>'}</td>
      <td>${store.graphicsArrived ? '<span class="status-badge badge-success">Si</span>' : '<span class="status-badge badge-danger">No</span>'}</td>
      <td>${store.photos.length > 0 ? `<span class="status-badge badge-info">${store.photos.length} fotos</span>` : '<span class="status-badge badge-warning">Sin fotos</span>'}</td>
      <td>${store.implementationDate ? formatDate(store.implementationDate) : '-'}</td>`;
    tbody.appendChild(tr);
  });
  const tt = document.getElementById("store-table-title");
  if (tt) tt.textContent = `Detalle por Sala - ${campaign.name}`;
}

// ── Photo Gallery ───────────────────────────────────────
function renderPhotoGallery(campaign) {
  const controls = document.getElementById("gallery-controls");
  const grid = document.getElementById("photo-grid");
  if (!controls || !grid) return;
  const storesWithPhotos = campaign.stores.filter(s => s.photos.length > 0);
  controls.innerHTML = `<button class="gallery-btn active" data-store="all">Todas</button>
    ${storesWithPhotos.map(s => `<button class="gallery-btn" data-store="${s.code}">${s.shortName}</button>`).join("")}`;
  controls.querySelectorAll(".gallery-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      controls.querySelectorAll(".gallery-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      filterPhotos(campaign, btn.dataset.store);
    });
  });
  filterPhotos(campaign, "all");
}

function filterPhotos(campaign, storeCode) {
  const grid = document.getElementById("photo-grid");
  grid.innerHTML = "";
  const stores = storeCode === "all" ? campaign.stores.filter(s => s.photos.length > 0) : campaign.stores.filter(s => s.code === storeCode);
  stores.forEach(store => {
    store.photos.forEach((photo, idx) => {
      const card = document.createElement("div");
      card.className = "photo-card";
      card.dataset.src = IMAGE_BASE_PATH + photo;
      card.dataset.caption = `${store.shortName} - Lado ${idx + 1}`;
      card.innerHTML = `<img src="${IMAGE_BASE_PATH + photo}" alt="Foto ${idx + 1}" loading="lazy" onerror="this.parentElement.style.display='none'">
        <div class="photo-label">${store.shortName} - Lado ${idx + 1}</div>`;
      card.addEventListener("click", () => openLightbox(card.dataset.src, card.dataset.caption));
      grid.appendChild(card);
    });
  });
  if (grid.children.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:2rem;font-size:0.85rem;">Sin evidencia fotográfica</div>`;
  }
}

// ── Lightbox ────────────────────────────────────────────
let currentLightboxIndex = 0;
let lightboxImages = [];

function initLightbox() {
  const lb = document.getElementById("lightbox");
  if (!lb) return;
  lb.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") navigateLightbox(-1);
    if (e.key === "ArrowRight") navigateLightbox(1);
  });
  lb.querySelector(".lightbox-prev").addEventListener("click", () => navigateLightbox(-1));
  lb.querySelector(".lightbox-next").addEventListener("click", () => navigateLightbox(1));
}

function openLightbox(src, caption) {
  const lb = document.getElementById("lightbox");
  lightboxImages = Array.from(document.querySelectorAll(".photo-card")).map(c => ({ src: c.dataset.src, caption: c.dataset.caption }));
  currentLightboxIndex = Math.max(0, lightboxImages.findIndex(i => i.src === src));
  lb.querySelector("img").src = src;
  lb.querySelector(".lightbox-caption").textContent = caption;
  lb.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  document.getElementById("lightbox").classList.remove("active");
  document.body.style.overflow = "";
}

function navigateLightbox(dir) {
  if (!lightboxImages.length) return;
  currentLightboxIndex = (currentLightboxIndex + dir + lightboxImages.length) % lightboxImages.length;
  const item = lightboxImages[currentLightboxIndex];
  const lb = document.getElementById("lightbox");
  lb.querySelector("img").src = item.src;
  lb.querySelector(".lightbox-caption").textContent = item.caption;
}

// ── Campaign Charts ─────────────────────────────────────
function renderImplementationChart(campaign) {
  const ctx = document.getElementById("chart-implementation");
  if (!ctx) return;
  if (chartInstances.implementation) chartInstances.implementation.destroy();
  const regionMap = {};
  campaign.stores.forEach(s => {
    if (!regionMap[s.region]) regionMap[s.region] = { implemented: 0, pending: 0 };
    if (s.implemented) regionMap[s.region].implemented++; else regionMap[s.region].pending++;
  });
  if (campaign.stores.length < campaign.totalTargetPDV) {
    regionMap["Sin asignar"] = { implemented: 0, pending: campaign.totalTargetPDV - campaign.stores.length };
  }
  const labels = Object.keys(regionMap);
  chartInstances.implementation = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Implementados", data: labels.map(r => regionMap[r].implemented), backgroundColor: "rgba(99,102,241,0.8)", borderRadius: 4 },
        { label: "Pendientes", data: labels.map(r => regionMap[r].pending), backgroundColor: "rgba(148,163,184,0.2)", borderRadius: 4 }
      ]
    },
    options: { ...chartOptionsBar(), plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 11 }, padding: 12 } } }, scales: { x: { stacked: true, ...chartScaleX() }, y: { stacked: true, ...chartScaleY("Tiendas (PDV)") } } }
  });
}

function renderCoverageChart(campaign) {
  const ctx = document.getElementById("chart-coverage");
  if (!ctx) return;
  if (chartInstances.coverage) chartInstances.coverage.destroy();
  const covered = campaign.stores.filter(s => s.cobertura).length;
  const notCovered = campaign.stores.filter(s => !s.cobertura).length;
  const total = covered + notCovered;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  // Center text plugin for this chart
  const centerTextPlugin = {
    id: "coverageCenterText",
    afterDraw(chart) {
      const { ctx: c, chartArea: { top, bottom, left, right } } = chart;
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      c.save();
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = pct >= 80 ? "#34d399" : pct >= 50 ? "#fbbf24" : "#f87171";
      c.font = "bold 2rem Inter, sans-serif";
      c.fillText(pct + "%", cx, cy - 8);
      c.fillStyle = "#94a3b8";
      c.font = "0.7rem Inter, sans-serif";
      c.fillText(`${covered} de ${total} tiendas`, cx, cy + 18);
      c.restore();
    }
  };

  chartInstances.coverage = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Con Cobertura", "Sin Cobertura"],
      datasets: [{
        data: [covered, notCovered],
        backgroundColor: ["rgba(52,211,153,0.85)", "rgba(100,116,139,0.25)"],
        hoverBackgroundColor: ["rgba(52,211,153,1)", "rgba(100,116,139,0.4)"],
        borderColor: ["rgba(52,211,153,0.3)", "rgba(100,116,139,0.1)"],
        borderWidth: 2,
        hoverOffset: 6,
        spacing: 2,
        borderRadius: 4
      }]
    },
    plugins: [centerTextPlugin],
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "72%",
      layout: { padding: { bottom: 8 } },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#94a3b8", font: { size: 11, family: "'Inter', sans-serif" }, padding: 12,
            usePointStyle: true, pointStyle: "rectRounded", pointStyleWidth: 16
          }
        },
        tooltip: {
          backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8",
          borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed;
              const p = total > 0 ? Math.round((v / total) * 100) : 0;
              return ` ${ctx.label}: ${v} tiendas (${p}%)`;
            }
          }
        }
      }
    }
  });
}

// ── Sell-Out Section (Tab 1) ────────────────────────────
function renderSelloutSection() {
  const data = getFilteredData();
  if (!data) return;
  renderSelloutKPIs(data);
  renderSelloutDailyChart(data);
  renderSelloutByLicenseChart(data);
  renderSelloutByChainChart(data);
  renderSelloutTotalDailyChart(data);
  renderStockSection(data);
  renderOOSDivisionChart(data);
}

function renderSelloutKPIs(data) {
  const k = data.kpis;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = typeof val === 'number' ? val.toLocaleString('es-CL') : val; };
  set("sellout-units", k.totalUnits);
  set("sellout-clp", Math.round(k.totalCLP / 1000000).toLocaleString('es-CL') + "M");
  set("sellout-avg-store", k.avgUnitsPerStore);
  set("sellout-chains", k.uniqueChains);
  const rangeEl = document.getElementById("sellout-date-range");
  if (rangeEl && k.dateRange) {
    rangeEl.textContent = `${k.numDays} días | ${formatDate(k.dateRange.from)} al ${formatDate(k.dateRange.to)} | ${k.uniqueStores} tiendas | ${k.uniqueLicenses} licencias`;
  }
}

function renderSelloutDailyChart(data) {
  const ctx = document.getElementById("chart-sellout-daily");
  if (!ctx) return;
  if (chartInstances.selloutDaily) chartInstances.selloutDaily.destroy();
  const top5 = data.byLicense.slice(0, 5).map(l => l.license);
  const filtered = data.dailySales.filter(d => top5.includes(d.license));
  const dates = [...new Set(filtered.map(d => d.date))].sort();
  const datasets = top5.map((lic, i) => ({
    label: lic,
    data: dates.map(date => { const e = filtered.find(d => d.date === date && d.license === lic); return e ? e.clp : 0; }),
    borderColor: data.byLicense.find(l => l.license === lic)?.color || "#818cf8",
    backgroundColor: (data.byLicense.find(l => l.license === lic)?.color || "#818cf8") + "20",
    fill: true, tension: 0.4, borderWidth: 2, pointRadius: 2
  }));
  chartInstances.selloutDaily = new Chart(ctx, {
    type: "line", data: { labels: dates.map(shortDate), datasets },
    options: {
      ...chartOptionsLine("$CLP"),
      scales: {
        x: chartScaleX(),
        y: { ...chartScaleY(), beginAtZero: true, title: { display: true, text: "Venta CLP ($)", color: "#94a3b8" },
          ticks: { color: "#64748b", callback: v => v >= 1000000 ? (v/1000000).toFixed(1) + "M" : v >= 1000 ? (v/1000).toFixed(0) + "K" : v }
        }
      },
      plugins: {
        ...chartOptionsLine("$CLP").plugins,
        tooltip: {
          backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8", borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8,
          callbacks: { label: (tooltipCtx) => ` ${tooltipCtx.dataset.label}: $${(tooltipCtx.parsed.y/1000000).toFixed(2)}M CLP` }
        }
      }
    }
  });
}

function renderSelloutByLicenseChart(data) {
  const ctx = document.getElementById("chart-sellout-license");
  if (!ctx) return;
  if (chartInstances.selloutLicense) chartInstances.selloutLicense.destroy();
  chartInstances.selloutLicense = new Chart(ctx, {
    type: "bar",
    data: { labels: data.byLicense.map(l => l.license), datasets: [{ label: "Unidades", data: data.byLicense.map(l => l.units), backgroundColor: data.byLicense.map(l => l.color + "CC"), borderRadius: 4 }] },
    options: {
      ...chartOptionsBar("und"), indexAxis: "y", scales: { x: chartScaleX("Unidades"), y: chartScaleY() },
      plugins: { ...chartOptionsBar("und").plugins, datalabels: { display: true, color: '#e2e8f0', font: { size: 9, weight: 'bold' }, anchor: 'end', align: 'end', formatter: (v) => v > 0 ? v.toLocaleString('es-CL') : '' } }
    }
  });
}

function renderSelloutByChainChart(data) {
  const ctx = document.getElementById("chart-sellout-chain");
  if (!ctx) return;
  if (chartInstances.selloutChain) chartInstances.selloutChain.destroy();
  const chainTotalCLP = data.byChain.reduce((s, c) => s + c.clp, 0);
  chartInstances.selloutChain = new Chart(ctx, {
    type: "doughnut",
    data: { labels: data.byChain.map(c => c.chain), datasets: [{ data: data.byChain.map(c => c.clp), backgroundColor: data.byChain.map(c => chainColor(c.chain) + "CC"), borderColor: data.byChain.map(c => chainColor(c.chain) + "30"), borderWidth: 2, hoverOffset: 6, spacing: 1, borderRadius: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "55%",
      plugins: {
        legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 10 }, padding: 10, usePointStyle: true, pointStyle: "rectRounded" } },
        tooltip: {
          backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8", borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8,
          callbacks: { label: (tooltipCtx) => { const v = tooltipCtx.parsed; const p = chainTotalCLP > 0 ? ((v / chainTotalCLP) * 100).toFixed(1) : 0; const chain = data.byChain[tooltipCtx.dataIndex]; return [` $${(v/1000000).toFixed(1)}M CLP (${p}%)`, ` ${chain.units.toLocaleString("es-CL")} und`]; } }
        },
        datalabels: {
          display: function(ctx) { const v = ctx.dataset.data[ctx.dataIndex]; return chainTotalCLP > 0 && (v / chainTotalCLP) >= 0.05; },
          color: '#fff', font: { size: 9, weight: 'bold' },
          formatter: (v) => chainTotalCLP > 0 ? ((v / chainTotalCLP) * 100).toFixed(0) + '%' : ''
        }
      }
    }
  });
}

let dailyTotalView = 'daily';

function aggregateWeekly(dailyTotals) {
  if (!dailyTotals.length) return [];
  const weeks = [];
  let currentWeek = [];
  dailyTotals.forEach(d => {
    const dt = new Date(d.date + "T12:00:00");
    const dow = dt.getDay();
    if (currentWeek.length > 0 && dow === 1) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(d);
  });
  if (currentWeek.length) weeks.push(currentWeek);
  return weeks.map((week, i) => ({
    date: week[0].date,
    label: `S${i + 1} (${shortDate(week[0].date)}-${shortDate(week[week.length - 1].date)})`,
    units: week.reduce((s, d) => s + d.units, 0),
    clp: week.reduce((s, d) => s + d.clp, 0),
  }));
}

function initDailyTotalToggle() {
  const toggle = document.getElementById('daily-total-toggle');
  if (!toggle) return;
  toggle.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dailyTotalView = btn.dataset.view;
      toggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderSelloutTotalDailyChart(getFilteredData());
    });
  });
}

function renderSelloutTotalDailyChart(data) {
  const ctx = document.getElementById("chart-sellout-total-daily");
  if (!ctx) return;
  if (chartInstances.selloutTotalDaily) chartInstances.selloutTotalDaily.destroy();

  let t, labels;
  const titleEl = document.getElementById('daily-total-title');
  if (dailyTotalView === 'weekly') {
    t = aggregateWeekly(data.dailyTotals);
    labels = t.map(d => d.label);
    if (titleEl) titleEl.textContent = 'Venta Semanal Total (Und + CLP)';
  } else {
    t = data.dailyTotals;
    labels = t.map(d => shortDate(d.date));
    if (titleEl) titleEl.textContent = 'Venta Diaria Total (Und + CLP)';
  }

  chartInstances.selloutTotalDaily = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Unidades", data: t.map(d => d.units), backgroundColor: "rgba(99,102,241,0.7)", borderRadius: 4, yAxisID: "y" },
        { label: "CLP (M)", data: t.map(d => Math.round(d.clp / 1e6)), type: "line", borderColor: "#f97316", borderWidth: 2, pointRadius: 3, tension: 0.4, yAxisID: "y1" }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 10 }, padding: 12 } },
        datalabels: {
          display: function(ctx) { return ctx.datasetIndex === 1; },
          color: '#f97316', font: { size: 9, weight: 'bold' }, anchor: 'end', align: 'top', offset: 2,
          formatter: (v) => v > 0 ? '$' + v + 'M' : ''
        }
      },
      scales: { x: chartScaleX(), y: { position: "left", ...chartScaleY("und"), title: { display: true, text: "Unidades", color: "#64748b", font: { size: 10 } } }, y1: { position: "right", title: { display: true, text: "CLP (Millones)", color: "#f97316", font: { size: 10 } }, ticks: { color: "#f97316", font: { size: 10 }, callback: v => "$" + v + "M" }, grid: { display: false } } }
    }
  });
}

// ── Stock & OOS (Tab 1) ─────────────────────────────────
// ── OOS Severity helper ──────────────────────────────────
function oosColor(rate) {
  if (rate >= 30) return 'rgba(239,68,68,0.85)';
  if (rate >= 15) return 'rgba(249,115,22,0.8)';
  if (rate >= 5)  return 'rgba(251,191,36,0.75)';
  return 'rgba(52,211,153,0.7)';
}
function oosSeverity(rate) {
  if (rate >= 30) return 'critical';
  if (rate >= 15) return 'risk';
  if (rate >= 5)  return 'alert';
  return 'healthy';
}

function renderStockSection(data) {
  if (!data.stock || !data.stock.totalSKUs) return;
  const s = data.stock;
  // OOS Rate KPI + severity tag
  const gaugeVal = document.getElementById("oos-gauge-value");
  if (gaugeVal) gaugeVal.textContent = s.oosRate + '%';
  const sevTag = document.getElementById("oos-severity-tag");
  if (sevTag) {
    const label = s.oosRate >= 30 ? 'CRITICO' : s.oosRate >= 15 ? 'RIESGO' : s.oosRate >= 5 ? 'ALERTA' : 'SANO';
    const color = s.oosRate >= 30 ? '#ef4444' : s.oosRate >= 15 ? '#f97316' : s.oosRate >= 5 ? '#fbbf24' : '#34d399';
    sevTag.textContent = label;
    sevTag.style.background = color + '22';
    sevTag.style.color = color;
  }
  // KPIs
  const skuEl = document.getElementById("oos-skus");
  if (skuEl) skuEl.textContent = s.totalOOS.toLocaleString('es-CL');
  const stockEl = document.getElementById("stock-total");
  if (stockEl) stockEl.textContent = s.totalStockUnits.toLocaleString('es-CL');
  const skusEl = document.getElementById("stock-skus");
  if (skusEl) skusEl.textContent = s.totalSKUs.toLocaleString('es-CL');
  // Charts
  renderOOSByChainChart(s);
  renderOOSSeverityDonut(s);
}

function renderOOSGauge(stock) {
  const ctx = document.getElementById("chart-oos-gauge");
  if (!ctx) return;
  if (chartInstances.oosGauge) chartInstances.oosGauge.destroy();
  const rate = stock.oosRate;
  // Update center label
  const valEl = document.getElementById("oos-gauge-value");
  if (valEl) valEl.textContent = rate + '%';
  // Update severity marker position (0-100% of bar width, mapped to 0-40%+ range)
  const marker = document.getElementById("oos-severity-marker");
  if (marker) {
    const pct = Math.min(rate / 40, 1) * 100;
    marker.style.left = `calc(${pct}% - 2px)`;
  }
  // Update glow color
  const card = ctx.closest('.oos-gauge-card');
  if (card) {
    const hue = rate >= 30 ? 0 : rate >= 15 ? 25 : rate >= 5 ? 45 : 150;
    card.style.setProperty('--gauge-glow', `hsla(${hue}, 80%, 50%, 0.08)`);
    if (card.querySelector('::before')) card.style.background = '';
  }
  const remaining = 100 - rate;
  chartInstances.oosGauge = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [rate, remaining],
        backgroundColor: [oosColor(rate), 'rgba(30,41,59,0.3)'],
        borderWidth: 0,
        circumference: 180,
        rotation: -90
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '78%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { animateRotate: true, duration: 1500 }
    }
  });
}

function renderOOSByChainChart(stock) {
  const ctx = document.getElementById("chart-oos-chain");
  if (!ctx) return;
  if (chartInstances.oosChain) chartInstances.oosChain.destroy();
  const chains = [...stock.oosByChain].sort((a, b) => b.oosRate - a.oosRate);
  // Lollipop: thin horizontal bars with dot plugin
  const lollipopPlugin = {
    id: 'lollipopDots',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      const ctx2 = chart.ctx;
      meta.data.forEach((bar, i) => {
        const color = chart.data.datasets[0].backgroundColor[i];
        ctx2.save();
        ctx2.shadowColor = color;
        ctx2.shadowBlur = 8;
        ctx2.beginPath();
        ctx2.arc(bar.x, bar.y, 5, 0, Math.PI * 2);
        ctx2.fillStyle = color;
        ctx2.fill();
        ctx2.restore();
      });
    }
  };
  chartInstances.oosChain = new Chart(ctx, {
    type: "bar",
    data: {
      labels: chains.map(c => c.chain),
      datasets: [{
        label: "% OOS",
        data: chains.map(c => c.oosRate),
        backgroundColor: chains.map(c => oosColor(c.oosRate)),
        barThickness: 2,
        borderRadius: 0
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ...chartScaleX('% OOS'), max: Math.max(...chains.map(c => c.oosRate)) * 1.2 },
        y: { ...chartScaleY(), grid: { display: false } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8",
          borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8,
          callbacks: {
            label: (c) => {
              const ch = chains[c.dataIndex];
              const sev = ch.oosRate >= 30 ? 'CRITICO' : ch.oosRate >= 15 ? 'RIESGO' : ch.oosRate >= 5 ? 'ALERTA' : 'SANO';
              return ` ${ch.oosRate}% quiebre  [${sev}]`;
            },
            afterLabel: (c) => { const ch = chains[c.dataIndex]; return ` ${ch.oosSKUs.toLocaleString('es-CL')} de ${ch.totalSKUs.toLocaleString('es-CL')} SKUs`; }
          }
        },
        datalabels: {
          display: true, color: '#e2e8f0', font: { size: 9, weight: 'bold' }, anchor: 'end', align: 'end',
          formatter: (v) => v.toFixed(1) + '%'
        }
      }
    },
    plugins: [lollipopPlugin]
  });
}

function renderOOSSeverityDonut(stock) {
  const ctx = document.getElementById('chart-oos-severity');
  if (!ctx) return;
  if (chartInstances.oosSeverity) chartInstances.oosSeverity.destroy();
  const chains = stock.oosByChain || [];
  const buckets = [
    { label: 'Critico (>30%)', chains: [], skus: 0, color: 'rgba(239,68,68,0.8)', dot: '#ef4444' },
    { label: 'Riesgo (15-30%)', chains: [], skus: 0, color: 'rgba(249,115,22,0.75)', dot: '#f97316' },
    { label: 'Alerta (5-15%)', chains: [], skus: 0, color: 'rgba(251,191,36,0.7)', dot: '#fbbf24' },
    { label: 'Sano (<5%)', chains: [], skus: 0, color: 'rgba(52,211,153,0.65)', dot: '#34d399' }
  ];
  chains.forEach(c => {
    const i = c.oosRate >= 30 ? 0 : c.oosRate >= 15 ? 1 : c.oosRate >= 5 ? 2 : 3;
    buckets[i].chains.push({ name: c.chain, rate: c.oosRate });
    buckets[i].skus += c.totalSKUs;
  });
  // Donut chart
  const countEl = document.getElementById('oos-chain-count');
  if (countEl) countEl.textContent = chains.length;
  chartInstances.oosSeverity = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{
        data: buckets.map(b => b.chains.length),
        backgroundColor: buckets.map(b => b.color),
        borderColor: 'rgba(10,15,30,0.8)',
        borderWidth: 2,
        hoverBorderColor: '#fff',
        hoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8",
          borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8,
          callbacks: {
            label: (c) => {
              const b = buckets[c.dataIndex];
              return [` ${b.chains.length} cadenas (${b.skus.toLocaleString('es-CL')} SKUs)`, ...b.chains.map(ch => `  ${ch.name}: ${ch.rate}%`)];
            }
          }
        }
      },
      animation: { animateRotate: true, duration: 1200 },
      datalabels: {
        display: function(ctx) { return ctx.dataset.data[ctx.dataIndex] > 0; },
        color: '#fff', font: { size: 11, weight: 'bold' },
        formatter: (v, ctx) => v > 0 ? v : ''
      }
    }
  });
  // Detail panel next to donut
  const detail = document.getElementById('oos-severity-detail');
  if (detail) {
    detail.innerHTML = buckets.filter(b => b.chains.length > 0).map(b => `
      <div class="severity-bucket">
        <div class="severity-bucket-header">
          <div class="severity-bucket-dot" style="background:${b.dot}"></div>
          <span class="severity-bucket-label">${b.label}</span>
          <span class="severity-bucket-count">${b.chains.length} cadena${b.chains.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="severity-bucket-chains">${b.chains.sort((a, c) => c.rate - a.rate).map(ch => `${ch.name} <span style="color:${b.dot};font-weight:700">${ch.rate}%</span>`).join(' · ')}</div>
      </div>
    `).join('');
  }
}

// ══════════════════════════════════════════════════════════
//  TAB 2: RANKING SELL OUT
// ══════════════════════════════════════════════════════════

function renderRankingPage() {
  const data = getFilteredData();
  if (!data) return;

  renderInsights(data);
  renderDivisionKPIs(data);
  renderDivisionDailyChart(data);
  renderDivisionMixChart(data);
  initRankingTable(data);
  // Pareto chart removed
  renderVelocityChart(data);
  // Price Division chart removed; OOS Division moved to Command Center
  renderHeatmap(data);
  renderLicenseChainHeatmap(data);
  renderScatterChart(data);
  renderUnclassifiedTable(data);
}

// ── Insights ────────────────────────────────────────────
function generateDynamicInsights(data) {
  const insights = [];
  const byChain = data.byChain || [];
  const byLicense = data.byLicense || [];
  const byDivision = data.byDivision || [];
  const stock = data.stock || {};
  const vel = data.velocityMetrics?.velocityByChain || [];
  const totalUnits = data.kpis?.totalUnits || 0;
  const totalCLP = data.kpis?.totalCLP || 0;

  // 1. Revenue risk: high-selling chains with high OOS
  const oosByChain = stock.oosByChain || [];
  byChain.forEach(ch => {
    const oos = oosByChain.find(o => o.chain === ch.chain);
    if (oos && oos.oosRate >= 10 && totalCLP > 0 && ch.clp / totalCLP >= 0.08) {
      insights.push({ type: 'danger', title: 'RIESGO REVENUE',
        text: `${ch.chain} aporta ${(ch.clp / totalCLP * 100).toFixed(1)}% de venta pero tiene ${oos.oosRate}% de quiebre. Impacto estimado en revenue.` });
    }
  });

  // 2. OOS critico per chain
  oosByChain.filter(c => c.oosRate >= 50).forEach(ch => {
    insights.push({ type: 'danger', title: 'OOS CRITICO',
      text: `${ch.chain} tiene ${ch.oosRate}% de quiebre. ${ch.oosSKUs.toLocaleString('es-CL')} SKUs sin stock.` });
  });

  // 3. Global OOS alert
  if (stock.oosRate >= 10) {
    insights.push({ type: 'warning', title: 'QUIEBRE ALTO',
      text: `OOS global en ${stock.oosRate}%. ${(stock.totalOOS || 0).toLocaleString('es-CL')} registros en quiebre de ${(stock.totalSKUs || 0).toLocaleString('es-CL')} monitoreados.` });
  }

  // 4. Top 3 chains concentration
  if (byChain.length >= 3 && totalCLP > 0) {
    const top3 = byChain.slice(0, 3);
    const top3Pct = (top3.reduce((s, c) => s + c.clp, 0) / totalCLP * 100).toFixed(1);
    if (top3Pct >= 60) {
      insights.push({ type: 'info', title: 'TOP 3 CADENAS',
        text: `${top3.map(c => c.chain).join(', ')} suman ${top3Pct}% del sell out total.` });
    }
  }

  // 5. Velocity: slowest chains
  if (vel.length >= 3) {
    const sorted = [...vel].sort((a, b) => a.unitsPerDay - b.unitsPerDay);
    const slowest = sorted[0];
    const fastest = sorted[sorted.length - 1];
    if (slowest.unitsPerDay > 0 && fastest.unitsPerDay > 0) {
      const ratio = fastest.unitsPerDay / slowest.unitsPerDay;
      if (ratio >= 3) {
        insights.push({ type: 'warning', title: 'BRECHA VELOCIDAD',
          text: `${fastest.chain} vende ${fastest.unitsPerDay} und/día vs ${slowest.chain} con ${slowest.unitsPerDay} und/día (${ratio.toFixed(0)}x brecha).` });
      }
    }
  }

  // 6. Division insights
  if (byDivision.length >= 2 && totalUnits > 0) {
    const topDiv = byDivision[0];
    insights.push({ type: 'info', title: 'DIVISION LIDER',
      text: `${topDiv.division} lidera con ${topDiv.pctOfTotal}% del mix (${topDiv.units.toLocaleString('es-CL')} und, $${Math.round(topDiv.clp / 1e6)}M).` });
  }

  // 7. License concentration
  if (byLicense.length >= 5 && totalUnits > 0) {
    const top5Units = byLicense.slice(0, 5).reduce((s, l) => s + l.units, 0);
    const top5Pct = (top5Units / totalUnits * 100).toFixed(1);
    insights.push({ type: 'info', title: 'TOP 5 LICENCIAS',
      text: `Las 5 licencias principales concentran ${top5Pct}% de las unidades vendidas.` });
  }

  // 8. Period summary
  if (data.kpis?.numDays) {
    const avgDay = Math.round(totalUnits / data.kpis.numDays);
    const avgCLP = Math.round(totalCLP / data.kpis.numDays / 1e6 * 10) / 10;
    insights.push({ type: 'success', title: 'RESUMEN PERIODO',
      text: `${data.kpis.numDays} días | ${avgDay.toLocaleString('es-CL')} und/día promedio | $${avgCLP}M/día | ${data.kpis.uniqueStores} tiendas activas.` });
  }

  // Sort: danger > warning > info > success
  return insights.sort((a, b) => {
    const order = { danger: 0, warning: 1, info: 2, success: 3 };
    return (order[a.type] ?? 4) - (order[b.type] ?? 4);
  });
}

function renderInsights(data) {
  const grid = document.getElementById("insights-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const insights = generateDynamicInsights(data);
  insights.forEach(ins => {
    const card = document.createElement("div");
    card.className = `insight-card ${ins.type}`;
    card.innerHTML = `
      <div class="insight-dot ${ins.type}"></div>
      <div class="insight-body">
        <div class="insight-title">${ins.title}</div>
        <div class="insight-text">${ins.text}</div>
      </div>`;
    grid.appendChild(card);
  });
  if (insights.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;padding:1rem;">Sin alertas activas.</div>';
  }
}

// ── Division KPIs ───────────────────────────────────────
function renderDivisionKPIs(data) {
  const grid = document.getElementById("division-kpi-grid");
  if (!grid || !data.byDivision) return;
  grid.innerHTML = "";
  data.byDivision.forEach(d => {
    const card = document.createElement("div");
    card.className = "kpi-card div-kpi-card";
    // Override border-top with actual division color from data
    card.style.setProperty("--div-color", d.color);
    card.innerHTML = `
      <div class="kpi-label" style="display:flex;align-items:center;gap:0.4rem;">
        <span style="width:8px;height:8px;border-radius:50%;background:${d.color};display:inline-block;"></span>
        ${d.division}
      </div>
      <div class="kpi-value" style="font-size:1.5rem;">${d.units.toLocaleString("es-CL")}</div>
      <div class="kpi-sub">${d.pctOfTotal}% del total | $${Math.round(d.clp / 1e6)}M | ${d.storeCount} tiendas</div>`;
    grid.appendChild(card);
  });
}

// ── Division Daily Chart ────────────────────────────────
function renderDivisionDailyChart(data) {
  const ctx = document.getElementById("chart-division-daily");
  if (!ctx || !data.byDivisionDaily) return;
  if (chartInstances.divDaily) chartInstances.divDaily.destroy();
  const divs = [...new Set(data.byDivisionDaily.map(d => d.division))];
  const dates = [...new Set(data.byDivisionDaily.map(d => d.date))].sort();
  const datasets = divs.map(div => ({
    label: div,
    data: dates.map(date => { const e = data.byDivisionDaily.find(d => d.date === date && d.division === div); return e ? e.units : 0; }),
    borderColor: DIV_COLORS[div] || "#94a3b8",
    backgroundColor: (DIV_COLORS[div] || "#94a3b8") + "20",
    fill: true, tension: 0.4, borderWidth: 2, pointRadius: 2
  }));
  const opts = chartOptionsLine("und");
  opts.scales.y.beginAtZero = true;
  chartInstances.divDaily = new Chart(ctx, { type: "line", data: { labels: dates.map(shortDate), datasets }, options: opts });
}

// ── Division Mix by Chain ───────────────────────────────
function renderDivisionMixChart(data) {
  const ctx = document.getElementById("chart-division-mix");
  if (!ctx || !data.divisionMixByChain) return;
  if (chartInstances.divMix) chartInstances.divMix.destroy();
  const divs = data.byDivision.map(d => d.division);
  // Sort chains by the sum of visible divisions (desc)
  const sorted = [...data.divisionMixByChain].sort((a, b) => {
    const sumA = divs.reduce((s, d) => s + (a.divisions[d]?.pct || 0), 0);
    const sumB = divs.reduce((s, d) => s + (b.divisions[d]?.pct || 0), 0);
    return sumB - sumA;
  });
  const chains = sorted.map(d => d.chain);
  const datasets = divs.map(div => ({
    label: div,
    data: sorted.map(d => d.divisions[div]?.pct || 0),
    backgroundColor: (DIV_COLORS[div] || "#94a3b8") + "CC",
    borderColor: DIV_COLORS[div] || "#94a3b8",
    borderWidth: 1, borderRadius: 2
  }));
  chartInstances.divMix = new Chart(ctx, {
    type: "bar",
    data: { labels: chains, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 10 }, padding: 12 } } },
      scales: { x: { stacked: true, ...chartScaleX() }, y: { stacked: true, max: 100, ticks: { color: "#64748b", font: { size: 10 }, callback: v => v + "%" }, grid: { color: "rgba(148,163,184,0.06)" } } }
    }
  });
}

// ── Store Ranking Table ─────────────────────────────────
function initRankingTable(data) {
  const chainSel = document.getElementById("ranking-chain-select");
  const sortSel = document.getElementById("ranking-sort");
  chainSel.innerHTML = '<option value="">Todas las cadenas</option>';
  (data.allChains || []).forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    chainSel.appendChild(opt);
  });
  const render = () => renderStoreRanking(data, chainSel.value, sortSel.value);
  // Remove old listeners by cloning elements
  const newChainSel = chainSel.cloneNode(true);
  chainSel.parentNode.replaceChild(newChainSel, chainSel);
  const newSortSel = sortSel.cloneNode(true);
  sortSel.parentNode.replaceChild(newSortSel, sortSel);
  const render2 = () => renderStoreRanking(data, newChainSel.value, newSortSel.value);
  newChainSel.addEventListener("change", render2);
  newSortSel.addEventListener("change", render2);
  render2();
}

let rankingState = { stores: [], page: 1, pageSize: 100 };

function renderStoreRanking(data, chain, sortBy) {
  const tbody = document.getElementById("ranking-table-body");
  if (!tbody) return;

  let stores;
  if (chain) {
    stores = (data.rankingByChainStore[chain] || []).map(s => ({ ...s, _chain: chain }));
  } else {
    stores = Object.entries(data.rankingByChainStore).flatMap(([ch, ss]) => ss.map(s => ({ ...s, _chain: ch })));
  }

  const sortKey = ['units', 'margin', 'stockUnits', 'weeksOfStock'].includes(sortBy) ? sortBy : 'clp';
  stores.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

  rankingState.stores = stores;
  rankingState.page = 1;
  renderRankingPage_();
}

function renderRankingPage_() {
  const tbody = document.getElementById("ranking-table-body");
  const pagContainer = document.getElementById("ranking-pagination");
  if (!tbody) return;
  tbody.innerHTML = "";

  const { stores, page, pageSize } = rankingState;
  const totalPages = Math.ceil(stores.length / pageSize);
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, stores.length);
  const pageStores = stores.slice(start, end);

  const totalUnits = stores.reduce((s, d) => s + d.units, 0);

  // Pre-compute cumulative Pareto for all stores (not just current page)
  let cumUnits = 0;
  const paretoPcts = stores.map(s => {
    cumUnits += s.units;
    return totalUnits > 0 ? (cumUnits / totalUnits * 100) : 0;
  });

  // Update weeks-of-stock header — ahora siempre 4 semanas
  const thWeeks = document.getElementById("th-weeks-stock");
  if (thWeeks) thWeeks.textContent = `Sem. Stock (4sem)`;

  // ── Fila totalizada (solo en página 1) ──
  if (page === 1) {
    const totUnits = stores.reduce((s, d) => s + d.units, 0);
    const totCLP = stores.reduce((s, d) => s + d.clp, 0);
    const totCostos = stores.reduce((s, d) => s + (d.costos || 0), 0);
    const totMargin = totCLP > 0 ? Math.round((totCLP - totCostos) / totCLP * 1000) / 10 : 0;
    const totStock = stores.reduce((s, d) => s + (d.stockUnits || 0), 0);
    const storesWithWeeks = stores.filter(d => d.weeksOfStock > 0);
    const avgWeeks = storesWithWeeks.length > 0 ? Math.round(storesWithWeeks.reduce((s, d) => s + d.weeksOfStock, 0) / storesWithWeeks.length * 10) / 10 : 0;
    const totMarginColor = totMargin >= 30 ? '#22c55e' : totMargin >= 20 ? '#eab308' : '#ef4444';
    const totWeeksColor = avgWeeks <= 2 ? '#ef4444' : avgWeeks <= 5 ? '#eab308' : avgWeeks <= 8 ? '#22c55e' : '#3b82f6';
    const trTot = document.createElement("tr");
    trTot.className = "ranking-total-row";
    trTot.innerHTML = `
      <td class="rank-number" style="font-weight:700">—</td>
      <td colspan="2" style="font-weight:700;font-size:0.82rem">TOTAL (${stores.length} tiendas)</td>
      <td></td>
      <td class="number-cell" style="font-weight:700">${totUnits.toLocaleString("es-CL")}</td>
      <td class="number-cell" style="font-weight:700">${formatCLP(totCLP)}</td>
      <td class="number-cell" style="font-weight:700;color:${totMarginColor}">${totMargin}%</td>
      <td class="number-cell" style="font-weight:700">${totStock > 0 ? totStock.toLocaleString("es-CL") : '-'}</td>
      <td class="number-cell" style="font-weight:700;color:${totWeeksColor}">${avgWeeks > 0 ? avgWeeks + ' avg' : '-'}</td>
      <td class="number-cell" style="font-weight:700">100%</td>
      <td></td><td></td><td></td>`;
    tbody.appendChild(trTot);
  }

  pageStores.forEach((store, idx) => {
    const globalIdx = start + idx;
    const divEntries = Object.entries(store.byDivision || {}).sort((a, b) => b[1].units - a[1].units);
    const topDiv = divEntries[0] ? divEntries[0][0] : '-';
    const pct = totalUnits > 0 ? (store.units / totalUnits * 100).toFixed(2) : '0.00';
    const paretoPct = paretoPcts[globalIdx].toFixed(2);
    const margin = store.margin != null ? store.margin : (store.clp > 0 ? Math.round((store.clp - (store.costos || 0)) / store.clp * 1000) / 10 : 0);
    const stockUnits = store.stockUnits || 0;
    const weeksOfStock = store.weeksOfStock || 0;

    // Color-code margin
    const marginColor = margin >= 30 ? '#22c55e' : margin >= 20 ? '#eab308' : '#ef4444';
    // Color-code weeks of stock
    const weeksColor = weeksOfStock <= 2 ? '#ef4444' : weeksOfStock <= 5 ? '#eab308' : weeksOfStock <= 8 ? '#22c55e' : '#3b82f6';

    // Rich tooltip for distribution
    const tooltipRows = divEntries.map(([div, d]) => {
      const w = store.units > 0 ? (d.units / store.units * 100).toFixed(0) : 0;
      return `<div class="dist-tooltip-row"><span class="dist-tooltip-dot" style="background:${DIV_COLORS[div] || '#94a3b8'}"></span><span class="dist-tooltip-name">${div}</span><span class="dist-tooltip-val">${d.units} und (${w}%)</span></div>`;
    }).join('');

    const bars = divEntries.map(([div, d]) => {
      const w = store.units > 0 ? (d.units / store.units * 100).toFixed(0) : 0;
      return `<div class="mini-bar" style="width:${w}%;background:${DIV_COLORS[div] || '#94a3b8'}"></div>`;
    }).join('');

    const cColor = chainColor(store._chain);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="rank-number">${globalIdx + 1}</td>
      <td class="chain-cell"><span class="chain-dot" style="background:${cColor}"></span><span style="color:${cColor};font-weight:500;font-size:0.78rem">${store._chain}</span></td>
      <td class="store-name-cell" title="${store.store}">${store.store}</td>
      <td>${store.region}</td>
      <td class="number-cell">${store.units.toLocaleString("es-CL")}</td>
      <td class="number-cell">${formatCLP(store.clp)}</td>
      <td class="number-cell" style="color:${marginColor};font-weight:600">${margin}%</td>
      <td class="number-cell">${stockUnits > 0 ? stockUnits.toLocaleString("es-CL") : '-'}</td>
      <td class="number-cell" style="color:${weeksColor};font-weight:500">${weeksOfStock > 0 ? weeksOfStock : '-'}</td>
      <td class="number-cell">${pct}%</td>
      <td class="pareto-cell">${paretoPct}%<div class="pareto-bar"><div class="pareto-fill" style="width:${paretoPct}%"></div></div></td>
      <td>${topDiv}</td>
      <td><div class="dist-tooltip-wrap"><div class="mini-bar-container">${bars}</div><div class="dist-tooltip">${tooltipRows}</div></div></td>`;
    tbody.appendChild(tr);
  });

  // Pagination controls
  if (pagContainer && totalPages > 1) {
    pagContainer.innerHTML = '';
    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.textContent = `Mostrando ${start + 1}-${end} de ${stores.length} tiendas`;
    pagContainer.appendChild(info);

    const nav = document.createElement('div');
    nav.className = 'pagination-nav';

    for (let p = 1; p <= totalPages; p++) {
      const btn = document.createElement('button');
      btn.className = 'pagination-btn' + (p === page ? ' active' : '');
      btn.textContent = `${(p - 1) * pageSize + 1}-${Math.min(p * pageSize, stores.length)}`;
      btn.addEventListener('click', () => {
        rankingState.page = p;
        renderRankingPage_();
        // Scroll to table
        document.getElementById("ranking-table-body")?.closest('.table-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(btn);
    }
    pagContainer.appendChild(nav);
  } else if (pagContainer) {
    pagContainer.innerHTML = `<span class="pagination-info">${stores.length} tiendas</span>`;
  }
}

// ── Product Ranking Table ───────────────────────────────
let productRankingState = { products: [], page: 1, pageSize: 50 };

function initProductRanking(data) {
  const sortSel = document.getElementById("product-sort");
  if (!sortSel) return;
  const newSortSel = sortSel.cloneNode(true);
  sortSel.parentNode.replaceChild(newSortSel, sortSel);
  const render = () => renderProductRanking(data, newSortSel.value);
  newSortSel.addEventListener("change", render);
  render();
}

function renderProductRanking(data, sortBy) {
  const tbody = document.getElementById("product-ranking-body");
  if (!tbody) return;

  let products = filterProductRanking(data);
  const sortKey = ['units', 'clp', 'margin', 'stockUnits'].includes(sortBy) ? sortBy : 'units';
  products.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

  productRankingState.products = products;
  productRankingState.page = 1;
  renderProductPage_();
}

function filterProductRanking(data) {
  let products = (data.rankingByProduct || []).slice();
  const f = getGlobalFilters();

  // Chain filter: scale by chain proportion
  if (f.chains.length) {
    products = products.map(p => {
      const totalUnits = p.units;
      const totalClp = p.clp;
      let chainUnits = 0, chainClp = 0;
      f.chains.forEach(ch => {
        const cd = (p.byChain || {})[ch];
        if (cd) { chainUnits += cd.units; chainClp += cd.clp; }
      });
      if (chainUnits === 0) return null;
      const uRatio = totalUnits > 0 ? chainUnits / totalUnits : 0;
      return {
        ...p,
        units: chainUnits,
        clp: chainClp,
        costos: Math.round(p.costos * uRatio),
        stockUnits: Math.round(p.stockUnits * uRatio),
        margin: chainClp > 0 ? Math.round((chainClp - p.costos * uRatio) / chainClp * 1000) / 10 : 0
      };
    }).filter(Boolean);
  }

  // Division filter: exact match
  if (f.divisions.length) {
    const divSet = new Set(f.divisions);
    products = products.filter(p => divSet.has(p.division));
  }

  // License filter: exact match
  if (f.licenses.length) {
    const licSet = new Set(f.licenses);
    products = products.filter(p => licSet.has(p.license));
  }

  // Temporada filter: exact match on product's temporada
  if (f.temporadas.length) {
    const tempSet = new Set(f.temporadas);
    products = products.filter(p => tempSet.has(p.temporada));
  }

  // Clase filter: exact match
  if (f.clases.length) {
    const claseSet = new Set(f.clases);
    products = products.filter(p => claseSet.has(p.clase));
  }

  // Subclase filter: exact match
  if (f.subclases.length) {
    const subclaseSet = new Set(f.subclases);
    products = products.filter(p => subclaseSet.has(p.subclase));
  }

  // Categoria filter: exact match
  if (f.categorias.length) {
    const catSet = new Set(f.categorias);
    products = products.filter(p => catSet.has(p.categoria));
  }

  return products;
}

function renderProductPage_() {
  const tbody = document.getElementById("product-ranking-body");
  const pagContainer = document.getElementById("product-pagination");
  if (!tbody) return;
  tbody.innerHTML = "";

  const { products, page, pageSize } = productRankingState;
  const totalPages = Math.ceil(products.length / pageSize);
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, products.length);
  const pageProducts = products.slice(start, end);

  if (!pageProducts.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin datos para los filtros seleccionados</td></tr>';
    if (pagContainer) pagContainer.innerHTML = '';
    return;
  }

  pageProducts.forEach((p, idx) => {
    const globalIdx = start + idx;
    const marginColor = p.margin >= 30 ? '#22c55e' : p.margin >= 20 ? '#eab308' : p.margin < 0 ? '#ef4444' : '#f97316';
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="rank-number">${globalIdx + 1}</td>
      <td style="font-size:0.72rem;color:var(--text-muted)">${p.codigo}</td>
      <td class="store-name-cell" title="${p.descripcion}">${p.descripcion}</td>
      <td>${p.license || '-'}</td>
      <td>${p.division || '-'}</td>
      <td class="number-cell">${p.units.toLocaleString("es-CL")}</td>
      <td class="number-cell">${formatCLP(p.clp)}</td>
      <td class="number-cell">${formatCLP(p.costos)}</td>
      <td class="number-cell" style="color:${marginColor};font-weight:600">${p.margin}%</td>
      <td class="number-cell">${p.stockUnits > 0 ? p.stockUnits.toLocaleString("es-CL") : '-'}</td>`;
    tbody.appendChild(tr);
  });

  // Pagination
  if (pagContainer && totalPages > 1) {
    pagContainer.innerHTML = '';
    const info = document.createElement('span');
    info.className = 'pagination-info';
    info.textContent = `Mostrando ${start + 1}-${end} de ${products.length} productos`;
    pagContainer.appendChild(info);
    const nav = document.createElement('div');
    nav.className = 'pagination-nav';
    for (let pg = 1; pg <= totalPages; pg++) {
      const btn = document.createElement('button');
      btn.className = 'pagination-btn' + (pg === page ? ' active' : '');
      btn.textContent = `${(pg - 1) * pageSize + 1}-${Math.min(pg * pageSize, products.length)}`;
      btn.addEventListener('click', () => {
        productRankingState.page = pg;
        renderProductPage_();
        document.getElementById("product-ranking-body")?.closest('.table-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(btn);
    }
    pagContainer.appendChild(nav);
  } else if (pagContainer) {
    pagContainer.innerHTML = `<span class="pagination-info">${products.length} productos</span>`;
  }
}

// ── Pareto Chart ────────────────────────────────────────
function renderParetoChart(data) {
  const ctx = document.getElementById("chart-pareto");
  if (!ctx) return;
  if (chartInstances.pareto) chartInstances.pareto.destroy();

  const allStores = Object.values(data.rankingByChainStore).flat().sort((a, b) => b.units - a.units);
  const totalUnits = allStores.reduce((s, d) => s + d.units, 0);
  let cumPct = 0;
  const labels = [], unitData = [], cumData = [];
  allStores.slice(0, 50).forEach((s, i) => {
    labels.push(i + 1);
    unitData.push(s.units);
    cumPct += (s.units / totalUnits) * 100;
    cumData.push(Math.round(cumPct * 10) / 10);
  });

  chartInstances.pareto = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Unidades", data: unitData, backgroundColor: "rgba(99,102,241,0.7)", borderRadius: 3, yAxisID: "y" },
        { label: "% Acumulado", data: cumData, type: "line", borderColor: "#f97316", borderWidth: 2, pointRadius: 1, tension: 0.3, yAxisID: "y1" }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 10 }, padding: 12 } } },
      scales: {
        x: { title: { display: true, text: "Tiendas (ordenadas por venta)", color: "#64748b", font: { size: 10 } }, ticks: { color: "#64748b", font: { size: 9 } }, grid: { display: false } },
        y: { position: "left", title: { display: true, text: "Unidades", color: "#6366f1", font: { size: 10 } }, ticks: { color: "#6366f1", font: { size: 10 }, callback: v => v >= 1000 ? Math.round(v/1000) + "K" : v }, grid: { color: "rgba(148,163,184,0.06)" } },
        y1: { position: "right", max: 100, title: { display: true, text: "% Acumulado", color: "#f97316", font: { size: 10 } }, ticks: { color: "#f97316", font: { size: 10 }, callback: v => v + "%" }, grid: { display: false } }
      }
    }
  });
}

// ── Velocity Chart ──────────────────────────────────────
function renderVelocityChart(data) {
  const ctx = document.getElementById("chart-velocity");
  if (!ctx || !data.velocityMetrics) return;
  if (chartInstances.velocity) chartInstances.velocity.destroy();
  const vel = [...data.velocityMetrics.velocityByChain].sort((a, b) => b.unitsPerDay - a.unitsPerDay);
  chartInstances.velocity = new Chart(ctx, {
    type: "bar",
    data: {
      labels: vel.map(v => v.chain),
      datasets: [{
        label: "Und/Día",
        data: vel.map(v => v.unitsPerDay),
        backgroundColor: vel.map(v => chainColor(v.chain) + "BB"),
        borderColor: vel.map(v => chainColor(v.chain)),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: { ...chartOptionsBar("und/dia"), plugins: { legend: { display: false }, tooltip: { backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8", borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8, callbacks: { label: (ctx) => ` ${vel[ctx.dataIndex].unitsPerDay} und/día`, afterLabel: (ctx) => { const t = vel[ctx.dataIndex].trend; return `Tendencia: ${t > 0 ? '+' : ''}${t}% ${t >= 0 ? '▲' : '▼'}`; } } }, datalabels: { display: true, color: '#e2e8f0', font: { size: 9, weight: 'bold' }, anchor: 'end', align: 'end', formatter: (v) => v > 0 ? v.toLocaleString('es-CL') : '' } } }
  });
}

// ── Price by Division Chart ─────────────────────────────
function renderPriceDivisionChart(data) {
  const ctx = document.getElementById("chart-price-division");
  if (!ctx || !data.priceMetrics) return;
  if (chartInstances.priceDiv) chartInstances.priceDiv.destroy();
  const pd = [...data.priceMetrics.byDivision].sort((a, b) => b.avgB2B - a.avgB2B);
  chartInstances.priceDiv = new Chart(ctx, {
    type: "bar",
    data: {
      labels: pd.map(d => d.division),
      datasets: [
        { label: "Precio Promedio B2B", data: pd.map(d => d.avgB2B), backgroundColor: "rgba(99,102,241,0.7)", borderRadius: 4 }
      ]
    },
    options: { ...chartOptionsBar("clp"), indexAxis: "y", scales: { x: chartScaleX("CLP"), y: chartScaleY() }, plugins: { legend: { display: false } } }
  });
}

// ── OOS by Division Chart ───────────────────────────────
function renderOOSDivisionChart(data) {
  const container = document.getElementById("oos-division-table");
  if (!container || !data.stock?.oosByDivision) return;
  const divs = data.stock.oosByDivision.filter(d => d.division !== 'Sin Clasificar').sort((a, b) => b.oosRate - a.oosRate);
  if (!divs.length) { container.innerHTML = '<p style="color:var(--text-muted);padding:1rem;font-size:0.8rem">Sin datos</p>'; return; }
  const maxRate = Math.max(...divs.map(d => d.oosRate));
  const totSKUs = divs.reduce((s, d) => s + d.totalSKUs, 0);
  const totOOS = divs.reduce((s, d) => s + d.oosSKUs, 0);
  const totRate = totSKUs > 0 ? Math.round(totOOS / totSKUs * 1000) / 10 : 0;
  container.innerHTML = `
    <table class="oos-div-table">
      <thead><tr><th>Division</th><th>% Quiebre</th><th>SKUs OOS</th><th>SKUs Total</th><th>Severidad</th></tr></thead>
      <tbody>
        ${divs.map(d => {
          const sev = oosSeverity(d.oosRate);
          const sevLabel = d.oosRate >= 30 ? 'Critico' : d.oosRate >= 15 ? 'Riesgo' : d.oosRate >= 5 ? 'Alerta' : 'Sano';
          const barW = maxRate > 0 ? (d.oosRate / maxRate * 100) : 0;
          const color = oosColor(d.oosRate);
          return `<tr>
            <td style="font-weight:600">${d.division}</td>
            <td class="oos-bar-cell"><div class="oos-bar-bg" style="width:${barW}%;background:${color}"></div><span style="position:relative;z-index:1">${d.oosRate}%</span></td>
            <td>${d.oosSKUs.toLocaleString('es-CL')}</td>
            <td>${d.totalSKUs.toLocaleString('es-CL')}</td>
            <td><span style="color:${color};font-weight:700;font-size:0.68rem">${sevLabel}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot><tr class="oos-div-total-row">
        <td>TOTAL</td>
        <td>${totRate}%</td>
        <td>${totOOS.toLocaleString('es-CL')}</td>
        <td>${totSKUs.toLocaleString('es-CL')}</td>
        <td></td>
      </tr></tfoot>
    </table>`;
}

// ── Unclassified SKUs Table ─────────────────────────────
function renderUnclassifiedTable(data) {
  const tbody = document.getElementById("unclassified-table-body");
  if (!tbody || !data.unclassifiedSKUs) return;
  tbody.innerHTML = "";
  if (data.unclassifiedSKUs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:1.5rem;">Sin SKUs sin clasificar</td></tr>';
    return;
  }
  data.unclassifiedSKUs.forEach(sku => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="store-name-cell" title="${sku.descripcion}">${sku.descripcion}</td>
      <td>${sku.propiedad}</td><td>${sku.cadena}</td><td>${sku.tienda}</td>
      <td class="number-cell">${sku.unidades}</td>
      <td class="number-cell">${formatCLP(sku.clp)}</td>
      <td>${sku.codigoInterno}</td>`;
    tbody.appendChild(tr);
  });
}

// ══════════════════════════════════════════════════════════
//  TAB 3: TOP DE VENTAS
// ══════════════════════════════════════════════════════════

function renderTopVentasPage() {
  const data = getFilteredData();
  if (!data) return;
  initProductRanking(data);
  renderLicenseSummary(data);
  renderWeeklyStoreView(data);
}

// ── License Summary Table ────────────────────────────────
function renderLicenseSummary(data) {
  const tbody = document.getElementById("license-summary-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  let licenses = (data.licenseSummary || []).slice();
  const f = getGlobalFilters();

  // Apply filters
  if (f.licenses.length) {
    const licSet = new Set(f.licenses);
    licenses = licenses.filter(l => licSet.has(l.license));
  }
  if (f.temporadas.length) {
    const tempBreak = data.licenseTemporadaBreakdown || {};
    const tempSet = new Set(f.temporadas);
    licenses = licenses.filter(l => {
      const tb = tempBreak[l.license];
      return tb && f.temporadas.some(t => tb[t]);
    });
    // Scale proportionally
    licenses = licenses.map(l => {
      const tb = tempBreak[l.license];
      if (!tb) return l;
      const totalU = Object.values(tb).reduce((s, v) => s + v.units, 0);
      const filtU = f.temporadas.reduce((s, t) => s + (tb[t]?.units || 0), 0);
      const ratio = totalU > 0 ? filtU / totalU : 1;
      return { ...l, units: Math.round(l.units * ratio), clp: Math.round(l.clp * ratio), costos: Math.round(l.costos * ratio), stockUnits: Math.round(l.stockUnits * ratio) };
    });
  }
  if (f.divisions.length) {
    const divBreak = data.licenseDivisionBreakdown || {};
    const divSet = new Set(f.divisions);
    licenses = licenses.filter(l => {
      const db = divBreak[l.license];
      return db && f.divisions.some(d => db[d]);
    });
    licenses = licenses.map(l => {
      const db = divBreak[l.license];
      if (!db) return l;
      const totalU = Object.values(db).reduce((s, v) => s + v.units, 0);
      const filtU = f.divisions.reduce((s, d) => s + (db[d]?.units || 0), 0);
      const ratio = totalU > 0 ? filtU / totalU : 1;
      return { ...l, units: Math.round(l.units * ratio), clp: Math.round(l.clp * ratio), costos: Math.round(l.costos * ratio), stockUnits: Math.round(l.stockUnits * ratio) };
    });
  }
  // Clase / Subclase / Categoria proportional filters
  const _scaleLicSummary = (lics, breakdownKey, selectedVals) => {
    const brk = data[breakdownKey] || {};
    lics = lics.filter(l => { const b = brk[l.license]; return b && selectedVals.some(v => b[v]); });
    return lics.map(l => {
      const b = brk[l.license]; if (!b) return l;
      const totalU = Object.values(b).reduce((s, v) => s + v.units, 0);
      const filtU = selectedVals.reduce((s, v) => s + (b[v]?.units || 0), 0);
      const ratio = totalU > 0 ? filtU / totalU : 1;
      return { ...l, units: Math.round(l.units * ratio), clp: Math.round(l.clp * ratio), costos: Math.round(l.costos * ratio), stockUnits: Math.round(l.stockUnits * ratio) };
    });
  };
  if (f.clases.length) licenses = _scaleLicSummary(licenses, 'licenseClaseBreakdown', f.clases);
  if (f.subclases.length) licenses = _scaleLicSummary(licenses, 'licenseSubclaseBreakdown', f.subclases);
  if (f.categorias.length) licenses = _scaleLicSummary(licenses, 'licenseCategoriaBreakdown', f.categorias);

  if (f.chains.length) {
    const chainLic = data.salesByChainLicense || {};
    const allChainLic = {};
    Object.values(chainLic).forEach(lics => {
      Object.entries(lics).forEach(([lic, d]) => {
        if (!allChainLic[lic]) allChainLic[lic] = { units: 0 };
        allChainLic[lic].units += d.units;
      });
    });
    const selectedChainLic = {};
    f.chains.forEach(ch => {
      Object.entries(chainLic[ch] || {}).forEach(([lic, d]) => {
        if (!selectedChainLic[lic]) selectedChainLic[lic] = { units: 0 };
        selectedChainLic[lic].units += d.units;
      });
    });
    licenses = licenses.map(l => {
      const sel = selectedChainLic[l.license];
      if (!sel) return null;
      const total = allChainLic[l.license]?.units || 1;
      const ratio = sel.units / total;
      return { ...l, units: Math.round(l.units * ratio), clp: Math.round(l.clp * ratio), costos: Math.round(l.costos * ratio), stockUnits: Math.round(l.stockUnits * ratio) };
    }).filter(Boolean);
  }

  // Recalculate margin and pct after filtering
  const totalFiltered = licenses.reduce((s, l) => s + l.units, 0);
  licenses = licenses.map(l => ({
    ...l,
    margin: l.clp > 0 ? Math.round((l.clp - l.costos) / l.clp * 1000) / 10 : 0,
    pctUnits: totalFiltered > 0 ? Math.round(l.units / totalFiltered * 10000) / 100 : 0,
  }));
  licenses.sort((a, b) => b.units - a.units);
  licenses = licenses.filter(l => l.units > 0);

  if (!licenses.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin datos</td></tr>';
    return;
  }

  licenses.forEach((l, idx) => {
    const marginColor = l.margin >= 30 ? '#22c55e' : l.margin >= 20 ? '#eab308' : l.margin < 0 ? '#ef4444' : '#f97316';
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="rank-number">${idx + 1}</td>
      <td style="font-weight:600">${l.license}</td>
      <td class="number-cell">${l.units.toLocaleString("es-CL")}</td>
      <td class="number-cell">${formatCLP(l.clp)}</td>
      <td class="number-cell">${l.pctUnits.toFixed(2)}%</td>
      <td class="number-cell" style="color:${marginColor};font-weight:600">${l.margin}%</td>
      <td class="number-cell">${l.stockUnits > 0 ? l.stockUnits.toLocaleString("es-CL") : '-'}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Weekly Store View + Chart ────────────────────────────
function renderWeeklyStoreView(data) {
  const tbody = document.getElementById("weekly-store-body");
  const thead = document.getElementById("weekly-store-thead");
  const chartCtx = document.getElementById("chart-weekly-totals");
  if (!tbody || !thead) return;

  const wsd = data.weeklyStoreData;
  if (!wsd || !wsd.stores) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">Sin datos semanales</td></tr>';
    return;
  }

  const weekKeys = wsd.weekKeys || [];
  const weekLabels = wsd.weekLabels || [];
  const f = getGlobalFilters();

  // Build thead with week columns + total
  let thHtml = '<tr><th>#</th><th>Local</th><th>Cadena</th>';
  weekLabels.forEach(label => { thHtml += `<th class="number-cell">${label}</th>`; });
  thHtml += '<th class="number-cell">Total</th></tr>';
  thead.innerHTML = thHtml;

  // Filter stores
  let stores = wsd.stores.slice();
  if (f.chains.length) {
    const chainSet = new Set(f.chains);
    stores = stores.filter(s => chainSet.has(s.chain));
  }

  // Proportional scaling for license/temporada/division/year/quarter filters
  // Compare filtered KPI totalUnits vs original to get ratio
  const src = typeof REAL_SELLOUT !== 'undefined' ? REAL_SELLOUT : null;
  const origTotal = src ? (src.kpis || {}).totalUnits || 1 : 1;
  const filtTotal = (data.kpis || {}).totalUnits || 0;
  const scaleRatio = (f.licenses.length || f.divisions.length || f.temporadas.length || f.years.length || f.quarters.length || f.clases.length || f.subclases.length || f.categorias.length) && filtTotal < origTotal
    ? filtTotal / origTotal : 1;

  if (scaleRatio < 1) {
    stores = stores.map(s => {
      const scaled = { ...s, weeks: {} };
      let newTotal = 0;
      Object.entries(s.weeks || {}).forEach(([wk, d]) => {
        scaled.weeks[wk] = { clp: Math.round(d.clp * scaleRatio), units: Math.round(d.units * scaleRatio) };
        newTotal += scaled.weeks[wk].clp;
      });
      scaled.totalClp = newTotal;
      scaled.totalUnits = Math.round(s.totalUnits * scaleRatio);
      return scaled;
    });
  }

  // Re-sort by totalClp after scaling
  stores.sort((a, b) => b.totalClp - a.totalClp);

  // Build table
  tbody.innerHTML = "";
  const top50 = stores.slice(0, 50);
  top50.forEach((s, idx) => {
    const tr = document.createElement("tr");
    let cells = `<td class="rank-number">${idx + 1}</td>
      <td class="store-name-cell" title="${s.store}">${s.store}</td>
      <td>${s.chain}</td>`;
    weekKeys.forEach(wk => {
      const d = (s.weeks || {})[wk];
      const val = d ? d.clp : 0;
      cells += `<td class="number-cell">${val > 0 ? formatCLP(val) : '-'}</td>`;
    });
    cells += `<td class="number-cell" style="font-weight:600">${formatCLP(s.totalClp)}</td>`;
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });

  // Totals row
  const totalRow = document.createElement("tr");
  totalRow.style.fontWeight = "700";
  totalRow.style.borderTop = "2px solid var(--border)";
  let totCells = `<td></td><td>Totales Generales</td><td></td>`;
  let grandTotal = 0;
  weekKeys.forEach(wk => {
    const weekTotal = stores.reduce((s, st) => s + ((st.weeks || {})[wk]?.clp || 0), 0);
    grandTotal += weekTotal;
    totCells += `<td class="number-cell">${formatCLP(weekTotal)}</td>`;
  });
  totCells += `<td class="number-cell">${formatCLP(grandTotal)}</td>`;
  totalRow.innerHTML = totCells;
  tbody.appendChild(totalRow);

  // % Var row
  const varRow = document.createElement("tr");
  varRow.style.color = "var(--text-muted)";
  varRow.style.fontSize = "0.75rem";
  let varCells = `<td></td><td>% Var</td><td></td>`;
  weekKeys.forEach((wk, i) => {
    if (i === 0) {
      varCells += `<td class="number-cell"></td>`;
    } else {
      const prevWk = weekKeys[i - 1];
      const prevTotal = stores.reduce((s, st) => s + ((st.weeks || {})[prevWk]?.clp || 0), 0);
      const curTotal = stores.reduce((s, st) => s + ((st.weeks || {})[wk]?.clp || 0), 0);
      const pctVar = prevTotal > 0 ? Math.round((curTotal - prevTotal) / prevTotal * 100) : 0;
      const color = pctVar >= 0 ? '#22c55e' : '#ef4444';
      varCells += `<td class="number-cell" style="color:${color}">${pctVar >= 0 ? '+' : ''}${pctVar}%</td>`;
    }
  });
  varCells += `<td class="number-cell"></td>`;
  varRow.innerHTML = varCells;
  tbody.appendChild(varRow);

  // Bar chart
  if (chartCtx) {
    if (chartInstances.weeklyTotals) chartInstances.weeklyTotals.destroy();
    const weekTotals = wsd.weekTotals || [];
    // Recalculate from filtered/scaled stores
    let chartData;
    if (f.chains.length || scaleRatio < 1) {
      chartData = weekKeys.map((wk, i) => ({
        label: weekLabels[i],
        clp: stores.reduce((s, st) => s + ((st.weeks || {})[wk]?.clp || 0), 0)
      }));
    } else {
      chartData = weekTotals.map(wt => ({ label: wt.label, clp: wt.clp }));
    }
    const barColors = ['#249ffc', '#f91c91', '#0b3b74', '#22c55e'];
    chartInstances.weeklyTotals = new Chart(chartCtx, {
      type: 'bar',
      data: {
        labels: chartData.map(d => d.label),
        datasets: [{
          data: chartData.map(d => d.clp),
          backgroundColor: chartData.map((_, i) => barColors[i % barColors.length] + 'CC'),
          borderColor: chartData.map((_, i) => barColors[i % barColors.length]),
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            display: true,
            color: '#e2e8f0',
            font: { size: 10, weight: 'bold' },
            anchor: 'end',
            align: 'end',
            formatter: v => fmtNum(v, 'clp')
          }
        },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 10 }, callback: v => fmtNum(v, 'clp') }, grid: { color: 'rgba(148,163,184,0.06)' } },
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  }
}

// ══════════════════════════════════════════════════════════
//  TAB 4: LABORATORIO
// ══════════════════════════════════════════════════════════

function renderLabPage() {
  // Campaign section (demo data) - initialize once
  if (!campaignInitialized) {
    populateCampaignFilters();
    renderKPIs();
    renderCampaignCards();
    selectCampaign(CAMPAIGNS.find(c => c.status === "active")?.id || CAMPAIGNS[0].id);
    campaignInitialized = true;
  }

  // Lab charts (real data)
  const data = getFilteredData();
  if (!data) return;
  renderLabVelocityDivChart(data);
  renderNoRegionTable(data);
  renderLabDataExplorer(data);
}

// ── Heatmap ─────────────────────────────────────────────
function renderHeatmap(data) {
  const container = document.getElementById("heatmap-container");
  if (!container) return;

  const allStores = Object.values(data.rankingByChainStore).flat().sort((a, b) => b.units - a.units).slice(0, 20);
  const dates = [...new Set(data.dailyTotals.map(d => d.date))].sort();

  const totalByDate = {};
  data.dailyTotals.forEach(d => { totalByDate[d.date] = d.units; });
  const grandTotal = data.dailyTotals.reduce((s, d) => s + d.units, 0);

  // Pre-calculate all estimated values for proper global min/max scaling
  const estMatrix = allStores.map(store =>
    dates.map(date => {
      const dayPct = grandTotal > 0 ? (totalByDate[date] || 0) / grandTotal : 0;
      return Math.round(store.units * dayPct * dates.length);
    })
  );

  const allVals = estMatrix.flat();
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = maxVal - minVal || 1;

  // Multi-stop color scale: deep blue → teal → green → yellow → orange
  function heatColor(value) {
    const t = (value - minVal) / range;
    let r, g, b;
    if (t < 0.25) {
      const s = t / 0.25;
      r = Math.round(20 + 10 * s); g = Math.round(50 + 140 * s); b = Math.round(160 - 20 * s);
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      r = Math.round(30 + 30 * s); g = Math.round(190 + 20 * s); b = Math.round(140 - 100 * s);
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      r = Math.round(60 + 180 * s); g = Math.round(210 + 20 * s); b = Math.round(40 - 10 * s);
    } else {
      const s = (t - 0.75) / 0.25;
      r = Math.round(240 + 15 * s); g = Math.round(230 - 120 * s); b = Math.round(30);
    }
    return `rgba(${r},${g},${b},0.8)`;
  }

  let html = '<table class="heatmap-table"><thead><tr><th class="store-label">Tienda</th>';
  dates.forEach(d => { html += `<th>${shortDate(d)}</th>`; });
  html += '<th>Total</th></tr></thead><tbody>';

  allStores.forEach((store, si) => {
    html += `<tr><td class="store-label" title="${store.store}">${store.store.substring(0, 25)}</td>`;
    dates.forEach((date, di) => {
      const val = estMatrix[si][di];
      html += `<td style="background:${heatColor(val)};color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.6);font-size:0.7rem">${val}</td>`;
    });
    const rowSum = estMatrix[si].reduce((s, v) => s + v, 0);
    html += `<td style="font-weight:700;color:var(--text-primary)">${rowSum.toLocaleString("es-CL")}</td></tr>`;
  });

  html += '</tbody></table>';
  html += '<div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.75rem;font-size:0.7rem;color:#64748b">';
  html += '<span>Menor venta</span>';
  html += '<div style="height:10px;width:180px;border-radius:5px;background:linear-gradient(90deg,rgba(20,50,160,0.8),rgba(30,190,140,0.8),rgba(60,210,40,0.8),rgba(240,230,30,0.8),rgba(255,110,30,0.8))"></div>';
  html += '<span>Mayor venta</span>';
  html += '<span style="margin-left:auto;color:#94a3b8">Und. estimadas/día</span></div>';

  container.innerHTML = html;
}

// ── License × Chain Heatmap ─────────────────────────────
function renderLicenseChainHeatmap(data) {
  const container = document.getElementById("heatmap-license-chain");
  if (!container) return;

  // Build matrix from filtered data's salesByChainLicense
  const salesByCL = data.salesByChainLicense || {};
  const f = getGlobalFilters();
  const chains = data.allChains || Object.keys(salesByCL).sort();

  // Determine which licenses pass active filters (division, license, year, quarter, temporada)
  const licDivBreak = data.licenseDivisionBreakdown || {};
  const licYearBreak = data.licenseYearBreakdown || {};
  const licQBreak = data.licenseQuarterBreakdown || {};
  const licTempBreak = data.licenseTemporadaBreakdown || {};
  function licPassesFilters(lic) {
    if (f.licenses.length && !f.licenses.includes(lic)) return false;
    if (f.divisions.length && licDivBreak[lic] && !f.divisions.some(d => licDivBreak[lic][d])) return false;
    return true;
  }
  function _sumKeys(obj, keys) { return keys.reduce((s, k) => s + ((obj[k]?.units || obj[k]?.pct || 0)), 0); }
  function licFilterRatio(lic) {
    let ratio = 1;
    if (f.divisions.length && licDivBreak[lic]) {
      const total = Object.values(licDivBreak[lic]).reduce((s, v) => s + (v.pct || 0), 0) || 100;
      ratio *= f.divisions.reduce((s, d) => s + (licDivBreak[lic][d]?.pct || 0), 0) / total;
    }
    if (f.years.length && licYearBreak[lic]) {
      const total = Object.values(licYearBreak[lic]).reduce((s, v) => s + (v.units || 0), 0) || 1;
      ratio *= f.years.reduce((s, y) => s + (licYearBreak[lic][y]?.units || 0), 0) / total;
    }
    if (f.quarters.length && licQBreak[lic]) {
      const total = Object.values(licQBreak[lic]).reduce((s, v) => s + (v.units || 0), 0) || 1;
      ratio *= f.quarters.reduce((s, q) => s + (licQBreak[lic][q]?.units || 0), 0) / total;
    }
    if (f.temporadas.length && licTempBreak[lic]) {
      const total = Object.values(licTempBreak[lic]).reduce((s, v) => s + (v.units || 0), 0) || 1;
      ratio *= f.temporadas.reduce((s, t) => s + (licTempBreak[lic][t]?.units || 0), 0) / total;
    }
    return ratio;
  }

  // Get all licenses with totals, sorted desc — NO limit
  const licTotals = {};
  const chainTotals = {};
  const baseChains = f.chains.length ? f.chains.filter(ch => chains.includes(ch)) : chains;
  baseChains.forEach(ch => {
    const lics = salesByCL[ch] || {};
    let chainSum = 0;
    Object.entries(lics).forEach(([lic, d]) => {
      if (!licPassesFilters(lic)) return;
      const ratio = licFilterRatio(lic);
      const units = Math.round(d.units * ratio);
      if (!licTotals[lic]) licTotals[lic] = 0;
      licTotals[lic] += units;
      chainSum += units;
    });
    chainTotals[ch] = chainSum;
  });
  // Sort chains by total units desc (left to right)
  const displayChains = [...baseChains].sort((a, b) => (chainTotals[b] || 0) - (chainTotals[a] || 0));
  const licenses = Object.entries(licTotals).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]).map(e => e[0]);

  if (!licenses.length || !displayChains.length) { container.innerHTML = '<p style="color:#64748b;padding:1rem">Sin datos</p>'; return; }

  // Build value matrix and find min/max for color scale
  const matrix = licenses.map(lic => {
    const ratio = licFilterRatio(lic);
    return displayChains.map(ch => Math.round((((salesByCL[ch] || {})[lic] || {}).units || 0) * ratio));
  });
  const allVals = matrix.flat().filter(v => v > 0);
  const minVal = allVals.length ? Math.min(...allVals) : 0;
  const maxVal = allVals.length ? Math.max(...allVals) : 1;
  const range = maxVal - minVal || 1;

  function heatColor(value) {
    if (value === 0) return 'rgba(30,41,59,0.5)';
    const t = (value - minVal) / range;
    let r, g, b;
    if (t < 0.25) { const s = t / 0.25; r = Math.round(20 + 10 * s); g = Math.round(50 + 140 * s); b = Math.round(160 - 20 * s); }
    else if (t < 0.5) { const s = (t - 0.25) / 0.25; r = Math.round(30 + 30 * s); g = Math.round(190 + 20 * s); b = Math.round(140 - 100 * s); }
    else if (t < 0.75) { const s = (t - 0.5) / 0.25; r = Math.round(60 + 180 * s); g = Math.round(210 + 20 * s); b = Math.round(40 - 10 * s); }
    else { const s = (t - 0.75) / 0.25; r = Math.round(240 + 15 * s); g = Math.round(230 - 120 * s); b = Math.round(30); }
    return `rgba(${r},${g},${b},0.8)`;
  }

  let html = '<table class="heatmap-table"><thead><tr><th class="store-label">Propiedad</th>';
  displayChains.forEach(ch => { html += `<th style="font-size:0.65rem;writing-mode:vertical-rl;text-orientation:mixed;height:80px;white-space:nowrap">${ch}</th>`; });
  html += '<th>Total</th></tr></thead><tbody>';

  licenses.forEach((lic, li) => {
    html += `<tr><td class="store-label" title="${lic}" style="font-size:0.72rem">${lic.length > 20 ? lic.substring(0, 18) + '…' : lic}</td>`;
    let rowTotal = 0;
    displayChains.forEach((ch, ci) => {
      const val = matrix[li][ci];
      rowTotal += val;
      const cellText = val > 0 ? val.toLocaleString("es-CL") : '';
      html += `<td style="background:${heatColor(val)};color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.6);font-size:0.68rem;text-align:center;min-width:55px">${cellText}</td>`;
    });
    html += `<td style="font-weight:700;color:var(--text-primary);font-size:0.72rem">${rowTotal.toLocaleString("es-CL")}</td></tr>`;
  });

  // Totals row
  html += '<tr style="border-top:2px solid var(--accent-primary,#249ffc);background:var(--bg-card-alt,#1a2332)"><td class="store-label" style="font-weight:700;font-size:0.72rem">TOTAL</td>';
  let grandTotal = 0;
  displayChains.forEach((ch, ci) => {
    const colTotal = licenses.reduce((s, _, li) => s + matrix[li][ci], 0);
    grandTotal += colTotal;
    html += `<td style="font-weight:700;color:var(--text-primary);font-size:0.68rem;text-align:center">${colTotal.toLocaleString("es-CL")}</td>`;
  });
  html += `<td style="font-weight:700;color:var(--text-primary);font-size:0.72rem">${grandTotal.toLocaleString("es-CL")}</td></tr>`;

  html += '</tbody></table>';
  html += '<div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.75rem;font-size:0.7rem;color:#64748b">';
  html += '<span>Sin venta</span>';
  html += '<div style="height:10px;width:12px;border-radius:3px;background:rgba(30,41,59,0.5)"></div>';
  html += '<span style="margin-left:0.5rem">Menor</span>';
  html += '<div style="height:10px;width:180px;border-radius:5px;background:linear-gradient(90deg,rgba(20,50,160,0.8),rgba(30,190,140,0.8),rgba(60,210,40,0.8),rgba(240,230,30,0.8),rgba(255,110,30,0.8))"></div>';
  html += '<span>Mayor</span>';
  html += `<span style="margin-left:auto;color:#94a3b8">${licenses.length} propiedades × ${displayChains.length} cadenas</span></div>`;

  container.innerHTML = html;
}

// ── Scatter Chart ───────────────────────────────────────
function renderScatterChart(data) {
  const ctx = document.getElementById("chart-scatter");
  if (!ctx) return;
  if (chartInstances.scatter) chartInstances.scatter.destroy();

  const chainColorMap = {};
  (data.allChains || []).forEach(c => { chainColorMap[c] = chainColor(c); });

  const allStores = Object.entries(data.rankingByChainStore).flatMap(([chain, stores]) =>
    stores.map(s => ({ ...s, chain }))
  );

  const datasets = (data.allChains || []).map(chain => {
    const stores = allStores.filter(s => s.chain === chain);
    return {
      label: chain,
      data: stores.map(s => ({ x: s.units, y: s.clp, store: s.store, storeCode: s.storeCode || '' })),
      backgroundColor: chainColorMap[chain] + "99",
      borderColor: chainColorMap[chain],
      pointRadius: 5, pointHoverRadius: 8
    };
  });

  chartInstances.scatter = new Chart(ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 10 }, padding: 10 } },
        tooltip: {
          backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8",
          borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8,
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              const pt = items[0].raw;
              return pt.store || '';
            },
            beforeBody: (items) => {
              if (!items.length) return '';
              const pt = items[0].raw;
              const code = pt.storeCode ? pt.storeCode.split(' ')[0] : '';
              return code ? `Local: ${code} | ${items[0].dataset.label}` : items[0].dataset.label;
            },
            label: (item) => {
              return ` ${item.raw.x.toLocaleString('es-CL')} und | ${formatCLP(item.raw.y)}`;
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: "Unidades", color: "#64748b" }, ...chartScaleX() },
        y: { title: { display: true, text: "Venta CLP", color: "#64748b" }, ticks: { color: "#64748b", font: { size: 10 }, callback: v => "$" + Math.round(v / 1e6) + "M" }, grid: { color: "rgba(148,163,184,0.06)" } }
      }
    }
  });
}

// ── Lab Velocity by Division ────────────────────────────
function renderLabVelocityDivChart(data) {
  const ctx = document.getElementById("chart-lab-velocity-div");
  if (!ctx || !data.velocityMetrics) return;
  if (chartInstances.labVelDiv) chartInstances.labVelDiv.destroy();
  const vd = data.velocityMetrics.velocityByDivision;
  chartInstances.labVelDiv = new Chart(ctx, {
    type: "bar",
    data: {
      labels: vd.map(d => d.division),
      datasets: [{
        label: "Und/Día",
        data: vd.map(d => d.unitsPerDay),
        backgroundColor: vd.map(d => (DIV_COLORS[d.division] || "#94a3b8") + "CC"),
        borderColor: vd.map(d => DIV_COLORS[d.division] || "#94a3b8"),
        borderWidth: 1, borderRadius: 4
      }]
    },
    options: {
      ...chartOptionsBar(),
      plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: (ctx) => `Tendencia: ${vd[ctx.dataIndex].trend > 0 ? '+' : ''}${vd[ctx.dataIndex].trend}%` } } }
    }
  });
}

// ── No Region Stores ────────────────────────────────────
function renderNoRegionTable(data) {
  const tbody = document.getElementById("no-region-table-body");
  if (!tbody || !data.noRegionStores) return;
  tbody.innerHTML = "";
  data.noRegionStores.forEach((s, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="rank-number">${i + 1}</td>
      <td><span style="color:${chainColor(s.cadena)};font-weight:600">${s.cadena}</span></td>
      <td class="store-name-cell" title="${s.codigoLocal}">${s.codigoLocal}</td>
      <td class="number-cell">${s.unidades}</td>
      <td class="number-cell">${formatCLP(s.clp)}</td>
      <td class="number-cell">${s.skus}</td>
      <td class="number-cell">${s.dias}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Lab Data Explorer ───────────────────────────────────
function renderLabDataExplorer(data) {
  const tbody = document.getElementById("lab-data-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const allStores = Object.entries(data.rankingByChainStore).flatMap(([chain, stores]) =>
    stores.map(s => ({ ...s, chain }))
  ).sort((a, b) => b.units - a.units).slice(0, 50);

  allStores.forEach((s, i) => {
    const avgPrice = s.units > 0 ? Math.round(s.clp / s.units) : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="rank-number">${i + 1}</td>
      <td class="store-name-cell" title="${s.store}">${s.store}</td>
      <td><span style="color:${chainColor(s.chain)};font-weight:600">${s.chain}</span></td><td>${s.region}</td>
      <td class="number-cell">${s.units.toLocaleString("es-CL")}</td>
      <td class="number-cell">${formatCLP(s.clp)}</td>
      <td class="number-cell">${formatCLP(avgPrice)}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Chain Freshness Table ────────────────────
function _buildFreshnessTable(freshData) {
  const statusLabel = s => s === 'fresh' ? 'Actualizada' : s === 'warning' ? 'Parcialmente' : 'Desactualizado';
  const statusColor = s => s === 'fresh' ? '#22c55e' : s === 'warning' ? '#eab308' : '#ef4444';

  let html = `<table class="freshness-table">
    <thead><tr>
      <th>Cadena</th><th>Primera Fecha</th><th>Ultima Fecha</th>
      <th>Dias c/ Datos</th><th>Rango</th><th>Tiendas</th><th>Estado</th>
    </tr></thead><tbody>`;

  freshData.forEach(item => {
    const color = chainColor(item.chain);
    const sc = statusColor(item.status);
    const sl = statusLabel(item.status);
    const coverage = item.rangeDays > 0 ? Math.round(item.daysWithData / item.rangeDays * 100) : 0;
    html += `<tr>
      <td><span class="freshness-dot ${item.status}"></span> <span style="color:${color};font-weight:600">${item.chain}</span></td>
      <td>${formatDate(item.firstDate || item.lastUpdate)}</td>
      <td>${formatDate(item.lastUpdate)}</td>
      <td>${item.daysWithData || '-'}/${item.rangeDays || '-'} <span style="color:var(--text-muted);font-size:0.7rem">(${coverage}%)</span></td>
      <td>${item.rangeDays || '-'}d</td>
      <td>${item.stores || '-'}</td>
      <td><span style="color:${sc};font-weight:600">${sl}</span> <span style="color:var(--text-muted);font-size:0.7rem">(${item.daysOld}d)</span></td>
    </tr>`;
  });

  // Totals row
  const totalStores = new Set();
  const allDates = new Set();
  freshData.forEach(item => {
    if (item.stores) for (let i = 0; i < item.stores; i++) totalStores.add(item.chain + i);
  });
  const totalDaysData = freshData.length > 0 ? Math.max(...freshData.map(i => i.daysWithData || 0)) : 0;
  const totalRange = freshData.length > 0 ? Math.max(...freshData.map(i => i.rangeDays || 0)) : 0;
  const totalStoreCount = freshData.reduce((s, i) => s + (i.stores || 0), 0);
  const freshCount = freshData.filter(i => i.status === 'fresh').length;
  const warnCount = freshData.filter(i => i.status === 'warning').length;
  const staleCount = freshData.filter(i => i.status === 'stale').length;

  html += `<tr class="freshness-total-row">
    <td><strong>${freshData.length} cadenas</strong></td>
    <td></td><td></td>
    <td></td>
    <td>${totalRange}d</td>
    <td>${totalStoreCount}</td>
    <td><span style="color:#22c55e">${freshCount}</span> / <span style="color:#eab308">${warnCount}</span> / <span style="color:#ef4444">${staleCount}</span></td>
  </tr>`;

  html += '</tbody></table>';
  return html;
}

function renderChainFreshness() {
  const container = document.getElementById("freshness-grid");
  if (!container) return;

  const freshData = (typeof REAL_SELLOUT !== "undefined" && REAL_SELLOUT._meta && REAL_SELLOUT._meta.chainFreshness)
    ? REAL_SELLOUT._meta.chainFreshness
    : (typeof CHAIN_FRESHNESS !== "undefined" ? CHAIN_FRESHNESS : []);

  if (!freshData.length) {
    container.innerHTML = '<span style="color:var(--text-muted)">Sin datos de frescura</span>';
    return;
  }
  container.innerHTML = _buildFreshnessTable(freshData);
}

// ── Ranking Freshness (Tab 2 copy) ──────────────────
function renderRankingFreshness() {
  const container = document.getElementById("ranking-freshness-grid");
  if (!container) return;
  const freshData = (typeof REAL_SELLOUT !== "undefined" && REAL_SELLOUT._meta && REAL_SELLOUT._meta.chainFreshness)
    ? REAL_SELLOUT._meta.chainFreshness : [];
  if (!freshData.length) {
    container.innerHTML = '<span style="color:var(--text-muted)">Sin datos de frescura</span>';
    return;
  }
  container.innerHTML = _buildFreshnessTable(freshData);
}

// ── Chain Monitoring (alertas cadenas nuevas/faltantes) ──
const EXPECTED_CHAINS = Object.keys(CHAIN_COLOR_MAP);

function renderChainMonitoring() {
  const container = document.getElementById("chain-monitor-alerts");
  if (!container) return;
  container.innerHTML = "";

  const currentChains = (typeof REAL_SELLOUT !== "undefined" && REAL_SELLOUT._meta && REAL_SELLOUT._meta.chains)
    ? REAL_SELLOUT._meta.chains : [];
  if (!currentChains.length) return;

  const alerts = [];

  // Cadenas nuevas no mapeadas
  currentChains.forEach(chain => {
    if (!CHAIN_COLOR_MAP[chain]) {
      alerts.push({ type: "new", chain, msg: `Nueva cadena detectada: <b>${chain}</b> — sin color asignado` });
    }
  });

  // Cadenas esperadas que desaparecieron
  EXPECTED_CHAINS.forEach(chain => {
    if (!currentChains.includes(chain)) {
      alerts.push({ type: "missing", chain, msg: `Cadena sin datos: <b>${chain}</b> — no aparece en el pull actual` });
    }
  });

  if (!alerts.length) {
    container.innerHTML = '<div class="chain-monitor-ok">Todas las cadenas mapeadas y presentes</div>';
    return;
  }

  alerts.forEach(a => {
    const el = document.createElement("div");
    el.className = "chain-monitor-alert chain-monitor-" + a.type;
    el.innerHTML = `<span class="chain-monitor-icon">${a.type === "new" ? "\u26A0" : "\u2716"}</span> ${a.msg}`;
    container.appendChild(el);
  });
}

// ── Scroll Animations ───────────────────────────────────
function initScrollAnimations() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add("visible"); });
  }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });
  document.querySelectorAll(".fade-in").forEach(el => observer.observe(el));
}

// ── Shared Chart Helpers ────────────────────────────────
function chartOptionsLine(yUnit) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 10, family: "'Inter', sans-serif" }, padding: 12 } }, tooltip: { backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8", borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8 } },
    scales: { x: chartScaleX(), y: chartScaleY(yUnit) }
  };
}

function chartOptionsBar(yUnit) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: chartScaleX(), y: chartScaleY(yUnit) }
  };
}

function chartScaleX(label) {
  const s = { ticks: { color: "#64748b", font: { size: 10 } }, grid: { color: "rgba(148,163,184,0.06)" } };
  if (label) s.title = { display: true, text: label, color: "#64748b", font: { size: 10, family: "'Inter', sans-serif" } };
  return s;
}

function chartScaleY(unit) {
  const s = { ticks: { color: "#94a3b8", font: { size: 10, family: "'Inter', sans-serif" } }, grid: { color: "rgba(148,163,184,0.06)" } };
  if (unit === "und") { s.title = { display: true, text: "Unidades", color: "#64748b", font: { size: 10 } }; s.ticks.callback = v => v >= 1000 ? Math.round(v / 1000) + "K" : v; }
  else if (unit === "clp") { s.title = { display: true, text: "CLP", color: "#64748b", font: { size: 10 } }; s.ticks.callback = v => "$" + (v >= 1e6 ? Math.round(v / 1e6) + "M" : v >= 1000 ? Math.round(v / 1000) + "K" : v); }
  else if (unit === "%") { s.title = { display: true, text: "%", color: "#64748b", font: { size: 10 } }; s.ticks.callback = v => v + "%"; }
  else if (unit === "und/dia") { s.title = { display: true, text: "Und/Día", color: "#64748b", font: { size: 10 } }; }
  else if (unit) { s.title = { display: true, text: unit, color: "#64748b", font: { size: 10 } }; }
  return s;
}

// Short number formatter for chart datalabels
function fmtNum(v, type) {
  if (v == null || v === 0) return '';
  if (type === 'clp' || type === 'M') return v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + v;
  if (type === '%') return v.toFixed(1) + '%';
  return v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? Math.round(v / 1e3).toLocaleString('es-CL') : v.toString();
}

// ── Utilities ───────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function shortDate(d) {
  if (!d) return '';
  const dt = new Date(d + "T12:00:00");
  return `${dt.getDate()}/${dt.getMonth() + 1}`;
}

function formatCLP(amount) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(amount);
}
