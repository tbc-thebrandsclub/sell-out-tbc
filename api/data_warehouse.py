"""
============================================================
Data Warehouse - SQLite para acumulacion historica de datos IV
============================================================
Uso:
  python data_warehouse.py init              # Crear/resetear DB
  python data_warehouse.py ingest            # Ingestar sales + stock actuales
  python data_warehouse.py ingest-sales      # Solo sales
  python data_warehouse.py ingest-stock      # Solo stock
  python data_warehouse.py status            # Ver estado de la DB
  python data_warehouse.py migrate           # Migrar DB antigua al nuevo esquema
"""

import csv
import gzip
import json
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
PULLS_DIR = os.path.join(DATA_DIR, "pulls")

# DB vive fuera de Google Drive para evitar problemas de sincronizacion
DB_DIR = r"C:\TBC-Data"


def _db_path_for_year(year=None):
    """Retorna la ruta de la DB para un año específico."""
    if year is None:
        year = datetime.now().year
    path = os.path.join(DB_DIR, f"sellout_{year}.db")
    # Fallback a data/ si C:\TBC-Data no existe (ej: otro equipo)
    if not os.path.exists(DB_DIR):
        path = os.path.join(DATA_DIR, f"sellout_{year}.db")
    return path


# DB_PATH apunta al año actual por defecto
DB_PATH = _db_path_for_year()

# ── Mapping de columnas CSV -> columnas DB ─────────────────

SALES_COLUMN_MAP = {
    'Fechas': 'fecha',
    'Local': 'local',
    'Código Interno': 'codigo_interno',
    'Sub Cadena': 'sub_cadena',
    'Nombre Local': 'nombre_local',
    'Región': 'region',
    'Comuna': 'comuna',
    'División': 'division',
    'Clase': 'clase',
    'Subclase': 'subclase',
    'Categoría': 'categoria',
    'Propiedad': 'propiedad',
    'Descripción Producto': 'descripcion',
    'Temporada': 'temporada',
    'Unidades': 'unidades',
    'Costos B2B': 'costos_b2b',
    'Ventas B2B': 'ventas_b2b',
    'Valores PVP s/IVA': 'valores_pvp',
    'Canal': 'canal',
    'Cobertura': 'cobertura',
    'Tipo de Local': 'tipo_local',
    'Tipo Cent. Comercial': 'tipo_cc',
    'Cód. Cadena': 'cod_cadena',
}

STOCK_COLUMN_MAP = {
    'Fechas': 'fecha',
    'Local': 'local',
    'Código Interno': 'codigo_interno',
    'Sub Cadena': 'sub_cadena',
    'Nombre Local': 'nombre_local',
    'Propiedad': 'propiedad',
    'Stock Locales en Unidades': 'stock_local',
    'Stock CD en Unidades': 'stock_cd',
    'Stock Total en Unidades': 'stock_total',
    'Venta últimos 7 días en Unidades': 'venta_7d',
    'Promedio Diario Ventas en Unidades': 'promedio_diario',
    'Días Stock Total en Unidades': 'dias_stock_total',
    'Quiebres': 'quiebres',
}


def parse_number(val):
    """Parsea formato IV: '1.234,567890' -> 1234.567890"""
    if not val or val.strip() == '':
        return 0.0
    val = val.strip().strip('"')
    val = val.replace('.', '').replace(',', '.')
    try:
        return float(val)
    except ValueError:
        return 0.0


def _convert_date(date_str):
    """Convierte dd-mm-yyyy -> YYYY-MM-DD. Si ya es ISO, lo deja."""
    if not date_str:
        return ''
    date_str = date_str.strip().strip('"')
    # Ya es YYYY-MM-DD
    if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
        return date_str
    # dd-mm-yyyy
    m = re.match(r'^(\d{2})-(\d{2})-(\d{4})$', date_str)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return date_str


def _extract_local_code(local_str):
    """Extrae código de tienda del campo local.
    'J502 Jumbo - Av. Kennedy 9001' -> 'J502'
    '0003 Hiper Lider - Av. Irarrázaval' -> '0003'
    """
    if not local_str:
        return ''
    parts = local_str.strip().split(' ', 1)
    return parts[0] if parts else ''


def get_connection(db_path=None):
    if db_path is None:
        db_path = DB_PATH
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db(db_path=None):
    """Crear tablas e indices."""
    if db_path is None:
        db_path = DB_PATH
    print(f"Inicializando DB en {db_path}")
    conn = get_connection(db_path)
    c = conn.cursor()

    c.executescript("""
        CREATE TABLE IF NOT EXISTS sales (
            fecha TEXT,
            sub_cadena TEXT,
            local_code TEXT,
            codigo_interno TEXT,
            local TEXT,
            nombre_local TEXT,
            region TEXT,
            comuna TEXT,
            division TEXT,
            clase TEXT,
            subclase TEXT,
            categoria TEXT,
            propiedad TEXT,
            descripcion TEXT,
            temporada TEXT,
            unidades REAL,
            costos_b2b REAL,
            ventas_b2b REAL,
            valores_pvp REAL,
            canal TEXT,
            cobertura TEXT,
            tipo_local TEXT,
            tipo_cc TEXT,
            cod_cadena TEXT,
            PRIMARY KEY (fecha, sub_cadena, local_code, codigo_interno)
        );

        CREATE INDEX IF NOT EXISTS idx_sales_fecha ON sales(fecha);
        CREATE INDEX IF NOT EXISTS idx_sales_cadena ON sales(sub_cadena);
        CREATE INDEX IF NOT EXISTS idx_sales_division ON sales(division);

        CREATE TABLE IF NOT EXISTS stock (
            fecha TEXT,
            sub_cadena TEXT,
            local_code TEXT,
            codigo_interno TEXT,
            local TEXT,
            nombre_local TEXT,
            propiedad TEXT,
            stock_local REAL,
            stock_cd REAL,
            stock_total REAL,
            venta_7d REAL,
            promedio_diario REAL,
            dias_stock_total REAL,
            quiebres REAL,
            PRIMARY KEY (fecha, sub_cadena, local_code, codigo_interno)
        );

        CREATE INDEX IF NOT EXISTS idx_stock_fecha ON stock(fecha);
        CREATE INDEX IF NOT EXISTS idx_stock_cadena ON stock(sub_cadena);

        CREATE TABLE IF NOT EXISTS pull_log (
            pull_id INTEGER PRIMARY KEY AUTOINCREMENT,
            pull_date TEXT,
            data_type TEXT,
            records_total INTEGER,
            records_new INTEGER,
            records_replaced INTEGER,
            date_range_from TEXT,
            date_range_to TEXT
        );
    """)

    conn.commit()
    conn.close()
    print("  DB inicializada correctamente.")


def _detect_encoding(filepath):
    """Detecta encoding del CSV."""
    for enc in ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                f.read(4096)
            return enc
        except (UnicodeDecodeError, UnicodeError):
            continue
    return 'latin-1'


def _detect_delimiter(filepath, encoding):
    """Detecta delimitador (';' o ',')."""
    with open(filepath, 'r', encoding=encoding) as f:
        first_line = f.readline()
    return ';' if first_line.count(';') > first_line.count(',') else ','


def _transform_row(values, db_cols):
    """Aplica transformaciones: fecha -> ISO, extrae local_code."""
    fecha_idx = db_cols.index('fecha')
    values[fecha_idx] = _convert_date(values[fecha_idx])

    local_idx = db_cols.index('local')
    local_code = _extract_local_code(values[local_idx])

    # Insertar local_code después de sub_cadena (posición en db_cols)
    lc_idx = db_cols.index('local_code')
    values[lc_idx] = local_code

    return values


def ingest_csv(filepath, table, column_map, numeric_fields):
    """Ingesta un CSV a la tabla SQLite especificada."""
    if not os.path.exists(filepath):
        print(f"  Archivo no encontrado: {filepath}")
        return 0, 0, 0

    encoding = _detect_encoding(filepath)
    delimiter = _detect_delimiter(filepath, encoding)

    conn = get_connection()
    cursor = conn.cursor()

    before_count = cursor.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

    pk_cols = ['fecha', 'sub_cadena', 'local_code', 'codigo_interno']
    existing_pks = set()
    for r in cursor.execute(f"SELECT {','.join(pk_cols)} FROM {table}"):
        existing_pks.add(r)

    # Build column list: column_map values + local_code (computed)
    db_cols = list(column_map.values())
    # Insert local_code after sub_cadena
    sc_idx = db_cols.index('sub_cadena')
    db_cols.insert(sc_idx + 1, 'local_code')

    placeholders = ','.join(['?'] * len(db_cols))
    cols_str = ','.join(db_cols)
    sql = f"INSERT OR REPLACE INTO {table} ({cols_str}) VALUES ({placeholders})"

    batch = []
    total_read = 0
    replaced = 0

    pk_indices = [db_cols.index(c) for c in pk_cols]

    with open(filepath, 'r', encoding=encoding) as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        for row in reader:
            values = []
            for csv_col, db_col in column_map.items():
                raw_val = row.get(csv_col, '')
                if db_col in numeric_fields:
                    values.append(parse_number(raw_val))
                else:
                    values.append(raw_val.strip().strip('"') if raw_val else '')

            # Insert placeholder for local_code
            values.insert(sc_idx + 1, '')

            # Transform: convert date, extract local_code
            _transform_row(values, db_cols)

            pk = tuple(values[i] for i in pk_indices)
            if pk in existing_pks:
                replaced += 1
            batch.append(tuple(values))
            total_read += 1

            if len(batch) >= 5000:
                cursor.executemany(sql, batch)
                batch = []

    if batch:
        cursor.executemany(sql, batch)

    conn.commit()

    after_count = cursor.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    new_records = after_count - before_count

    conn.close()
    return total_read, new_records, replaced


def ingest_json(filepath, table, column_map, numeric_fields):
    """Ingesta un JSON (array de objetos) a la tabla SQLite."""
    if not os.path.exists(filepath):
        print(f"  Archivo no encontrado: {filepath}")
        return 0, 0, 0

    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    conn = get_connection()
    cursor = conn.cursor()

    before_count = cursor.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

    pk_cols = ['fecha', 'sub_cadena', 'local_code', 'codigo_interno']
    existing_pks = set()
    for r in cursor.execute(f"SELECT {','.join(pk_cols)} FROM {table}"):
        existing_pks.add(r)

    db_cols = list(column_map.values())
    sc_idx = db_cols.index('sub_cadena')
    db_cols.insert(sc_idx + 1, 'local_code')

    placeholders = ','.join(['?'] * len(db_cols))
    cols_str = ','.join(db_cols)
    sql = f"INSERT OR REPLACE INTO {table} ({cols_str}) VALUES ({placeholders})"

    batch = []
    total_read = 0
    replaced = 0

    pk_indices = [db_cols.index(c) for c in pk_cols]

    for row in data:
        values = []
        for csv_col, db_col in column_map.items():
            raw_val = row.get(csv_col, '')
            if db_col in numeric_fields:
                values.append(parse_number(str(raw_val)) if raw_val else 0.0)
            else:
                values.append(str(raw_val).strip().strip('"') if raw_val else '')

        values.insert(sc_idx + 1, '')
        _transform_row(values, db_cols)

        pk = tuple(values[i] for i in pk_indices)
        if pk in existing_pks:
            replaced += 1
        batch.append(tuple(values))
        total_read += 1

        if len(batch) >= 5000:
            cursor.executemany(sql, batch)
            batch = []

    if batch:
        cursor.executemany(sql, batch)

    conn.commit()
    after_count = cursor.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    new_records = after_count - before_count
    conn.close()
    return total_read, new_records, replaced


def ingest_sales():
    """Ingesta datos de ventas desde CSV o JSON."""
    print("Ingesta de ventas...")
    numeric_fields = {'unidades', 'costos_b2b', 'ventas_b2b', 'valores_pvp'}

    csv_path = os.path.join(DATA_DIR, "sales_latest.csv")
    json_path = os.path.join(DATA_DIR, "sales_latest.json")

    if os.path.exists(csv_path):
        total, new, replaced = ingest_csv(csv_path, 'sales', SALES_COLUMN_MAP, numeric_fields)
    elif os.path.exists(json_path):
        total, new, replaced = ingest_json(json_path, 'sales', SALES_COLUMN_MAP, numeric_fields)
    else:
        print("  No se encontro sales_latest.csv ni .json")
        return

    unchanged = total - new - replaced
    print(f"  Leidos: {total:,} | Nuevos: {new:,} | Actualizados: {replaced:,} | Sin cambio: {unchanged:,}")

    _backup_csv(csv_path, "sales")
    _log_pull('sales', total, new, replaced)


def ingest_stock():
    """Ingesta datos de stock desde CSV o JSON."""
    print("Ingesta de stock...")
    numeric_fields = {'stock_local', 'stock_cd', 'stock_total', 'venta_7d',
                      'promedio_diario', 'dias_stock_total', 'quiebres'}

    csv_path = os.path.join(DATA_DIR, "stock_latest.csv")
    json_path = os.path.join(DATA_DIR, "stock_latest.json")

    if os.path.exists(csv_path):
        total, new, replaced = ingest_csv(csv_path, 'stock', STOCK_COLUMN_MAP, numeric_fields)
    elif os.path.exists(json_path):
        total, new, replaced = ingest_json(json_path, 'stock', STOCK_COLUMN_MAP, numeric_fields)
    else:
        print("  No se encontro stock_latest.csv ni .json")
        return

    unchanged = total - new - replaced
    print(f"  Leidos: {total:,} | Nuevos: {new:,} | Actualizados: {replaced:,} | Sin cambio: {unchanged:,}")

    _backup_csv(csv_path, "stock")
    _log_pull('stock', total, new, replaced)


def _backup_csv(csv_path, data_type):
    """Guarda copia comprimida del CSV en pulls/."""
    if not os.path.exists(csv_path):
        return
    os.makedirs(PULLS_DIR, exist_ok=True)
    today = datetime.now().strftime('%Y-%m-%d')
    dest = os.path.join(PULLS_DIR, f"{data_type}_{today}.csv.gz")
    with open(csv_path, 'rb') as f_in:
        with gzip.open(dest, 'wb') as f_out:
            shutil.copyfileobj(f_in, f_out)
    print(f"  Backup: {dest}")


def _log_pull(data_type, total, new, replaced):
    """Registra la ingesta en pull_log."""
    conn = get_connection()
    cursor = conn.cursor()

    table = data_type
    row = cursor.execute(f"SELECT MIN(fecha), MAX(fecha) FROM {table}").fetchone()
    date_from = row[0] if row else ''
    date_to = row[1] if row else ''

    cursor.execute(
        "INSERT INTO pull_log (pull_date, data_type, records_total, records_new, records_replaced, date_range_from, date_range_to) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (datetime.now().isoformat(), data_type, total, new, replaced, date_from, date_to)
    )
    conn.commit()
    conn.close()


def migrate_old_db():
    """Migra la DB antigua (sellout.db) al nuevo esquema (sellout_YYYY.db)."""
    old_path = os.path.join(DATA_DIR, "sellout.db")
    if not os.path.exists(old_path):
        print("No se encontro sellout.db para migrar.")
        return

    print(f"Migrando {old_path} -> nuevo esquema...")
    old_conn = sqlite3.connect(old_path)
    old_c = old_conn.cursor()

    # Detectar años presentes en sales
    years = set()
    for row in old_c.execute("SELECT DISTINCT fecha FROM sales"):
        date_str = row[0]
        m = re.match(r'^(\d{2})-(\d{2})-(\d{4})$', date_str)
        if m:
            years.add(int(m.group(3)))
        m2 = re.match(r'^(\d{4})-', date_str)
        if m2:
            years.add(int(m2.group(1)))
    for row in old_c.execute("SELECT DISTINCT fecha FROM stock"):
        date_str = row[0]
        m = re.match(r'^(\d{2})-(\d{2})-(\d{4})$', date_str)
        if m:
            years.add(int(m.group(3)))
        m2 = re.match(r'^(\d{4})-', date_str)
        if m2:
            years.add(int(m2.group(1)))

    if not years:
        print("  No se encontraron datos en la DB antigua.")
        old_conn.close()
        return

    print(f"  Anos encontrados: {sorted(years)}")

    for year in sorted(years):
        new_path = _db_path_for_year(year)
        print(f"\n  Migrando año {year} -> {os.path.basename(new_path)}")
        init_db(new_path)
        new_conn = get_connection(new_path)
        new_c = new_conn.cursor()

        # Migrate sales
        count = 0
        batch = []
        for row in old_c.execute("SELECT * FROM sales"):
            fecha_old = row[0]
            fecha_iso = _convert_date(fecha_old)
            # Filtrar por año
            if not fecha_iso.startswith(str(year)):
                continue
            local_full = row[1]
            local_code = _extract_local_code(local_full)
            codigo_interno = row[2]
            sub_cadena = row[3]
            rest = row[4:]  # nombre_local onwards

            new_row = (fecha_iso, sub_cadena, local_code, codigo_interno, local_full) + rest
            batch.append(new_row)
            count += 1

            if len(batch) >= 5000:
                new_c.executemany(
                    f"INSERT OR REPLACE INTO sales VALUES ({','.join(['?']*len(new_row))})",
                    batch
                )
                batch = []

        if batch:
            new_c.executemany(
                f"INSERT OR REPLACE INTO sales VALUES ({','.join(['?']*len(batch[0]))})",
                batch
            )
        new_conn.commit()
        print(f"    Sales: {count:,} registros migrados")

        # Migrate stock
        count = 0
        batch = []
        for row in old_c.execute("SELECT * FROM stock"):
            fecha_old = row[0]
            fecha_iso = _convert_date(fecha_old)
            if not fecha_iso.startswith(str(year)):
                continue
            local_full = row[1]
            local_code = _extract_local_code(local_full)
            codigo_interno = row[2]
            sub_cadena = row[3]
            rest = row[4:]

            new_row = (fecha_iso, sub_cadena, local_code, codigo_interno, local_full) + rest
            batch.append(new_row)
            count += 1

            if len(batch) >= 5000:
                new_c.executemany(
                    f"INSERT OR REPLACE INTO stock VALUES ({','.join(['?']*len(new_row))})",
                    batch
                )
                batch = []

        if batch:
            new_c.executemany(
                f"INSERT OR REPLACE INTO stock VALUES ({','.join(['?']*len(batch[0]))})",
                batch
            )
        new_conn.commit()
        print(f"    Stock: {count:,} registros migrados")

        new_conn.close()

    old_conn.close()
    print(f"\nMigracion completa. La DB antigua se conserva como backup en {old_path}")


def show_status():
    """Muestra estado de la DB."""
    if not os.path.exists(DB_PATH):
        print(f"DB no existe: {DB_PATH}")
        print("Ejecutar: python data_warehouse.py init")
        return

    conn = get_connection()
    c = conn.cursor()

    sales_count = c.execute("SELECT COUNT(*) FROM sales").fetchone()[0]
    stock_count = c.execute("SELECT COUNT(*) FROM stock").fetchone()[0]
    sales_dates = c.execute("SELECT MIN(fecha), MAX(fecha), COUNT(DISTINCT fecha) FROM sales").fetchone()
    stock_dates = c.execute("SELECT MIN(fecha), MAX(fecha), COUNT(DISTINCT fecha) FROM stock").fetchone()
    sales_chains = c.execute("SELECT DISTINCT sub_cadena FROM sales ORDER BY sub_cadena").fetchall()
    pulls = c.execute("SELECT * FROM pull_log ORDER BY pull_id DESC LIMIT 5").fetchall()

    db_size = os.path.getsize(DB_PATH)

    print(f"\n{'='*60}")
    print(f"  TBC Sell Out Data Warehouse")
    print(f"{'='*60}")
    print(f"  DB: {DB_PATH}")
    print(f"  Tamano: {db_size / (1024*1024):.1f} MB")
    print(f"\n  VENTAS:")
    print(f"    Registros: {sales_count:,}")
    print(f"    Fechas: {sales_dates[0]} a {sales_dates[1]} ({sales_dates[2]} dias)")
    print(f"    Cadenas: {', '.join(r[0] for r in sales_chains)}")
    print(f"\n  STOCK:")
    print(f"    Registros: {stock_count:,}")
    print(f"    Fechas: {stock_dates[0]} a {stock_dates[1]} ({stock_dates[2]} dias)")

    if pulls:
        print(f"\n  ULTIMAS INGESTAS:")
        for p in pulls:
            print(f"    [{p[1][:16]}] {p[2]}: {p[4]:,} nuevos, {p[5]:,} actualizados de {p[3]:,} leidos")

    conn.close()
    print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python data_warehouse.py [init|ingest|ingest-sales|ingest-stock|status|migrate]")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == 'init':
        init_db()
    elif cmd == 'ingest':
        if not os.path.exists(DB_PATH):
            init_db()
        ingest_sales()
        ingest_stock()
        show_status()
    elif cmd == 'ingest-sales':
        if not os.path.exists(DB_PATH):
            init_db()
        ingest_sales()
    elif cmd == 'ingest-stock':
        if not os.path.exists(DB_PATH):
            init_db()
        ingest_stock()
    elif cmd == 'status':
        show_status()
    elif cmd == 'migrate':
        migrate_old_db()
    else:
        print(f"Comando desconocido: {cmd}")
        sys.exit(1)
