"""
============================================================
Procesa datos de SQLite y genera real_data.js para el dashboard
============================================================
Uso:
  python process_for_dashboard.py              # Default: año 2026
  python process_for_dashboard.py --year 2026  # Filtrar por año
  python process_for_dashboard.py --days 30    # Últimos N días
"""

import json
import os
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DASHBOARD_DIR = os.path.join(BASE_DIR, "dashboard")
import datetime as _dt
_CURRENT_YEAR = _dt.datetime.now().year
# DB vive fuera de Google Drive para evitar problemas de sincronizacion
_DB_DIR = r"C:\TBC-Data"
DB_PATH = os.path.join(_DB_DIR, f"sellout_{_CURRENT_YEAR}.db")
# Fallback a data/ si C:\TBC-Data no existe
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.join(DATA_DIR, f"sellout_{_CURRENT_YEAR}.db")
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.join(DATA_DIR, "sellout.db")

# ── Normalización de divisiones ────────────────────────────

DIVISION_MAP = {
    'Vestuario Infantil': 'Vestuario Infantil',
    'Ropa Interior': 'Ropa Interior',
    'Calzado': 'Calzado',
    'Vestuario Adulto': 'Vestuario Adulto',
    'Accesorios': 'Accesorios y Otros',
    'Jugueteria': 'Accesorios y Otros',
    'JUGUETERIA': 'Accesorios y Otros',
    'BAGS & LUGGAGE': 'Accesorios y Otros',
    'TECNOLOGIA': 'Accesorios y Otros',
    'No Definido': 'Sin Clasificar',
}

DIVISION_COLORS = {
    'Vestuario Infantil': '#6366f1',
    'Ropa Interior': '#34d399',
    'Calzado': '#f97316',
    'Vestuario Adulto': '#eab308',
    'Accesorios y Otros': '#ec4899',
}

LICENSE_COLORS = [
    "#6366f1", "#f97316", "#22c55e", "#eab308", "#ef4444",
    "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#3b82f6",
    "#84cc16", "#06b6d4", "#d946ef", "#f43f5e", "#10b981"
]


def normalize_division(raw):
    return DIVISION_MAP.get(raw, 'Sin Clasificar')


def parse_temporada(temp):
    """Parse temporada like 'Q425' → (quarter='Q4', year='2025') or 'PV22' → (None, '2022')."""
    if not temp or len(temp) < 3:
        return None, None
    import re
    # Q-format: Q{quarter}{year2d} e.g. Q425, Q126
    m = re.match(r'^Q(\d)(\d{2})$', temp)
    if m:
        return f"Q{m.group(1)}", f"20{m.group(2)}"
    # Season format: PV22, OI21, TT25, BTS21
    m = re.match(r'^(?:PV|OI|TT|BTS)(\d{2})$', temp)
    if m:
        return None, f"20{m.group(1)}"
    # Q/YYYY format: Q2/2023
    m = re.match(r'^Q(\d)/(\d{4})$', temp)
    if m:
        return f"Q{m.group(1)}", m.group(2)
    return None, None


def parse_date_iv(date_str):
    """'dd-mm-yyyy' → 'yyyy-mm-dd'"""
    if not date_str:
        return None
    parts = date_str.strip().split('-')
    if len(parts) == 3 and len(parts[0]) <= 2:
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    return date_str


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def load_sales(year=None, days_back=None):
    """Carga ventas desde SQLite con filtro opcional."""
    conn = get_db()
    query = "SELECT * FROM sales"
    params = []

    if days_back:
        cutoff = (datetime.now() - timedelta(days=days_back)).strftime('%Y-%m-%d')
        query += " WHERE fecha >= ?"
        params.append(cutoff)
    elif year:
        query += " WHERE fecha LIKE ?"
        params.append(f"{year}-%")

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def load_stock():
    """Carga stock desde SQLite."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM stock").fetchall()
    conn.close()
    return [dict(r) for r in rows] if rows else None


def load_product_divisions():
    """Carga mapa código interno → división desde master_products.json."""
    path = os.path.join(DATA_DIR, "master_products.json")
    if not os.path.exists(path):
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    lookup = {}
    for r in data:
        code = r.get('Código Interno', '') or r.get('Codigo Producto Interno', '')
        div = r.get('División', '')
        if code and div:
            lookup[code] = normalize_division(div)
    return lookup


def process(year=2026, days_back=None):
    print(f"Cargando datos (año={year}, days_back={days_back})...")
    sales_raw = load_sales(year=year, days_back=days_back)
    print(f"  Ventas: {len(sales_raw)} registros")

    # Pre-procesar: normalizar fechas, divisiones y temporadas
    sales = []
    for r in sales_raw:
        r['_date'] = parse_date_iv(r.get('fecha', ''))
        r['_division'] = normalize_division(r.get('division', ''))
        r['_units'] = r.get('unidades', 0) or 0
        r['_clp'] = r.get('ventas_b2b', 0) or 0
        r['_pvp'] = r.get('valores_pvp', 0) or 0
        r['_costos'] = r.get('costos_b2b', 0) or 0
        q, y = parse_temporada(r.get('temporada', ''))
        r['_quarter'] = q
        r['_year_product'] = y
        r['_temporada'] = r.get('temporada', '') or ''
        r['_clase'] = r.get('clase', '') or ''
        r['_subclase'] = r.get('subclase', '') or ''
        r['_categoria'] = r.get('categoria', '') or ''
        sales.append(r)

    dates_sorted = sorted(set(r['_date'] for r in sales if r['_date']))

    # ── 1. Venta diaria por licencia (top 15) ────────────
    license_totals = defaultdict(float)
    for r in sales:
        license_totals[r.get('propiedad', 'Sin Licencia')] += r['_units']

    top_licenses = sorted(license_totals.items(), key=lambda x: -x[1])[:15]
    top_license_names = {l[0] for l in top_licenses}

    daily_by_license = defaultdict(lambda: defaultdict(lambda: {'units': 0, 'clp': 0}))
    for r in sales:
        prop = r.get('propiedad', 'Sin Licencia')
        if prop not in top_license_names:
            continue
        daily_by_license[r['_date']][prop]['units'] += r['_units']
        daily_by_license[r['_date']][prop]['clp'] += r['_clp']

    daily_sales = []
    for date in dates_sorted:
        for lic, _ in top_licenses:
            d = daily_by_license[date].get(lic, {'units': 0, 'clp': 0})
            daily_sales.append({
                "date": date, "license": lic,
                "units": round(d['units']), "clp": round(d['clp'])
            })

    # ── 2. Venta por licencia (acumulado top 15) ─────────
    by_license = []
    for i, (lic, units) in enumerate(top_licenses):
        clp = sum(r['_clp'] for r in sales if r.get('propiedad') == lic)
        by_license.append({
            "license": lic, "units": round(units), "clp": round(clp),
            "color": LICENSE_COLORS[i % len(LICENSE_COLORS)]
        })

    # ── 3. Venta por cadena ──────────────────────────────
    chain_agg = defaultdict(lambda: {"units": 0, "clp": 0})
    for r in sales:
        chain_agg[r.get('sub_cadena', 'Otro')]["units"] += r['_units']
        chain_agg[r.get('sub_cadena', 'Otro')]["clp"] += r['_clp']

    chain_sales = sorted(
        [{"chain": c, "units": round(d["units"]), "clp": round(d["clp"])}
         for c, d in chain_agg.items()],
        key=lambda x: -x["units"]
    )

    # ── 4. Venta por tienda (todas) ────────────────────────
    store_agg = defaultdict(lambda: {"units": 0, "clp": 0, "chain": "", "region": ""})
    for r in sales:
        key = r.get('nombre_local', '') or r.get('local', '')
        store_agg[key]["units"] += r['_units']
        store_agg[key]["clp"] += r['_clp']
        store_agg[key]["chain"] = r.get('sub_cadena', '')
        store_agg[key]["region"] = r.get('region', '')

    store_sales = sorted(
        [{"store": k, "units": round(v["units"]), "clp": round(v["clp"]),
          "chain": v["chain"], "region": v["region"]}
         for k, v in store_agg.items()],
        key=lambda x: -x["units"]
    )

    # ── 5. KPIs globales ─────────────────────────────────
    total_units = sum(r['_units'] for r in sales)
    total_clp = sum(r['_clp'] for r in sales)
    total_pvp = sum(r['_pvp'] for r in sales)
    unique_stores = len(set(r.get('local', '') for r in sales))
    unique_licenses = len(set(r.get('propiedad', '') for r in sales))
    unique_chains = len(set(r.get('sub_cadena', '') for r in sales))
    num_days = len(dates_sorted)

    kpis = {
        "totalUnits": round(total_units),
        "totalCLP": round(total_clp),
        "totalPVP": round(total_pvp),
        "avgUnitsPerStore": round(total_units / unique_stores) if unique_stores else 0,
        "avgUnitsPerDay": round(total_units / num_days) if num_days else 0,
        "uniqueStores": unique_stores,
        "uniqueLicenses": unique_licenses,
        "uniqueChains": unique_chains,
        "numDays": num_days,
        "dateRange": {"from": dates_sorted[0], "to": dates_sorted[-1]} if dates_sorted else {}
    }

    # ── 6. Venta por región ──────────────────────────────
    region_agg = defaultdict(lambda: {"units": 0, "clp": 0})
    for r in sales:
        region_agg[r.get('region', 'Sin Región')]["units"] += r['_units']
        region_agg[r.get('region', 'Sin Región')]["clp"] += r['_clp']

    region_sales = sorted(
        [{"region": k, "units": round(v["units"]), "clp": round(v["clp"])}
         for k, v in region_agg.items()],
        key=lambda x: -x["units"]
    )

    # ── 7. Venta diaria total ────────────────────────────
    daily_agg = defaultdict(lambda: {"units": 0, "clp": 0})
    for r in sales:
        daily_agg[r['_date']]["units"] += r['_units']
        daily_agg[r['_date']]["clp"] += r['_clp']

    daily_totals = [
        {"date": d, "units": round(daily_agg[d]["units"]), "clp": round(daily_agg[d]["clp"])}
        for d in dates_sorted
    ]

    # ── 7b. Venta diaria por cadena ──────────────────────
    daily_chain_agg = defaultdict(lambda: defaultdict(lambda: {"units": 0, "clp": 0}))
    for r in sales:
        daily_chain_agg[r['_date']][r.get('sub_cadena', 'Otro')]["units"] += r['_units']
        daily_chain_agg[r['_date']][r.get('sub_cadena', 'Otro')]["clp"] += r['_clp']

    daily_by_chain = []
    for date in dates_sorted:
        for chain, vals in daily_chain_agg[date].items():
            daily_by_chain.append({
                "date": date, "chain": chain,
                "units": round(vals["units"]), "clp": round(vals["clp"])
            })

    # ── 8. Stock y OOS ───────────────────────────────────
    stock_data = load_stock()
    stock_output = {}
    product_divs = load_product_divisions()

    if stock_data:
        print(f"  Stock: {len(stock_data)} registros")

        oos_by_chain = defaultdict(lambda: {"total": 0, "oos": 0})
        oos_by_license = defaultdict(lambda: {"total": 0, "oos": 0})
        oos_by_division = defaultdict(lambda: {"total": 0, "oos": 0})

        total_stock_units = 0
        total_oos = 0

        for r in stock_data:
            chain = r.get('sub_cadena', '')
            lic = r.get('propiedad', '')
            code = r.get('codigo_interno', '')
            quiebre = r.get('quiebres', 0) or 0
            stock_units = r.get('stock_total', 0) or 0

            div = product_divs.get(code, 'Sin Clasificar')

            oos_by_chain[chain]["total"] += 1
            oos_by_license[lic]["total"] += 1
            oos_by_division[div]["total"] += 1
            total_stock_units += stock_units

            if quiebre > 0:
                oos_by_chain[chain]["oos"] += 1
                oos_by_license[lic]["oos"] += 1
                oos_by_division[div]["oos"] += 1
                total_oos += 1

        total_skus = len(stock_data)

        def make_oos_list(agg, key_name, min_skus=0, limit=None):
            result = sorted([
                {key_name: k, "totalSKUs": d["total"], "oosSKUs": d["oos"],
                 "oosRate": round(d["oos"] / d["total"] * 100, 1) if d["total"] > 0 else 0}
                for k, d in agg.items() if d["total"] >= min_skus
            ], key=lambda x: -x["oosRate"])
            return result[:limit] if limit else result

        stock_output = {
            "totalSKUs": total_skus,
            "totalOOS": total_oos,
            "oosRate": round(total_oos / total_skus * 100, 1) if total_skus > 0 else 0,
            "totalStockUnits": round(total_stock_units),
            "oosByChain": make_oos_list(oos_by_chain, "chain"),
            "oosByLicense": make_oos_list(oos_by_license, "license", min_skus=10, limit=20),
            "oosByDivision": make_oos_list(oos_by_division, "division"),
        }

        kpis["oosRate"] = stock_output["oosRate"]
        kpis["totalStockUnits"] = stock_output["totalStockUnits"]
    else:
        print("  Stock: no disponible")

    # ══════════════════════════════════════════════════════
    #  NUEVOS BLOQUES
    # ══════════════════════════════════════════════════════

    # ── 9. Venta por División ────────────────────────────
    div_agg = defaultdict(lambda: {"units": 0, "clp": 0, "pvp": 0, "stores": set()})
    for r in sales:
        div = r['_division']
        div_agg[div]["units"] += r['_units']
        div_agg[div]["clp"] += r['_clp']
        div_agg[div]["pvp"] += r['_pvp']
        div_agg[div]["stores"].add(r.get('local', ''))

    by_division = sorted([
        {
            "division": div,
            "units": round(d["units"]),
            "clp": round(d["clp"]),
            "pvp": round(d["pvp"]),
            "pctOfTotal": round(d["units"] / total_units * 100, 1) if total_units > 0 else 0,
            "avgPrice": round(d["clp"] / d["units"]) if d["units"] > 0 else 0,
            "storeCount": len(d["stores"]),
            "color": DIVISION_COLORS.get(div, '#94a3b8'),
        }
        for div, d in div_agg.items() if div != 'Sin Clasificar'
    ], key=lambda x: -x["units"])

    # ── 10. Venta diaria por División ────────────────────
    daily_div = defaultdict(lambda: defaultdict(lambda: {"units": 0, "clp": 0}))
    for r in sales:
        if r['_division'] == 'Sin Clasificar':
            continue
        daily_div[r['_date']][r['_division']]["units"] += r['_units']
        daily_div[r['_date']][r['_division']]["clp"] += r['_clp']

    division_names = [d["division"] for d in by_division]
    by_division_daily = []
    for date in dates_sorted:
        for div in division_names:
            d = daily_div[date].get(div, {"units": 0, "clp": 0})
            by_division_daily.append({
                "date": date, "division": div,
                "units": round(d["units"]), "clp": round(d["clp"])
            })

    # ── 11. Ranking por Cadena → Tienda (con división) ───
    chain_store_div = defaultdict(lambda: defaultdict(lambda: {
        "units": 0, "clp": 0, "costos": 0, "region": "", "local": "",
        "byDiv": defaultdict(lambda: {"units": 0, "clp": 0, "costos": 0})
    }))
    for r in sales:
        chain = r.get('sub_cadena', '')
        store = r.get('nombre_local', '') or r.get('local', '')
        chain_store_div[chain][store]["units"] += r['_units']
        chain_store_div[chain][store]["clp"] += r['_clp']
        chain_store_div[chain][store]["costos"] += r['_costos']
        chain_store_div[chain][store]["region"] = r.get('region', '')
        chain_store_div[chain][store]["local"] = r.get('local', '')
        div = r['_division']
        if div != 'Sin Clasificar':
            chain_store_div[chain][store]["byDiv"][div]["units"] += r['_units']
            chain_store_div[chain][store]["byDiv"][div]["clp"] += r['_clp']
            chain_store_div[chain][store]["byDiv"][div]["costos"] += r['_costos']

    # Stock por tienda (para ranking) — usar fecha más reciente, solo stock LOCAL
    # Build SKU→division map from sales for stock division breakdown
    sku_division_map = {}
    for r in sales:
        ci = r.get('codigo_interno', '')
        div = r.get('_division', 'Sin Clasificar')
        if ci and div != 'Sin Clasificar':
            sku_division_map[ci] = div

    store_stock_map = {}
    latest_stock_date = None
    if stock_data:
        stock_dates_set = set(r.get('fecha', '') for r in stock_data if r.get('fecha'))
        latest_stock_date = max(stock_dates_set) if stock_dates_set else None
        if latest_stock_date:
            for r in stock_data:
                if r.get('fecha', '') != latest_stock_date:
                    continue
                chain = r.get('sub_cadena', '')
                sname = r.get('nombre_local', '') or r.get('local', '')
                key = (chain, sname)
                if key not in store_stock_map:
                    store_stock_map[key] = {"stock_local": 0, "byDiv": defaultdict(float)}
                sl = r.get('stock_local', 0) or 0
                store_stock_map[key]["stock_local"] += sl
                # Map stock to division via SKU
                ci = r.get('codigo_interno', '')
                div = sku_division_map.get(ci)
                if div:
                    store_stock_map[key]["byDiv"][div] += sl

    # Venta últimas 4 semanas por tienda (para Sem. Stock)
    # Calcular última fecha de venta por cadena
    chain_last_date = {}
    for r in sales:
        chain = r.get('sub_cadena', '')
        fecha = r.get('fecha', '')
        if fecha and (chain not in chain_last_date or fecha > chain_last_date[chain]):
            chain_last_date[chain] = fecha

    # Ventas por tienda en últimas 4 semanas desde última fecha de cada cadena
    store_sales_4w = defaultdict(lambda: {"units": 0})
    for r in sales:
        chain = r.get('sub_cadena', '')
        fecha = r.get('fecha', '')
        last = chain_last_date.get(chain, '')
        if not last or not fecha:
            continue
        # Calcular diferencia en días
        try:
            d_fecha = datetime.strptime(fecha, '%Y-%m-%d')
            d_last = datetime.strptime(last, '%Y-%m-%d')
            if (d_last - d_fecha).days <= 28:
                store = r.get('nombre_local', '') or r.get('local', '')
                store_sales_4w[(chain, store)]["units"] += r['_units']
        except (ValueError, TypeError):
            continue

    # Semanas en el período para cálculo de velocidad (gráficos)
    num_weeks_period = max(len(dates_sorted) / 7, 1)

    ranking_by_chain_store = {}
    for chain, stores in chain_store_div.items():
        store_list = []
        for name, d in stores.items():
            margin = round((d["clp"] - d["costos"]) / d["clp"] * 100, 1) if d["clp"] > 0 else 0
            stock_info = store_stock_map.get((chain, name))
            stock_units = round(stock_info["stock_local"]) if stock_info else 0
            # Sem. Stock = stock local / (venta últimas 4 sem / 4)
            sales_4w = store_sales_4w.get((chain, name), {}).get("units", 0)
            weekly_avg_4w = sales_4w / 4 if sales_4w > 0 else 0
            weeks_stock = round(stock_units / weekly_avg_4w, 1) if weekly_avg_4w > 0 else 0
            # Stock by division for this store
            stock_by_div = {}
            if stock_info:
                for div, sv in stock_info.get("byDiv", {}).items():
                    stock_by_div[div] = round(sv)
            store_list.append({
                "store": name,
                "storeCode": d["local"],
                "region": d["region"],
                "units": round(d["units"]),
                "clp": round(d["clp"]),
                "costos": round(d["costos"]),
                "margin": margin,
                "stockUnits": stock_units,
                "weeksOfStock": weeks_stock,
                "byDivision": {
                    div: {"units": round(dd["units"]), "clp": round(dd["clp"]), "costos": round(dd["costos"]),
                           "stock": stock_by_div.get(div, 0)}
                    for div, dd in d["byDiv"].items()
                }
            })
        store_list.sort(key=lambda x: -x["units"])
        ranking_by_chain_store[chain] = store_list

    # ── 11b. Ranking por Producto (codigo_interno) ───────
    product_agg = defaultdict(lambda: {
        "units": 0, "clp": 0, "costos": 0, "desc": "", "license": "",
        "division": "", "temporada": "", "clase": "", "subclase": "", "categoria": "",
        "byChain": defaultdict(lambda: {"units": 0, "clp": 0})
    })
    for r in sales:
        ci = r.get('codigo_interno', '')
        if not ci:
            continue
        p = product_agg[ci]
        p["units"] += r['_units']
        p["clp"] += r['_clp']
        p["costos"] += r['_costos']
        p["desc"] = r.get('descripcion', '') or p["desc"]
        p["license"] = r.get('propiedad', '') or p["license"]
        p["division"] = r.get('_division', '') or p["division"]
        p["temporada"] = r.get('temporada', '') or p["temporada"]
        p["clase"] = r['_clase'] or p["clase"]
        p["subclase"] = r['_subclase'] or p["subclase"]
        p["categoria"] = r['_categoria'] or p["categoria"]
        chain = r.get('sub_cadena', '')
        if chain:
            p["byChain"][chain]["units"] += r['_units']
            p["byChain"][chain]["clp"] += r['_clp']

    # Stock by product (latest date)
    product_stock = defaultdict(float)
    if stock_data and latest_stock_date:
        for r in stock_data:
            if r.get('fecha', '') != latest_stock_date:
                continue
            ci = r.get('codigo_interno', '')
            if ci:
                product_stock[ci] += (r.get('stock_local', 0) or 0)

    # Build top 200 products by units
    sorted_products = sorted(product_agg.items(), key=lambda x: -x[1]["units"])[:200]
    ranking_by_product = []
    for ci, p in sorted_products:
        margin = round((p["clp"] - p["costos"]) / p["clp"] * 100, 1) if p["clp"] > 0 else 0
        stock = round(product_stock.get(ci, 0))
        ranking_by_product.append({
            "codigo": ci,
            "descripcion": p["desc"],
            "license": p["license"],
            "division": p["division"],
            "temporada": p["temporada"],
            "clase": p["clase"],
            "subclase": p["subclase"],
            "categoria": p["categoria"],
            "units": round(p["units"]),
            "clp": round(p["clp"]),
            "costos": round(p["costos"]),
            "margin": margin,
            "stockUnits": stock,
            "byChain": {ch: {"units": round(d["units"]), "clp": round(d["clp"])}
                        for ch, d in p["byChain"].items()}
        })

    # ── 11c. Venta semanal por tienda (últimas 4 semanas) ──
    # Determine ISO week numbers from dates_sorted
    from datetime import date as _date_type
    store_week_agg = defaultdict(lambda: defaultdict(lambda: {"clp": 0, "units": 0}))
    week_labels = set()
    for r in sales:
        d = r['_date']
        if not d:
            continue
        try:
            dt = datetime.strptime(d, '%Y-%m-%d')
            iso_year, iso_week, _ = dt.isocalendar()
            wk = f"{iso_week}{iso_year}"  # e.g. "72026"
            wk_label = f"SEM {iso_week:02d}"
        except (ValueError, TypeError):
            continue
        chain = r.get('sub_cadena', '')
        store = r.get('nombre_local', '') or r.get('local', '')
        store_week_agg[(chain, store)][wk]["clp"] += r['_clp']
        store_week_agg[(chain, store)][wk]["units"] += r['_units']
        week_labels.add((iso_week, iso_year, wk))

    # Get last 4 weeks
    sorted_weeks = sorted(week_labels, key=lambda x: (x[1], x[0]))
    last_4_weeks = sorted_weeks[-4:] if len(sorted_weeks) >= 4 else sorted_weeks
    last_4_wk_keys = [w[2] for w in last_4_weeks]
    last_4_wk_labels = [f"SEM {w[0]:02d}" for w in last_4_weeks]

    weekly_by_store = []
    for (chain, store), weeks_data in store_week_agg.items():
        total_clp = sum(weeks_data[wk]["clp"] for wk in last_4_wk_keys)
        if total_clp <= 0:
            continue
        weeks_out = {}
        for wk in last_4_wk_keys:
            d = weeks_data.get(wk, {"clp": 0, "units": 0})
            weeks_out[wk] = {"clp": round(d["clp"]), "units": round(d["units"])}
        weekly_by_store.append({
            "store": store, "chain": chain,
            "weeks": weeks_out, "totalClp": round(total_clp),
            "totalUnits": round(sum(weeks_data[wk]["units"] for wk in last_4_wk_keys))
        })
    weekly_by_store.sort(key=lambda x: -x["totalClp"])
    weekly_by_store = weekly_by_store[:100]  # Top 100 stores

    # Week totals for bar chart
    week_totals = []
    for i, wk in enumerate(last_4_wk_keys):
        total = sum(store_week_agg[k][wk]["clp"] for k in store_week_agg)
        week_totals.append({"week": wk, "label": last_4_wk_labels[i], "clp": round(total)})

    weekly_store_data = {
        "stores": weekly_by_store,
        "weekKeys": last_4_wk_keys,
        "weekLabels": last_4_wk_labels,
        "weekTotals": week_totals,
    }

    print(f"  Weekly by store: {len(weekly_by_store)} tiendas, {len(last_4_wk_keys)} semanas")

    # ── 11d. Resumen por Licencia (todas) ────────────────
    license_summary = []
    # Aggregate all licenses (not just top 15)
    lic_full_agg = defaultdict(lambda: {"units": 0, "clp": 0, "costos": 0})
    for r in sales:
        lic = r.get('propiedad', 'Sin Licencia')
        lic_full_agg[lic]["units"] += r['_units']
        lic_full_agg[lic]["clp"] += r['_clp']
        lic_full_agg[lic]["costos"] += r['_costos']

    # Stock by license (latest date)
    lic_stock = defaultdict(float)
    if stock_data and latest_stock_date:
        for r in stock_data:
            if r.get('fecha', '') != latest_stock_date:
                continue
            lic = r.get('propiedad', '')
            sl = r.get('stock_local', 0) or 0
            if lic:
                lic_stock[lic] += sl

    for lic, d in sorted(lic_full_agg.items(), key=lambda x: -x[1]["units"]):
        margin = round((d["clp"] - d["costos"]) / d["clp"] * 100, 1) if d["clp"] > 0 else 0
        pct = round(d["units"] / total_units * 100, 2) if total_units > 0 else 0
        license_summary.append({
            "license": lic,
            "units": round(d["units"]),
            "clp": round(d["clp"]),
            "costos": round(d["costos"]),
            "margin": margin,
            "pctUnits": pct,
            "stockUnits": round(lic_stock.get(lic, 0)),
        })

    print(f"  License summary: {len(license_summary)} licencias")

    # ── 12. Mix de División por Cadena ───────────────────
    chain_div_agg = defaultdict(lambda: defaultdict(lambda: {"units": 0}))
    chain_totals = defaultdict(float)
    for r in sales:
        if r['_division'] == 'Sin Clasificar':
            continue
        chain = r.get('sub_cadena', '')
        chain_div_agg[chain][r['_division']]["units"] += r['_units']
        chain_totals[chain] += r['_units']

    division_mix_by_chain = []
    for chain in sorted(chain_totals.keys(), key=lambda c: -chain_totals[c]):
        total = chain_totals[chain]
        divisions = {}
        for div in division_names:
            units = chain_div_agg[chain][div]["units"]
            divisions[div] = {
                "units": round(units),
                "pct": round(units / total * 100, 1) if total > 0 else 0
            }
        division_mix_by_chain.append({"chain": chain, "divisions": divisions})

    # ── 13. Velocidad de Venta ───────────────────────────
    # Excluir último día si parece incompleto (<50% del promedio)
    active_dates = dates_sorted[:]
    if len(active_dates) >= 3:
        last_day_units = daily_agg[active_dates[-1]]["units"]
        avg_prev = sum(daily_agg[d]["units"] for d in active_dates[:-1]) / (len(active_dates) - 1)
        if last_day_units < avg_prev * 0.5:
            active_dates = active_dates[:-1]

    daily_avg = total_units / len(active_dates) if active_dates else 0

    # Semanal
    weeks = []
    week_dates = []
    current_week = []
    for d in active_dates:
        current_week.append(d)
        if len(current_week) == 7:
            week_dates.append(current_week)
            current_week = []
    if current_week:
        week_dates.append(current_week)

    weekly_trend = []
    for i, wdates in enumerate(week_dates):
        w_units = sum(daily_agg[d]["units"] for d in wdates)
        w_avg = w_units / len(wdates)
        weekly_trend.append({
            "week": f"S{i+1}",
            "dates": f"{wdates[0][-5:]} a {wdates[-1][-5:]}",
            "avgUnitsPerDay": round(w_avg),
            "totalUnits": round(w_units),
            "days": len(wdates)
        })

    # Velocidad por cadena
    chain_daily = defaultdict(lambda: defaultdict(float))
    for r in sales:
        if r['_date'] in active_dates:
            chain_daily[r.get('sub_cadena', '')][r['_date']] += r['_units']

    velocity_by_chain = []
    for chain in sorted(chain_totals.keys(), key=lambda c: -chain_totals[c]):
        days_with_data = [d for d in active_dates if chain_daily[chain].get(d, 0) > 0]
        upd = sum(chain_daily[chain][d] for d in days_with_data) / len(days_with_data) if days_with_data else 0

        # Tendencia: comparar primera y segunda mitad
        trend = 0
        if len(days_with_data) >= 6:
            mid = len(days_with_data) // 2
            first_half = sum(chain_daily[chain][d] for d in days_with_data[:mid]) / mid
            second_half = sum(chain_daily[chain][d] for d in days_with_data[mid:]) / (len(days_with_data) - mid)
            if first_half > 0:
                trend = round((second_half - first_half) / first_half * 100, 1)

        velocity_by_chain.append({
            "chain": chain, "unitsPerDay": round(upd), "trend": trend
        })

    # Velocidad por división
    div_daily = defaultdict(lambda: defaultdict(float))
    for r in sales:
        if r['_date'] in active_dates and r['_division'] != 'Sin Clasificar':
            div_daily[r['_division']][r['_date']] += r['_units']

    velocity_by_division = []
    for div in division_names:
        days_with_data = [d for d in active_dates if div_daily[div].get(d, 0) > 0]
        upd = sum(div_daily[div][d] for d in days_with_data) / len(days_with_data) if days_with_data else 0
        trend = 0
        if len(days_with_data) >= 6:
            mid = len(days_with_data) // 2
            first_half = sum(div_daily[div][d] for d in days_with_data[:mid]) / mid
            second_half = sum(div_daily[div][d] for d in days_with_data[mid:]) / (len(days_with_data) - mid)
            if first_half > 0:
                trend = round((second_half - first_half) / first_half * 100, 1)
        velocity_by_division.append({
            "division": div, "unitsPerDay": round(upd), "trend": trend
        })

    velocity_metrics = {
        "dailyAvg": round(daily_avg),
        "weeklyTrend": weekly_trend,
        "velocityByChain": velocity_by_chain,
        "velocityByDivision": velocity_by_division,
        "activeDays": len(active_dates),
    }

    # ── 14. Análisis Pareto ──────────────────────────────
    all_stores_sorted = sorted(store_agg.items(), key=lambda x: -x[1]["units"])
    cum_units = 0
    store_count = len(all_stores_sorted)

    pareto_thresholds = {}
    for i, (store, data) in enumerate(all_stores_sorted):
        cum_units += data["units"]
        pct_stores = (i + 1) / store_count * 100
        cum_pct = cum_units / total_units * 100 if total_units > 0 else 0
        for threshold in [10, 20, 50]:
            if threshold not in pareto_thresholds and pct_stores >= threshold:
                pareto_thresholds[threshold] = round(cum_pct, 1)

    # Concentración por cadena
    chain_concentration = []
    cum_pct = 0
    for cs in chain_sales:
        pct = round(cs["units"] / total_units * 100, 1) if total_units > 0 else 0
        cum_pct += pct
        chain_concentration.append({
            "chain": cs["chain"], "pctOfTotal": pct, "cumPct": round(cum_pct, 1)
        })

    pareto_analysis = {
        "totalStores": store_count,
        "storeConcentration": {
            f"top{k}pctPct": v for k, v in pareto_thresholds.items()
        },
        "chainConcentration": chain_concentration,
    }

    # ── 15. Métricas de Precio ───────────────────────────
    price_by_div = defaultdict(lambda: {"units": 0, "clp": 0, "pvp": 0})
    for r in sales:
        if r['_division'] == 'Sin Clasificar':
            continue
        price_by_div[r['_division']]["units"] += r['_units']
        price_by_div[r['_division']]["clp"] += r['_clp']
        price_by_div[r['_division']]["pvp"] += r['_pvp']

    price_div = sorted([
        {
            "division": div,
            "avgB2B": round(d["clp"] / d["units"]) if d["units"] > 0 else 0,
            "avgPVP": round(d["pvp"] / d["units"]) if d["units"] > 0 else 0,
            "units": round(d["units"])
        }
        for div, d in price_by_div.items()
    ], key=lambda x: -x["avgB2B"])

    price_by_chain = defaultdict(lambda: {"units": 0, "clp": 0, "pvp": 0})
    for r in sales:
        price_by_chain[r.get('sub_cadena', '')]["units"] += r['_units']
        price_by_chain[r.get('sub_cadena', '')]["clp"] += r['_clp']
        price_by_chain[r.get('sub_cadena', '')]["pvp"] += r['_pvp']

    price_chain = sorted([
        {
            "chain": c,
            "avgB2B": round(d["clp"] / d["units"]) if d["units"] > 0 else 0,
            "avgPVP": round(d["pvp"] / d["units"]) if d["units"] > 0 else 0,
        }
        for c, d in price_by_chain.items()
    ], key=lambda x: -x["avgB2B"])

    price_metrics = {"byDivision": price_div, "byChain": price_chain}

    # ── 16. SKUs Sin Clasificar ──────────────────────────
    unclassified = [
        {
            "descripcion": r.get('descripcion', ''),
            "propiedad": r.get('propiedad', ''),
            "cadena": r.get('sub_cadena', ''),
            "tienda": r.get('nombre_local', ''),
            "unidades": round(r['_units']),
            "clp": round(r['_clp']),
            "codigoInterno": r.get('codigo_interno', ''),
            "divisionOriginal": r.get('division', ''),
        }
        for r in sales if r['_division'] == 'Sin Clasificar'
    ]

    # ── 17. Tiendas sin Región (datos incompletos) ──────
    no_region_stores = defaultdict(lambda: {"units": 0, "clp": 0, "skus": set(), "dias": set(), "local": ""})
    for r in sales:
        if r.get('region', '') in ('No Definido', '', None):
            key = (r.get('sub_cadena', ''), r.get('local', ''))
            no_region_stores[key]["units"] += r['_units']
            no_region_stores[key]["clp"] += r['_clp']
            no_region_stores[key]["skus"].add(r.get('codigo_interno', ''))
            no_region_stores[key]["dias"].add(r['_date'])
            no_region_stores[key]["local"] = r.get('local', '')

    no_region_list = sorted([
        {
            "cadena": k[0],
            "codigoLocal": k[1],
            "nombreLocal": k[1],  # local field has descriptive name
            "unidades": round(v["units"]),
            "clp": round(v["clp"]),
            "skus": len(v["skus"]),
            "dias": len(v["dias"]),
        }
        for k, v in no_region_stores.items()
    ], key=lambda x: -x["unidades"])

    # ── 18. Insights Automáticos ─────────────────────────
    insights = generate_insights(
        chain_sales, by_division, velocity_metrics, stock_output,
        pareto_analysis, price_metrics, total_units,
        ranking_by_chain_store=ranking_by_chain_store,
        division_mix=division_mix_by_chain
    )

    # ══════════════════════════════════════════════════════
    #  OUTPUT
    # ══════════════════════════════════════════════════════

    # Metadata de frescura para el dashboard
    def parse_date_ddmmyyyy(d):
        try:
            parts = d.split('-')
            return datetime(int(parts[2]), int(parts[1]), int(parts[0]))
        except Exception:
            return None

    def parse_date_iso(d):
        """Parse YYYY-MM-DD date string."""
        try:
            parts = d.split('-')
            return datetime(int(parts[0]), int(parts[1]), int(parts[2]))
        except Exception:
            return None

    # dates_sorted uses YYYY-MM-DD format (from parse_date_iv)
    latest_sales_dt = parse_date_iso(dates_sorted[-1]) if dates_sorted else None
    days_since = (datetime.now() - latest_sales_dt).days if latest_sales_dt else None

    # Load pipeline_status.json if exists
    pipeline_status_path = os.path.join(DATA_DIR, "pipeline_status.json")
    pipeline_status = None
    if os.path.exists(pipeline_status_path):
        try:
            with open(pipeline_status_path, 'r', encoding='utf-8') as pf:
                pipeline_status = json.load(pf)
        except Exception:
            pass

    # Calcular frescura REAL por cadena (fechas, tiendas, cobertura)
    chain_dates = defaultdict(set)       # chain -> set of date strings
    chain_stores = defaultdict(set)      # chain -> set of store names
    chain_dt_list = defaultdict(list)    # chain -> list of datetime objects
    for r in sales:
        chain = r.get('sub_cadena', '')
        fecha = r.get('fecha', '')
        if chain and fecha:
            dt = parse_date_iso(fecha) or parse_date_ddmmyyyy(fecha)
            if dt:
                chain_dt_list[chain].append(dt)
                chain_dates[chain].add(fecha)
            store = r.get('nombre_local', '') or r.get('local', '')
            if store:
                chain_stores[chain].add(store)

    chain_freshness = []
    for chain in sorted(chain_dt_list.keys()):
        max_dt = max(chain_dt_list[chain])
        min_dt = min(chain_dt_list[chain])
        days_old = (datetime.now() - max_dt).days
        range_days = (max_dt - min_dt).days + 1
        days_with_data = len(chain_dates[chain])
        if days_old <= 1:
            status = "fresh"
        elif days_old <= 2:
            status = "warning"
        else:
            status = "stale"
        chain_freshness.append({
            "chain": chain,
            "firstDate": min_dt.strftime('%Y-%m-%d'),
            "lastUpdate": max_dt.strftime('%Y-%m-%d'),
            "daysOld": days_old,
            "rangeDays": range_days,
            "daysWithData": days_with_data,
            "stores": len(chain_stores[chain]),
            "status": status,
            "records": len(chain_dt_list[chain]),
        })

    # Ordenar: fresh primero, luego por fecha descendente
    status_order = {"fresh": 0, "warning": 1, "stale": 2}
    chain_freshness.sort(key=lambda x: (status_order.get(x["status"], 9), -int(x["lastUpdate"].replace("-", ""))))

    data_meta = {
        "generatedAt": datetime.now().isoformat(),
        "salesRecords": len(sales),
        "salesDateFrom": dates_sorted[0] if dates_sorted else None,
        "salesDateTo": dates_sorted[-1] if dates_sorted else None,
        "salesDays": len(dates_sorted),
        "stockRecords": len(stock_data) if stock_data else 0,
        "daysSinceLatest": days_since,
        "freshness": "ok" if days_since and days_since <= 2 else "warning" if days_since and days_since <= 5 else "stale",
        "pipelineStatus": pipeline_status.get("overall") if pipeline_status else None,
        "chains": sorted(set(r.get('sub_cadena', '') for r in sales)),
        "chainFreshness": chain_freshness,
        "uniqueStores": kpis.get("uniqueStores", 0),
        "uniqueSKUs": len(set(r.get('codigo_interno', '') for r in sales)),
    }

    # ── Mapa licencia → división (para filtros en dashboard) ──
    lic_div_map = defaultdict(lambda: defaultdict(lambda: {"units": 0.0, "clp": 0.0}))
    for r in sales:
        lic = r.get('propiedad', 'Sin Licencia')
        div = r['_division']
        lic_div_map[lic][div]["units"] += r['_units']
        lic_div_map[lic][div]["clp"] += r['_clp']

    # 1:1 map (dominant division per license) - backwards compat
    license_division_map = {}
    for lic, divs in lic_div_map.items():
        license_division_map[lic] = max(divs, key=lambda d: divs[d]["units"])

    # Breakdown proporcional: license → {division: {units, clp, pct}}
    license_division_breakdown = {}
    for lic, divs in lic_div_map.items():
        total_u = sum(d["units"] for d in divs.values())
        license_division_breakdown[lic] = {
            div: {
                "units": round(d["units"]),
                "clp": round(d["clp"]),
                "pct": round(d["units"] / total_u * 100, 1) if total_u > 0 else 0,
            }
            for div, d in divs.items() if d["units"] > 0
        }

    # ── Venta por cadena × licencia (para filtro cadena en CC) ──
    chain_license_agg = defaultdict(lambda: defaultdict(lambda: {"units": 0.0, "clp": 0.0}))
    for r in sales:
        chain = r.get('sub_cadena', 'Otro')
        prop = r.get('propiedad', 'Sin Licencia')
        chain_license_agg[chain][prop]["units"] += r['_units']
        chain_license_agg[chain][prop]["clp"] += r['_clp']

    sales_by_chain_license = {}
    for chain, lics in chain_license_agg.items():
        sales_by_chain_license[chain] = {
            lic: {"units": round(d["units"]), "clp": round(d["clp"])}
            for lic, d in lics.items() if d["units"] > 0
        }

    # ── Temporada / Quarter / Year breakdowns ──
    all_quarters = sorted(set(r['_quarter'] for r in sales if r['_quarter']))
    all_years_product = sorted(set(r['_year_product'] for r in sales if r['_year_product']))
    all_temporadas_raw = sorted(set(r['_temporada'] for r in sales if r['_temporada'] and r['_temporada'] != 'No Definido'))

    # License × Quarter breakdown
    lic_quarter_agg = defaultdict(lambda: defaultdict(lambda: {"units": 0.0, "clp": 0.0}))
    lic_year_agg = defaultdict(lambda: defaultdict(lambda: {"units": 0.0, "clp": 0.0}))
    lic_temp_agg = defaultdict(lambda: defaultdict(lambda: {"units": 0.0, "clp": 0.0}))
    for r in sales:
        lic = r.get('propiedad', 'Sin Licencia')
        if r['_quarter']:
            lic_quarter_agg[lic][r['_quarter']]["units"] += r['_units']
            lic_quarter_agg[lic][r['_quarter']]["clp"] += r['_clp']
        if r['_year_product']:
            lic_year_agg[lic][r['_year_product']]["units"] += r['_units']
            lic_year_agg[lic][r['_year_product']]["clp"] += r['_clp']
        if r['_temporada'] and r['_temporada'] != 'No Definido':
            lic_temp_agg[lic][r['_temporada']]["units"] += r['_units']
            lic_temp_agg[lic][r['_temporada']]["clp"] += r['_clp']

    def round_breakdown(agg):
        return {
            lic: {k: {"units": round(d["units"]), "clp": round(d["clp"])} for k, d in dims.items()}
            for lic, dims in agg.items()
        }

    license_quarter_breakdown = round_breakdown(lic_quarter_agg)
    license_year_breakdown = round_breakdown(lic_year_agg)
    license_temporada_breakdown = round_breakdown(lic_temp_agg)

    # ── Clase / Subclase / Categoria breakdowns ──
    all_clases = sorted(set(r['_clase'] for r in sales if r['_clase'] and r['_clase'] != 'No Definido'))
    all_subclases = sorted(set(r['_subclase'] for r in sales if r['_subclase'] and r['_subclase'] not in ('No Definido', '0', '')))
    all_categorias = sorted(set(r['_categoria'] for r in sales if r['_categoria'] and r['_categoria'] != 'No Definido'))

    lic_clase_agg = defaultdict(lambda: defaultdict(lambda: {"units": 0.0, "clp": 0.0}))
    lic_subclase_agg = defaultdict(lambda: defaultdict(lambda: {"units": 0.0, "clp": 0.0}))
    lic_categoria_agg = defaultdict(lambda: defaultdict(lambda: {"units": 0.0, "clp": 0.0}))
    for r in sales:
        lic = r.get('propiedad', 'Sin Licencia')
        if r['_clase'] and r['_clase'] != 'No Definido':
            lic_clase_agg[lic][r['_clase']]["units"] += r['_units']
            lic_clase_agg[lic][r['_clase']]["clp"] += r['_clp']
        if r['_subclase'] and r['_subclase'] not in ('No Definido', '0', ''):
            lic_subclase_agg[lic][r['_subclase']]["units"] += r['_units']
            lic_subclase_agg[lic][r['_subclase']]["clp"] += r['_clp']
        if r['_categoria'] and r['_categoria'] != 'No Definido':
            lic_categoria_agg[lic][r['_categoria']]["units"] += r['_units']
            lic_categoria_agg[lic][r['_categoria']]["clp"] += r['_clp']

    license_clase_breakdown = round_breakdown(lic_clase_agg)
    license_subclase_breakdown = round_breakdown(lic_subclase_agg)
    license_categoria_breakdown = round_breakdown(lic_categoria_agg)

    # All licenses (complete, sorted by units desc)
    all_licenses_full = sorted(license_totals.keys(), key=lambda l: -license_totals[l])

    print(f"  Temporadas: {len(all_temporadas_raw)} valores, Quarters: {all_quarters}, Years: {all_years_product}")
    print(f"  Clases: {len(all_clases)}, Subclases: {len(all_subclases)}, Categorias: {len(all_categorias)}")
    print(f"  License-Division breakdown: {len(license_division_breakdown)} licencias con multiples divisiones")

    output = {
        "_meta": data_meta,
        "kpis": kpis,
        "dailySales": daily_sales,
        "byLicense": by_license,
        "byChain": chain_sales,
        "byStore": store_sales,
        "byRegion": region_sales,
        "dailyTotals": daily_totals,
        "dailyByChain": daily_by_chain,
        "stock": stock_output,
        "allLicenses": all_licenses_full,
        "allChains": sorted(set(r.get('sub_cadena', '') for r in sales)),
        "licenseDivisionMap": license_division_map,
        "licenseDivisionBreakdown": license_division_breakdown,
        "salesByChainLicense": sales_by_chain_license,
        "allQuarters": all_quarters,
        "allYearsProduct": all_years_product,
        "allTemporadas": all_temporadas_raw,
        "licenseQuarterBreakdown": license_quarter_breakdown,
        "licenseYearBreakdown": license_year_breakdown,
        "licenseTemporadaBreakdown": license_temporada_breakdown,
        "allClases": all_clases,
        "allSubclases": all_subclases,
        "allCategorias": all_categorias,
        "licenseClaseBreakdown": license_clase_breakdown,
        "licenseSubclaseBreakdown": license_subclase_breakdown,
        "licenseCategoriaBreakdown": license_categoria_breakdown,
        # Bloques existentes:
        "byDivision": by_division,
        "byDivisionDaily": by_division_daily,
        "rankingByChainStore": ranking_by_chain_store,
        "rankingByProduct": ranking_by_product,
        "weeklyStoreData": weekly_store_data,
        "licenseSummary": license_summary,
        "rankingWeeksPeriod": round(num_weeks_period, 1),
        "divisionMixByChain": division_mix_by_chain,
        "velocityMetrics": velocity_metrics,
        "paretoAnalysis": pareto_analysis,
        "priceMetrics": price_metrics,
        "unclassifiedSKUs": unclassified,
        "noRegionStores": no_region_list,
        "insights": insights,
        "generatedAt": datetime.now().isoformat(),
    }

    # Escribir JS
    js_path = os.path.join(DASHBOARD_DIR, "real_data.js")
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("// Auto-generated from IV API data - DO NOT EDIT MANUALLY\n")
        f.write(f"// Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"// Source: {len(sales)} sales records, {len(dates_sorted)} days\n")
        f.write(f"// Blocks: {len(output)} data sections\n\n")
        f.write("const REAL_SELLOUT = ")
        json.dump(output, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    file_size = os.path.getsize(js_path) / 1024
    print(f"\nArchivo generado: {js_path} ({file_size:.0f} KB)")
    print(f"  KPIs: {kpis['totalUnits']:,} und, ${kpis['totalCLP']:,} CLP, {kpis['uniqueStores']} tiendas")
    print(f"  Divisiones: {[d['division'] for d in by_division]}")
    print(f"  Cadenas: {[c['chain'] for c in chain_sales]}")
    print(f"  Insights: {len(insights)} alertas generadas")

    return output


def generate_insights(chain_sales, by_division, velocity, stock, pareto, price, total_units,
                      ranking_by_chain_store=None, division_mix=None):
    """Genera insights automáticos de negocio (mínimo 8)."""
    insights = []

    # 1. Concentración por cadena: si top 1 cadena > 35% del total
    if chain_sales:
        top_chain = chain_sales[0]
        pct = round(top_chain["units"] / total_units * 100, 1) if total_units > 0 else 0
        if pct > 35:
            insights.append({
                "type": "warning",
                "category": "concentracion",
                "title": "Alta concentración",
                "text": f"{top_chain['chain']} concentra {pct}% de la venta total. Riesgo de dependencia de un solo canal.",
                "value": pct
            })

    # 2. Cadena con alta venta + alto OOS = riesgo revenue
    if stock and stock.get("oosByChain"):
        for oos_chain in stock["oosByChain"]:
            chain_data = next((c for c in chain_sales if c["chain"] == oos_chain["chain"]), None)
            if chain_data:
                chain_pct = round(chain_data["units"] / total_units * 100, 1) if total_units > 0 else 0
                if chain_pct > 10 and oos_chain["oosRate"] > 8:
                    insights.append({
                        "type": "danger",
                        "category": "oos",
                        "title": "Riesgo Revenue",
                        "text": f"{oos_chain['chain']} aporta {chain_pct}% de venta pero tiene {oos_chain['oosRate']}% de quiebre. Impacto estimado en revenue.",
                        "value": oos_chain["oosRate"]
                    })

    # 3. Velocidad: divisiones acelerando o desacelerando
    if velocity.get("velocityByDivision"):
        for vd in velocity["velocityByDivision"]:
            if vd["trend"] <= -8:
                insights.append({
                    "type": "danger",
                    "category": "velocidad",
                    "title": "Desaceleración",
                    "text": f"{vd['division']} bajó {abs(vd['trend'])}% en velocidad de venta (und/día) vs primera mitad del período.",
                    "value": vd["trend"]
                })
            elif vd["trend"] >= 10:
                insights.append({
                    "type": "success",
                    "category": "velocidad",
                    "title": "Aceleración",
                    "text": f"{vd['division']} creció {vd['trend']}% en velocidad de venta (und/día).",
                    "value": vd["trend"]
                })

    # 4. Velocidad por cadena (top desaceleraciones)
    if velocity.get("velocityByChain"):
        decel = sorted([vc for vc in velocity["velocityByChain"] if vc["trend"] <= -10],
                       key=lambda x: x["trend"])
        for vc in decel[:3]:
            insights.append({
                "type": "warning",
                "category": "velocidad",
                "title": "Cadena desacelerando",
                "text": f"{vc['chain']} bajó {abs(vc['trend'])}% en und/día. Revisar cobertura y stock.",
                "value": vc["trend"]
            })

    # 5. Pareto: alta concentración en pocas tiendas
    if pareto.get("storeConcentration"):
        top10 = pareto["storeConcentration"].get("top10pctPct", 0)
        if top10 > 45:
            insights.append({
                "type": "warning",
                "category": "concentracion",
                "title": "Venta concentrada",
                "text": f"El 10% de las tiendas ({round(pareto['totalStores'] * 0.1)}) genera {top10}% de la venta. Alto riesgo si una tienda clave falla.",
                "value": top10
            })

    # 6. OOS global alto
    if stock and stock.get("oosRate", 0) > 10:
        insights.append({
            "type": "danger",
            "category": "oos",
            "title": "Quiebre alto",
            "text": f"OOS global en {stock['oosRate']}%. {stock.get('totalOOS', 0):,} registros en quiebre de {stock.get('totalSKUs', 0):,} monitoreados.",
            "value": stock["oosRate"]
        })

    # 7. División con mayor crecimiento en velocidad
    if velocity.get("velocityByDivision"):
        top_accel = max(velocity["velocityByDivision"], key=lambda x: x.get("trend", 0), default=None)
        if top_accel and top_accel.get("trend", 0) >= 5 and top_accel not in [
            i for i in insights if i.get("category") == "velocidad"]:
            insights.append({
                "type": "success",
                "category": "velocidad",
                "title": "Mejor rendimiento",
                "text": f"{top_accel['division']} lidera crecimiento con +{top_accel['trend']}% en velocidad de venta.",
                "value": top_accel["trend"]
            })

    # 8. Top cadena por volumen
    if chain_sales and len(chain_sales) >= 3:
        top3 = chain_sales[:3]
        pct_top3 = round(sum(c["units"] for c in top3) / total_units * 100, 1) if total_units > 0 else 0
        insights.append({
            "type": "info",
            "category": "distribucion",
            "title": "Top 3 cadenas",
            "text": f"{top3[0]['chain']}, {top3[1]['chain']} y {top3[2]['chain']} suman {pct_top3}% del sell out total.",
            "value": pct_top3
        })

    # 9. Cadena con 0 stock (todo OOS)
    if stock and stock.get("oosByChain"):
        critical_oos = [c for c in stock["oosByChain"] if c["oosRate"] > 20]
        for co in critical_oos[:2]:
            insights.append({
                "type": "danger",
                "category": "oos",
                "title": "OOS crítico",
                "text": f"{co['chain']} tiene {co['oosRate']}% de quiebre. {co.get('oosSKUs', 0)} SKUs sin stock.",
                "value": co["oosRate"]
            })

    # 10. División dominante: si una división > 50% del total
    if by_division and len(by_division) > 1:
        total_div_units = sum(d["units"] for d in by_division)
        if total_div_units > 0:
            top_div = by_division[0]
            top_pct = round(top_div["units"] / total_div_units * 100, 1)
            if top_pct > 50:
                insights.append({
                    "type": "info",
                    "category": "mix",
                    "title": "División dominante",
                    "text": f"{top_div['division']} representa {top_pct}% del mix. Oportunidad de diversificación en otras categorías.",
                    "value": top_pct
                })

    # 11. Tiendas sin stock (ranking con stockUnits=0 pero con venta)
    if ranking_by_chain_store:
        stores_no_stock = 0
        stores_total = 0
        for stores in ranking_by_chain_store.values():
            for s in stores:
                stores_total += 1
                if s.get("stockUnits", 0) == 0 and s.get("units", 0) > 0:
                    stores_no_stock += 1
        if stores_no_stock > 0 and stores_total > 0:
            pct_no_stock = round(stores_no_stock / stores_total * 100, 1)
            if pct_no_stock > 5:
                insights.append({
                    "type": "warning",
                    "category": "stock",
                    "title": "Tiendas sin stock",
                    "text": f"{stores_no_stock} tiendas ({pct_no_stock}%) con venta activa pero sin stock registrado. Revisar reposición.",
                    "value": pct_no_stock
                })

    # Ensure minimum 8 insights — add filler context insights if needed
    if len(insights) < 8 and chain_sales:
        # Cadena con menor participación
        if len(chain_sales) >= 5:
            bottom = chain_sales[-1]
            bottom_pct = round(bottom["units"] / total_units * 100, 2) if total_units > 0 else 0
            insights.append({
                "type": "info",
                "category": "distribucion",
                "title": "Menor participación",
                "text": f"{bottom['chain']} tiene solo {bottom_pct}% del sell out. Evaluar potencial o redistribuir esfuerzo.",
                "value": bottom_pct
            })

    if len(insights) < 8 and by_division and len(by_division) >= 2:
        # Segunda división
        second = by_division[1]
        total_div = sum(d["units"] for d in by_division)
        if total_div > 0:
            pct2 = round(second["units"] / total_div * 100, 1)
            insights.append({
                "type": "info",
                "category": "mix",
                "title": "Segunda división",
                "text": f"{second['division']} es la segunda categoría con {pct2}% del mix ({second['units']:,} und).",
                "value": pct2
            })

    return sorted(insights, key=lambda x: {"danger": 0, "warning": 1, "info": 2, "success": 3}.get(x["type"], 4))


if __name__ == "__main__":
    year = 2026
    days = None

    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == '--year' and i < len(sys.argv) - 1:
            year = int(sys.argv[i + 1])
        elif arg == '--days' and i < len(sys.argv) - 1:
            days = int(sys.argv[i + 1])

    process(year=year, days_back=days)
