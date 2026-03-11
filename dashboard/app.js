// ============================================================
// TBC C.A.R.S. - Control de Activos y Rutas de Sell-out
// ============================================================

let selectedCampaignId = null;
let chartInstances = {};
let currentTab = 'command-center';
const tabRendered = { 'command-center': false, 'ranking': false, 'laboratorio': false };
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
function populateGlobalFilters() {
  const data = typeof REAL_SELLOUT !== 'undefined' ? REAL_SELLOUT : null;
  if (!data) return;

  const dateFrom = document.getElementById('filter-date-from');
  const dateTo = document.getElementById('filter-date-to');
  if (data.kpis.dateRange) {
    dateFrom.value = data.kpis.dateRange.from;
    dateTo.value = data.kpis.dateRange.to;
  }

  function fillSelect(id, items) {
    const sel = document.getElementById(id);
    if (!sel) return;
    items.forEach(v => {
      const opt = document.createElement('option');
      opt.value = typeof v === 'string' ? v : v.value;
      opt.textContent = typeof v === 'string' ? v : v.label;
      sel.appendChild(opt);
    });
  }

  fillSelect('filter-chain', data.allChains || []);
  fillSelect('filter-division', (data.byDivision || []).map(d => d.division));
  fillSelect('filter-license-global', data.allLicenses || []);
  fillSelect('filter-year-product', (data.allYearsProduct || []).map(y => ({ value: y, label: y })));
  fillSelect('filter-quarter', (data.allQuarters || []).map(q => ({ value: q, label: q })));
  fillSelect('filter-temporada', data.allTemporadas || []);

  ['filter-date-from','filter-date-to','filter-chain','filter-division',
   'filter-license-global','filter-year-product','filter-quarter','filter-temporada'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', onGlobalFilterChange);
  });
}

function getGlobalFilters() {
  return {
    dateFrom: document.getElementById('filter-date-from')?.value || '',
    dateTo: document.getElementById('filter-date-to')?.value || '',
    chain: document.getElementById('filter-chain')?.value || '',
    division: document.getElementById('filter-division')?.value || '',
    license: document.getElementById('filter-license-global')?.value || '',
    yearProduct: document.getElementById('filter-year-product')?.value || '',
    quarter: document.getElementById('filter-quarter')?.value || '',
    temporada: document.getElementById('filter-temporada')?.value || '',
  };
}

// Helper: proportionally scale dailySales using a breakdown map
function scaleDailySales(dailySales, breakdownMap, selectedKey) {
  return dailySales.map(d => {
    const licBreakdown = breakdownMap[d.license];
    if (!licBreakdown) return null;
    const selected = licBreakdown[selectedKey];
    if (!selected) return null;
    const totalU = Object.values(licBreakdown).reduce((s, v) => s + v.units, 0);
    if (totalU === 0) return null;
    const ratio = selected.units / totalU;
    return { ...d, units: Math.round(d.units * ratio), clp: Math.round(d.clp * ratio) };
  }).filter(d => d && d.units > 0);
}

function getFilteredData() {
  const src = typeof REAL_SELLOUT !== 'undefined' ? REAL_SELLOUT : null;
  if (!src) return null;
  const f = getGlobalFilters();
  const noFilter = !f.dateFrom && !f.dateTo && !f.chain && !f.division
                && !f.license && !f.yearProduct && !f.quarter && !f.temporada;
  if (noFilter) return src;

  const licDivBreakdown = src.licenseDivisionBreakdown || {};

  let dailySales = src.dailySales || [];
  let dailyTotals = src.dailyTotals || [];
  let dailyByChain = src.dailyByChain || [];
  let byDivisionDaily = src.byDivisionDaily || [];

  // 1. Date filters (exact)
  if (f.dateFrom) {
    dailySales = dailySales.filter(d => d.date >= f.dateFrom);
    dailyTotals = dailyTotals.filter(d => d.date >= f.dateFrom);
    dailyByChain = dailyByChain.filter(d => d.date >= f.dateFrom);
    byDivisionDaily = byDivisionDaily.filter(d => d.date >= f.dateFrom);
  }
  if (f.dateTo) {
    dailySales = dailySales.filter(d => d.date <= f.dateTo);
    dailyTotals = dailyTotals.filter(d => d.date <= f.dateTo);
    dailyByChain = dailyByChain.filter(d => d.date <= f.dateTo);
    byDivisionDaily = byDivisionDaily.filter(d => d.date <= f.dateTo);
  }

  // 2. Chain filter (exact on dailyByChain, proportional on dailySales + byDivisionDaily)
  if (f.chain) {
    dailyByChain = dailyByChain.filter(d => d.chain === f.chain);
    const chainLicData = (src.salesByChainLicense || {})[f.chain] || {};
    const licTotals = {};
    Object.values(src.salesByChainLicense || {}).forEach(lics => {
      Object.entries(lics).forEach(([lic, d]) => {
        if (!licTotals[lic]) licTotals[lic] = { units: 0, clp: 0 };
        licTotals[lic].units += d.units;
        licTotals[lic].clp += d.clp;
      });
    });
    dailySales = dailySales.map(d => {
      const chainD = chainLicData[d.license];
      const totalD = licTotals[d.license];
      if (!chainD || !totalD || totalD.units === 0) return null;
      const ratio = chainD.units / totalD.units;
      return { ...d, units: Math.round(d.units * ratio), clp: Math.round(d.clp * ratio) };
    }).filter(d => d && d.units > 0);

    // Recalculate byDivisionDaily from chain-filtered dailySales using licenseDivisionBreakdown
    const divDailyAgg = {};
    dailySales.forEach(d => {
      const licBreak = licDivBreakdown[d.license];
      if (licBreak) {
        const totalPct = Object.values(licBreak).reduce((s, v) => s + (v.pct || 0), 0) || 100;
        Object.entries(licBreak).forEach(([div, info]) => {
          const ratio = (info.pct || 0) / totalPct;
          const key = d.date + '|' + div;
          if (!divDailyAgg[key]) divDailyAgg[key] = { date: d.date, division: div, units: 0, clp: 0 };
          divDailyAgg[key].units += Math.round(d.units * ratio);
          divDailyAgg[key].clp += Math.round(d.clp * ratio);
        });
      }
    });
    byDivisionDaily = Object.values(divDailyAgg).sort((a, b) => a.date.localeCompare(b.date));
  }

  // 3. License filter (exact)
  if (f.license) {
    dailySales = dailySales.filter(d => d.license === f.license);
  }

  // 4. Division filter (proportional via licenseDivisionBreakdown)
  if (f.division) {
    dailySales = scaleDailySales(dailySales, licDivBreakdown, f.division);
    byDivisionDaily = byDivisionDaily.filter(d => d.division === f.division);
  }

  // 5-7. Temporal filters (proportional)
  if (f.yearProduct) {
    dailySales = scaleDailySales(dailySales, src.licenseYearBreakdown || {}, f.yearProduct);
  }
  if (f.quarter) {
    dailySales = scaleDailySales(dailySales, src.licenseQuarterBreakdown || {}, f.quarter);
  }
  if (f.temporada) {
    dailySales = scaleDailySales(dailySales, src.licenseTemporadaBreakdown || {}, f.temporada);
  }

  // Re-aggregate byLicense from filtered dailySales
  const licAgg = {};
  dailySales.forEach(d => {
    if (!licAgg[d.license]) licAgg[d.license] = { license: d.license, units: 0, clp: 0 };
    licAgg[d.license].units += d.units;
    licAgg[d.license].clp += d.clp;
  });
  const byLicense = Object.values(licAgg).sort((a, b) => b.units - a.units);
  const colors = src.byLicense || [];
  byLicense.forEach((l, i) => {
    const orig = colors.find(c => c.license === l.license);
    l.color = orig ? orig.color : (["#6366f1","#f97316","#22c55e","#eab308","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#3b82f6","#84cc16","#06b6d4","#d946ef","#f43f5e","#10b981"])[i % 15];
  });

  // Re-aggregate byChain from dailyByChain
  const chainAgg = {};
  dailyByChain.forEach(d => {
    if (!chainAgg[d.chain]) chainAgg[d.chain] = { chain: d.chain, units: 0, clp: 0 };
    chainAgg[d.chain].units += d.units;
    chainAgg[d.chain].clp += d.clp;
  });
  let byChain = Object.values(chainAgg).sort((a, b) => b.clp - a.clp);

  // If division filter active, recalculate byChain from rankingByChainStore
  if (f.division) {
    const chainFromStores = {};
    Object.entries(src.rankingByChainStore || {}).forEach(([ch, stores]) => {
      if (f.chain && ch !== f.chain) return;
      stores.forEach(s => {
        const divData = (s.byDivision || {})[f.division];
        if (!divData) return;
        if (!chainFromStores[ch]) chainFromStores[ch] = { chain: ch, units: 0, clp: 0 };
        chainFromStores[ch].units += divData.units;
        chainFromStores[ch].clp += divData.clp;
      });
    });
    byChain = Object.values(chainFromStores).sort((a, b) => b.clp - a.clp);
  }

  // Filter rankingByChainStore (must happen before KPI calc)
  let rankingByChainStore = src.rankingByChainStore || {};
  if (f.chain) {
    rankingByChainStore = f.chain in rankingByChainStore ? { [f.chain]: rankingByChainStore[f.chain] } : {};
  }
  if (f.division) {
    const filteredRanking = {};
    Object.entries(rankingByChainStore).forEach(([ch, stores]) => {
      const filtered = stores.filter(s => s.byDivision && s.byDivision[f.division]).map(s => {
        const divData = s.byDivision[f.division];
        return {
          ...s,
          units: divData.units,
          clp: divData.clp,
          costos: divData.costos || 0,
          margin: divData.clp > 0 ? Math.round((divData.clp - (divData.costos || 0)) / divData.clp * 1000) / 10 : 0,
          byDivision: { [f.division]: divData }
        };
      });
      if (filtered.length) filteredRanking[ch] = filtered;
    });
    rankingByChainStore = filteredRanking;
  }

  // Re-aggregate dailyTotals FIRST (single source of truth for KPIs + chart)
  let filteredDailyTotals;
  if (f.division) {
    // Division filter active: use byDivisionDaily (already proportionally filtered)
    const divDtAgg = {};
    byDivisionDaily.forEach(d => {
      if (!divDtAgg[d.date]) divDtAgg[d.date] = { date: d.date, units: 0, clp: 0 };
      divDtAgg[d.date].units += d.units;
      divDtAgg[d.date].clp += d.clp;
    });
    filteredDailyTotals = Object.values(divDtAgg).sort((a, b) => a.date.localeCompare(b.date));
  } else {
    // No division filter: use dailyByChain (exact data, already chain-filtered if needed)
    const dtAgg = {};
    dailyByChain.forEach(d => {
      if (!dtAgg[d.date]) dtAgg[d.date] = { date: d.date, units: 0, clp: 0 };
      dtAgg[d.date].units += d.units;
      dtAgg[d.date].clp += d.clp;
    });
    filteredDailyTotals = Object.values(dtAgg).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Normalize dailySales + byLicense so license breakdown sums match filteredDailyTotals
  if (f.chain || f.division || f.yearProduct || f.quarter || f.temporada) {
    const authTotals = {};
    filteredDailyTotals.forEach(d => { authTotals[d.date] = { units: d.units, clp: d.clp }; });
    const salesTotals = {};
    dailySales.forEach(d => {
      if (!salesTotals[d.date]) salesTotals[d.date] = { units: 0, clp: 0 };
      salesTotals[d.date].units += d.units;
      salesTotals[d.date].clp += d.clp;
    });
    dailySales = dailySales.map(d => {
      const auth = authTotals[d.date];
      const cur = salesTotals[d.date];
      if (!auth || !cur || cur.units === 0) return d;
      const uRatio = auth.units / cur.units;
      const cRatio = cur.clp > 0 ? auth.clp / cur.clp : 1;
      return { ...d, units: Math.round(d.units * uRatio), clp: Math.round(d.clp * cRatio) };
    });
    // Re-aggregate byLicense after normalization
    const licAgg2 = {};
    dailySales.forEach(d => {
      if (!licAgg2[d.license]) licAgg2[d.license] = { license: d.license, units: 0, clp: 0 };
      licAgg2[d.license].units += d.units;
      licAgg2[d.license].clp += d.clp;
    });
    const normalizedByLic = Object.values(licAgg2).sort((a, b) => b.units - a.units);
    // Update byLicense in place
    byLicense.length = 0;
    normalizedByLic.forEach(l => {
      const orig = colors.find(c => c.license === l.license);
      l.color = orig ? orig.color : (["#6366f1","#f97316","#22c55e","#eab308","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#3b82f6","#84cc16","#06b6d4","#d946ef","#f43f5e","#10b981"])[byLicense.length % 15];
      byLicense.push(l);
    });
  }

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

  // Re-aggregate byDivision from filtered data
  let byDivision = src.byDivision || [];
  if (f.chain || f.division) {
    // Recalculate from byDivisionDaily (already chain-filtered if chain active)
    const divAgg = {};
    byDivisionDaily.forEach(d => {
      if (!divAgg[d.division]) divAgg[d.division] = { division: d.division, units: 0, clp: 0 };
      divAgg[d.division].units += d.units;
      divAgg[d.division].clp += d.clp;
    });
    // Count stores per division from filtered ranking
    const divStoreCounts = {};
    Object.values(rankingByChainStore).flat().forEach(s => {
      Object.keys(s.byDivision || {}).forEach(div => {
        divStoreCounts[div] = (divStoreCounts[div] || 0) + 1;
      });
    });
    const totalDivUnits = Object.values(divAgg).reduce((s, d) => s + d.units, 0);
    byDivision = Object.values(divAgg).map(d => {
      const orig = (src.byDivision || []).find(o => o.division === d.division) || {};
      return {
        ...orig, ...d,
        pctOfTotal: totalDivUnits > 0 ? Math.round(d.units / totalDivUnits * 1000) / 10 : 0,
        storeCount: divStoreCounts[d.division] || 0,
      };
    }).sort((a, b) => b.units - a.units);
    if (f.division) {
      byDivision = byDivision.filter(d => d.division === f.division);
    }
  }

  // Filter divisionMixByChain
  let divisionMixByChain = src.divisionMixByChain || [];
  if (f.chain) {
    divisionMixByChain = divisionMixByChain.filter(d => d.chain === f.chain);
  }

  // ── Filtrar velocityMetrics ──
  let velocityMetrics = src.velocityMetrics ? { ...src.velocityMetrics } : null;
  if (velocityMetrics) {
    let velByChain = velocityMetrics.velocityByChain || [];
    if (f.chain) {
      velByChain = velByChain.filter(v => v.chain === f.chain);
    }
    if (f.division) {
      // Recalcular velocidad por cadena usando solo la division filtrada del ranking
      const activeDays = velocityMetrics.activeDays || 1;
      velByChain = Object.entries(rankingByChainStore).map(([ch, stores]) => {
        const totalUnits = stores.reduce((s, st) => s + st.units, 0);
        return { chain: ch, unitsPerDay: Math.round(totalUnits / activeDays), trend: 0 };
      }).filter(v => v.unitsPerDay > 0).sort((a, b) => b.unitsPerDay - a.unitsPerDay);
    }
    velocityMetrics = { ...velocityMetrics, velocityByChain: velByChain };
  }

  // ── Filtrar priceMetrics ──
  let priceMetrics = src.priceMetrics ? { ...src.priceMetrics } : null;
  if (priceMetrics && f.division) {
    priceMetrics = {
      ...priceMetrics,
      byDivision: (priceMetrics.byDivision || []).filter(d => d.division === f.division),
    };
  }

  // ── Filtrar stock OOS ──
  let stock = src.stock ? { ...src.stock } : null;
  if (stock) {
    if (f.division) {
      stock = {
        ...stock,
        oosByDivision: (stock.oosByDivision || []).filter(d => d.division === f.division),
        oosByChain: f.chain ? (stock.oosByChain || []).filter(d => d.chain === f.chain) : stock.oosByChain,
      };
    } else if (f.chain) {
      stock = {
        ...stock,
        oosByChain: (stock.oosByChain || []).filter(d => d.chain === f.chain),
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
  if (currentTab !== 'laboratorio') tabRendered['laboratorio'] = false;

  if (currentTab === 'command-center') {
    renderSelloutSection();
  } else if (currentTab === 'ranking') {
    renderRankingPage();
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
        y: { ...chartScaleY(), title: { display: true, text: "Venta CLP ($)", color: "#94a3b8" },
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
    options: { ...chartOptionsBar("und"), indexAxis: "y", scales: { x: chartScaleX("Unidades"), y: chartScaleY() } }
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
      plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", font: { size: 10 }, padding: 12 } } },
      scales: { x: chartScaleX(), y: { position: "left", ...chartScaleY("und"), title: { display: true, text: "Unidades", color: "#64748b", font: { size: 10 } } }, y1: { position: "right", title: { display: true, text: "CLP (Millones)", color: "#f97316", font: { size: 10 } }, ticks: { color: "#f97316", font: { size: 10 }, callback: v => "$" + v + "M" }, grid: { display: false } } }
    }
  });
}

// ── Stock & OOS (Tab 1) ─────────────────────────────────
function renderStockSection(data) {
  if (!data.stock || !data.stock.totalSKUs) return;
  const s = data.stock;
  animateCounter("oos-rate", 0, s.oosRate * 10, "");
  setTimeout(() => { const el = document.getElementById("oos-rate"); if (el) el.textContent = s.oosRate + "%"; }, 1300);
  animateCounter("oos-skus", 0, s.totalOOS, "");
  animateCounter("stock-total", 0, Math.round(s.totalStockUnits / 1000), "K");
  animateCounter("stock-skus", 0, s.totalSKUs, "");
  renderOOSByChainChart(s);
  renderOOSByLicenseChart(s);
}

function renderOOSByChainChart(stock) {
  const ctx = document.getElementById("chart-oos-chain");
  if (!ctx) return;
  if (chartInstances.oosChain) chartInstances.oosChain.destroy();
  const chains = [...stock.oosByChain].sort((a, b) => b.oosRate - a.oosRate);
  chartInstances.oosChain = new Chart(ctx, {
    type: "bar",
    data: {
      labels: chains.map(c => c.chain),
      datasets: [{ label: "% OOS", data: chains.map(c => c.oosRate), backgroundColor: chains.map(c => c.oosRate > 10 ? "rgba(248,113,113,0.7)" : c.oosRate > 5 ? "rgba(251,191,36,0.7)" : "rgba(52,211,153,0.7)"), borderRadius: 4 }]
    },
    options: { ...chartOptionsBar("%"), plugins: { legend: { display: false }, tooltip: { backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8", borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8, callbacks: { label: (ctx) => ` ${ctx.parsed.y}% quiebre`, afterLabel: (ctx) => { const c = chains[ctx.dataIndex]; return `${c.oosSKUs} de ${c.totalSKUs} SKUs`; } } } } }
  });
}

function renderOOSByLicenseChart(stock) {
  const ctx = document.getElementById("chart-oos-license");
  if (!ctx) return;
  if (chartInstances.oosLicense) chartInstances.oosLicense.destroy();
  const lics = stock.oosByLicense.slice(0, 20);
  chartInstances.oosLicense = new Chart(ctx, {
    type: "bar",
    data: { labels: lics.map(l => l.license), datasets: [{ label: "% OOS", data: lics.map(l => l.oosRate), backgroundColor: lics.map(l => l.oosRate > 15 ? "rgba(248,113,113,0.7)" : l.oosRate > 8 ? "rgba(251,191,36,0.7)" : "rgba(52,211,153,0.7)"), borderRadius: 4 }] },
    options: { ...chartOptionsBar("%"), indexAxis: "y", scales: { x: chartScaleX("% Quiebre"), y: chartScaleY() }, plugins: { legend: { display: false }, tooltip: { backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8", borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8, callbacks: { label: (ctx) => ` ${ctx.parsed.x}% quiebre`, afterLabel: (ctx) => `${lics[ctx.dataIndex].oosSKUs} de ${lics[ctx.dataIndex].totalSKUs} SKUs` } } } }
  });
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
function renderInsights(data) {
  const grid = document.getElementById("insights-grid");
  if (!grid || !data.insights) return;
  grid.innerHTML = "";
  data.insights.forEach(ins => {
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
  if (data.insights.length === 0) {
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
  chainSel.addEventListener("change", render);
  sortSel.addEventListener("change", render);
  render();
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
    options: { ...chartOptionsBar("und/dia"), plugins: { legend: { display: false }, tooltip: { backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8", borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8, callbacks: { label: (ctx) => ` ${vel[ctx.dataIndex].unitsPerDay} und/día`, afterLabel: (ctx) => { const t = vel[ctx.dataIndex].trend; return `Tendencia: ${t > 0 ? '+' : ''}${t}% ${t >= 0 ? '▲' : '▼'}`; } } } } }
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
  const ctx = document.getElementById("chart-oos-division");
  if (!ctx || !data.stock?.oosByDivision) return;
  if (chartInstances.oosDiv) chartInstances.oosDiv.destroy();
  const divs = data.stock.oosByDivision.filter(d => d.division !== 'Sin Clasificar').sort((a, b) => b.oosRate - a.oosRate);
  chartInstances.oosDiv = new Chart(ctx, {
    type: "bar",
    data: {
      labels: divs.map(d => d.division),
      datasets: [{
        label: "% OOS",
        data: divs.map(d => d.oosRate),
        backgroundColor: divs.map(d => d.oosRate > 10 ? "rgba(248,113,113,0.7)" : d.oosRate > 5 ? "rgba(251,191,36,0.7)" : "rgba(52,211,153,0.7)"),
        borderRadius: 4
      }]
    },
    options: { ...chartOptionsBar("%"), plugins: { legend: { display: false }, tooltip: { backgroundColor: "rgba(17,24,39,0.95)", titleColor: "#f1f5f9", bodyColor: "#94a3b8", borderColor: "rgba(148,163,184,0.2)", borderWidth: 1, padding: 12, cornerRadius: 8, callbacks: { label: (ctx) => ` ${ctx.parsed.y}% quiebre`, afterLabel: (ctx) => `${divs[ctx.dataIndex].oosSKUs} de ${divs[ctx.dataIndex].totalSKUs} SKUs` } } } }
  });
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
//  TAB 3: LABORATORIO
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
    html += `<td style="font-weight:700;color:var(--text-primary)">${store.units.toLocaleString("es-CL")}</td></tr>`;
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
    if (f.license && lic !== f.license) return false;
    if (f.division && licDivBreak[lic] && !licDivBreak[lic][f.division]) return false;
    return true;
  }
  function licFilterRatio(lic) {
    let ratio = 1;
    if (f.division && licDivBreak[lic]) {
      const total = Object.values(licDivBreak[lic]).reduce((s, v) => s + (v.pct || 0), 0) || 100;
      ratio *= (licDivBreak[lic][f.division]?.pct || 0) / total;
    }
    if (f.yearProduct && licYearBreak[lic]) {
      const total = Object.values(licYearBreak[lic]).reduce((s, v) => s + (v.units || 0), 0) || 1;
      ratio *= (licYearBreak[lic][f.yearProduct]?.units || 0) / total;
    }
    if (f.quarter && licQBreak[lic]) {
      const total = Object.values(licQBreak[lic]).reduce((s, v) => s + (v.units || 0), 0) || 1;
      ratio *= (licQBreak[lic][f.quarter]?.units || 0) / total;
    }
    if (f.temporada && licTempBreak[lic]) {
      const total = Object.values(licTempBreak[lic]).reduce((s, v) => s + (v.units || 0), 0) || 1;
      ratio *= (licTempBreak[lic][f.temporada]?.units || 0) / total;
    }
    return ratio;
  }

  // Get all licenses with totals, sorted desc — NO limit
  const licTotals = {};
  const chainTotals = {};
  const baseChains = f.chain ? [f.chain] : chains;
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
