// ============================================================
// TBC Sell Out Command Center - Data Layer
// ============================================================

const IMAGE_BASE_PATH = "../Ejemplos/campaign_results_report_2026-02-26_12.50.40/Imágenes campañas/";

// ── Campaign Tracking Base ──────────────────────────────────
const CAMPAIGNS = [
  {
    id: "CAM-2026-001",
    name: "Poleras Mueble de Walmart AC/DC - NASA",
    client: "Walmart",
    subChain: "Hiper Lider",
    channel: "Supermercados",
    startDate: "2026-02-25",
    endDate: "2026-03-31",
    businessType: "puntual",
    isMultiLicense: true,
    licenses: ["AC/DC", "NASA", "The Beatles"],
    status: "active",
    supervisor: "Eduardo Cabañas",
    totalTargetPDV: 12,
    stores: [
      {
        code: "0041",
        localId: "41Walmart",
        name: "Hiper Lider - Av. Américo Vespucio 1737, Huechuraba",
        shortName: "Huechuraba",
        region: "RM",
        regionFull: "13 - Metropolitana de Santiago",
        comuna: "Huechuraba",
        mallType: "Calle",
        storeType: "Tienda",
        gestor: "Danae Herrera",
        cobertura: true,
        implemented: true,
        implementationDate: "2026-02-25",
        graphicsArrived: true,
        photos: [
          "20521625022026a98a799c255b4_tbc_552.jpg",
          "215216250220263f90b1bfba9f4_tbc_552.jpg",
          "215216250220261d6cc0abe0bc4_tbc_552.jpg",
          "2152162502202650c5bd610ae24_tbc_552.jpg"
        ]
      },
      {
        code: "0518",
        localId: "518Walmart",
        name: "Hiper Lider - Av. Argentina 602, Valparaíso",
        shortName: "Valparaíso",
        region: "V",
        regionFull: "05 - Valparaíso",
        comuna: "Valparaíso",
        mallType: "Calle",
        storeType: "Tienda",
        gestor: "Carlos Donoso",
        cobertura: false,
        implemented: true,
        implementationDate: "2026-02-25",
        graphicsArrived: true,
        photos: [
          "43321525022026f44383c69abc4_tbc_271.jpg",
          "43321525022026018771576ad84_tbc_271.jpg",
          "433215250220260c20d38d2cbb4_tbc_271.jpg",
          "43321525022026e57fe0d973a04_tbc_271.jpg"
        ]
      },
      {
        code: "0089",
        localId: "89Walmart",
        name: "Hiper Lider - Talcahuano 9000, Hualpén",
        shortName: "C.U. Bio Bio (Hualpén)",
        region: "VIII",
        regionFull: "08 - Biobío",
        comuna: "Hualpén",
        mallType: "Mall",
        storeType: "Tienda",
        gestor: "Cristina Barrientos",
        cobertura: true,
        implemented: true,
        implementationDate: "2026-02-25",
        graphicsArrived: true,
        photos: [
          "261117250220267406fc8afbea4_tbc_597.jpg",
          "271117250220262c95292258104_tbc_597.jpg",
          "27111725022026e252949f5b134_tbc_597.jpg",
          "27111725022026bb43f2630dfd4_tbc_597.jpg"
        ]
      },
      {
        code: "0097",
        localId: "97Walmart",
        name: "Hiper Lider - Av. Las Condes 12916, Lo Barnechea",
        shortName: "Puente Nuevo",
        region: "RM",
        regionFull: "13 - Metropolitana de Santiago",
        comuna: "Lo Barnechea",
        mallType: "Calle",
        storeType: "Tienda",
        gestor: "Yudeizy Sanchez",
        cobertura: true,
        implemented: true,
        implementationDate: "2026-02-25",
        graphicsArrived: true,
        photos: [
          "1957162502202682b6a7fff3764_tbc_187.jpg",
          "20571625022026e22d0d8c77c94_tbc_187.jpg",
          "20571625022026e207b8d1f5a84_tbc_187.jpg",
          "20571625022026ac94d657478c4_tbc_187.jpg"
        ]
      }
    ]
  },
  {
    id: "CAM-2026-002",
    name: "Reposición Continua NASA - Hites",
    client: "Hites",
    subChain: "Hites",
    channel: "Tiendas por Departamento",
    startDate: "2026-01-15",
    endDate: "2026-12-31",
    businessType: "continuidad",
    isMultiLicense: false,
    licenses: ["NASA"],
    status: "active",
    supervisor: "Eduardo Cabañas",
    totalTargetPDV: 18,
    stores: generateMockStores(15, "Hites", [
      { region: "RM", comunas: ["Santiago Centro", "Providencia", "Las Condes", "Maipú", "La Florida", "Puente Alto"] },
      { region: "V", comunas: ["Viña del Mar", "Valparaíso"] },
      { region: "VIII", comunas: ["Concepción", "Talcahuano"] },
      { region: "IX", comunas: ["Temuco"] },
      { region: "X", comunas: ["Puerto Montt"] }
    ], ["María López", "Pedro Soto", "Andrea Muñoz", "Juan Carrasco", "Camila Reyes"])
  },
  {
    id: "CAM-2026-003",
    name: "Back to School - Multi Licencia París",
    client: "Paris",
    subChain: "Paris",
    channel: "Tiendas por Departamento",
    startDate: "2026-02-01",
    endDate: "2026-03-15",
    businessType: "puntual",
    isMultiLicense: true,
    licenses: ["Snoopy", "Disney Princesses", "Marvel"],
    status: "active",
    supervisor: "Carolina Vega",
    totalTargetPDV: 22,
    stores: generateMockStores(17, "Paris", [
      { region: "RM", comunas: ["Santiago Centro", "Providencia", "Las Condes", "Vitacura", "Lo Barnechea", "Maipú", "La Florida"] },
      { region: "V", comunas: ["Viña del Mar", "Valparaíso"] },
      { region: "IV", comunas: ["La Serena"] },
      { region: "VIII", comunas: ["Concepción"] },
      { region: "IX", comunas: ["Temuco"] }
    ], ["Sofía Martínez", "Diego Ramírez", "Valentina Torres", "Felipe Rojas"])
  },
  {
    id: "CAM-2026-004",
    name: "Festival Verano Beatles - Ripley",
    client: "Ripley",
    subChain: "Ripley",
    channel: "Tiendas por Departamento",
    startDate: "2026-01-10",
    endDate: "2026-02-20",
    businessType: "puntual",
    isMultiLicense: false,
    licenses: ["The Beatles"],
    status: "completed",
    supervisor: "Carolina Vega",
    totalTargetPDV: 10,
    stores: generateMockStores(10, "Ripley", [
      { region: "RM", comunas: ["Santiago Centro", "Providencia", "Las Condes", "Maipú", "La Florida"] },
      { region: "V", comunas: ["Viña del Mar"] },
      { region: "VIII", comunas: ["Concepción"] }
    ], ["Andrés Silva", "Carla Moreno", "Tomás Fuentes"])
  }
];

// ── License Catalog ─────────────────────────────────────────
const LICENSE_CATALOG = [
  { id: "LIC-001", name: "NASA", type: "Marca", category: "Ciencia" },
  { id: "LIC-002", name: "AC/DC", type: "Banda", category: "Música" },
  { id: "LIC-003", name: "The Beatles", type: "Banda", category: "Música" },
  { id: "LIC-004", name: "Snoopy", type: "Personaje", category: "Entretenimiento" },
  { id: "LIC-005", name: "Disney Princesses", type: "Colección", category: "Entretenimiento" },
  { id: "LIC-006", name: "Marvel", type: "Colección", category: "Entretenimiento" }
];

// ── Mock Sell-Out Data (until API connected) ────────────────
const MOCK_SELLOUT = {
  daily: generateMockDailySales(),
  byStore: [
    { store: "Huechuraba", units: 342, clp: 5472000, prevUnits: 180 },
    { store: "Valparaíso", units: 215, clp: 3440000, prevUnits: 145 },
    { store: "C.U. Bio Bio", units: 287, clp: 4592000, prevUnits: 160 },
    { store: "Puente Nuevo", units: 410, clp: 6560000, prevUnits: 220 }
  ],
  byLicense: [
    { license: "NASA", units: 520, clp: 8320000, color: "#6366f1" },
    { license: "AC/DC", units: 380, clp: 6080000, color: "#f97316" },
    { license: "The Beatles", units: 354, clp: 5664000, color: "#22c55e" }
  ],
  byGestor: [
    { gestor: "Danae Herrera", units: 342, clp: 5472000, stores: 1, efficiency: 95 },
    { gestor: "Carlos Donoso", units: 215, clp: 3440000, stores: 1, efficiency: 72 },
    { gestor: "Cristina Barrientos", units: 287, clp: 4592000, stores: 1, efficiency: 88 },
    { gestor: "Yudeizy Sanchez", units: 410, clp: 6560000, stores: 1, efficiency: 97 }
  ]
};

// ── Chain Data Freshness ────────────────────────────────────
// NOTE: Now computed dynamically from REAL_SELLOUT._meta.chainFreshness
// This mock is kept only as fallback if real_data.js is not loaded
const CHAIN_FRESHNESS = [];

// ── Helper Functions ────────────────────────────────────────
function generateMockStores(count, chain, regionData, gestors) {
  const stores = [];
  let idx = 0;
  for (const rd of regionData) {
    for (const comuna of rd.comunas) {
      if (idx >= count) break;
      const implemented = Math.random() > 0.15;
      stores.push({
        code: String(1000 + idx).padStart(4, "0"),
        localId: `${1000 + idx}${chain}`,
        name: `${chain} - ${comuna}`,
        shortName: comuna,
        region: rd.region,
        regionFull: rd.region,
        comuna: comuna,
        mallType: Math.random() > 0.5 ? "Mall" : "Calle",
        storeType: "Tienda",
        gestor: gestors[idx % gestors.length],
        cobertura: implemented ? Math.random() > 0.2 : false,
        implemented: implemented,
        implementationDate: implemented ? randomDate("2026-02-01", "2026-02-25") : null,
        graphicsArrived: implemented ? Math.random() > 0.1 : false,
        photos: []
      });
      idx++;
    }
  }
  return stores;
}

function randomDate(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const d = new Date(s.getTime() + Math.random() * (e.getTime() - s.getTime()));
  return d.toISOString().split("T")[0];
}

function generateMockDailySales() {
  const data = [];
  const startDate = new Date("2026-02-10");
  const licenses = ["NASA", "AC/DC", "The Beatles"];
  for (let i = 0; i < 17; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const baseMult = isWeekend ? 1.6 : 1;
    const trend = 1 + (i * 0.03);
    for (const lic of licenses) {
      const baseUnits = lic === "NASA" ? 35 : lic === "AC/DC" ? 25 : 22;
      const units = Math.round(baseUnits * baseMult * trend * (0.8 + Math.random() * 0.4));
      data.push({
        date: dateStr,
        license: lic,
        units: units,
        clp: units * 16000
      });
    }
  }
  return data;
}

// ── Computed Aggregates ─────────────────────────────────────
function getCampaignStats(campaign) {
  const implemented = campaign.stores.filter(s => s.implemented).length;
  const covered = campaign.stores.filter(s => s.cobertura).length;
  const graphicsOk = campaign.stores.filter(s => s.graphicsArrived).length;
  const withPhotos = campaign.stores.filter(s => s.photos && s.photos.length > 0).length;

  const dates = campaign.stores
    .filter(s => s.implementationDate)
    .map(s => new Date(s.implementationDate))
    .sort((a, b) => a - b);

  let t2m = null;
  if (dates.length > 0) {
    const start = new Date(campaign.startDate);
    const threshold = Math.ceil(campaign.totalTargetPDV * 0.9);
    if (implemented >= threshold && dates.length >= threshold) {
      const ninetyPctDate = dates[threshold - 1];
      t2m = Math.ceil((ninetyPctDate - start) / (1000 * 60 * 60 * 24));
    }
  }

  return {
    implemented,
    total: campaign.totalTargetPDV,
    pctImplementation: Math.round((implemented / campaign.totalTargetPDV) * 100),
    covered,
    pctCoverage: campaign.stores.length > 0 ? Math.round((covered / campaign.stores.length) * 100) : 0,
    graphicsOk,
    pctGraphics: implemented > 0 ? Math.round((graphicsOk / implemented) * 100) : 0,
    withPhotos,
    timeToMarket: t2m,
    daysActive: Math.ceil((new Date() - new Date(campaign.startDate)) / (1000 * 60 * 60 * 24)),
    daysRemaining: Math.max(0, Math.ceil((new Date(campaign.endDate) - new Date()) / (1000 * 60 * 60 * 24)))
  };
}

// ── Global Stats ────────────────────────────────────────────
function getGlobalStats() {
  const activeCampaigns = CAMPAIGNS.filter(c => c.status === "active");
  let totalTarget = 0, totalImplemented = 0, totalCovered = 0, totalStores = 0;
  activeCampaigns.forEach(c => {
    const stats = getCampaignStats(c);
    totalTarget += stats.total;
    totalImplemented += stats.implemented;
    totalCovered += stats.covered;
    totalStores += c.stores.length;
  });
  return {
    activeCampaigns: activeCampaigns.length,
    totalCampaigns: CAMPAIGNS.length,
    totalTarget,
    totalImplemented,
    pctImplementation: totalTarget > 0 ? Math.round((totalImplemented / totalTarget) * 100) : 0,
    totalCovered,
    pctCoverage: totalStores > 0 ? Math.round((totalCovered / totalStores) * 100) : 0,
    uniqueLicenses: [...new Set(CAMPAIGNS.flatMap(c => c.licenses))].length,
    uniqueClients: [...new Set(CAMPAIGNS.map(c => c.client))].length
  };
}
