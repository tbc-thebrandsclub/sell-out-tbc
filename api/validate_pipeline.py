"""
============================================================
Pipeline Validator - Verifica integridad de datos post-pull
============================================================
Uso:
  python validate_pipeline.py              # Validar todo
  python validate_pipeline.py --sales      # Solo sales
  python validate_pipeline.py --stock      # Solo stock
  python validate_pipeline.py --db         # Solo DB

Genera: data/pipeline_status.json (leido por el dashboard)
Exit codes: 0 = OK, 1 = WARNING, 2 = ERROR
============================================================
"""

import csv
import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_CURRENT_YEAR = datetime.now().year
# DB vive fuera de Google Drive para evitar problemas de sincronizacion
_DB_DIR = r"C:\TBC-Data"
DB_PATH = os.path.join(_DB_DIR, f"sellout_{_CURRENT_YEAR}.db")
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.join(DATA_DIR, f"sellout_{_CURRENT_YEAR}.db")
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.join(DATA_DIR, "sellout.db")
STATUS_PATH = os.path.join(DATA_DIR, "pipeline_status.json")

# ── Umbrales de validacion ──────────────────────────────

MIN_SALES_RECORDS = 1000        # Minimo registros por pull de sales
MIN_STOCK_RECORDS = 5000        # Minimo registros por pull de stock
MIN_SALES_DATES = 5             # Minimo dias distintos en sales
MAX_STALE_DAYS = 5              # Dias sin datos frescos = WARNING
EXPECTED_CHAINS = ['Jumbo', 'Ripley', 'Paris', 'Hites', 'La Polar', 'Falabella', 'Tottus']
MIN_CHAINS = 5                  # Al menos 5 cadenas presentes


def log(level, msg):
    icons = {'OK': '[OK]', 'WARN': '[!!]', 'FAIL': '[XX]', 'INFO': '[--]'}
    print("  %s %s" % (icons.get(level, '[??]'), msg))


def validate_csv(filepath, name, min_records, required_cols):
    """Valida que un CSV exista, tenga datos y columnas esperadas."""
    results = []

    if not os.path.exists(filepath):
        results.append(('FAIL', '%s: Archivo no encontrado' % name))
        return results

    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    if size_mb < 0.01:
        results.append(('FAIL', '%s: Archivo vacio (%.2f MB)' % (name, size_mb)))
        return results

    results.append(('OK', '%s: Archivo existe (%.1f MB)' % (name, size_mb)))

    # Detect encoding
    encoding = 'latin-1'
    for enc in ['utf-8-sig', 'utf-8', 'latin-1']:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                f.readline()
            encoding = enc
            break
        except (UnicodeDecodeError, UnicodeError):
            continue

    # Read and validate
    try:
        with open(filepath, 'r', encoding=encoding) as f:
            first_line = f.readline()
        delimiter = ';' if first_line.count(';') > first_line.count(',') else ','

        with open(filepath, 'r', encoding=encoding) as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            headers = reader.fieldnames or []
            row_count = sum(1 for _ in reader)

        # Check record count
        if row_count >= min_records:
            results.append(('OK', '%s: %s registros (min: %s)' % (name, '{:,}'.format(row_count), '{:,}'.format(min_records))))
        elif row_count > 0:
            results.append(('WARN', '%s: Solo %s registros (esperado >%s)' % (name, '{:,}'.format(row_count), '{:,}'.format(min_records))))
        else:
            results.append(('FAIL', '%s: 0 registros' % name))

        # Check required columns
        for col in required_cols:
            found = any(col.lower() in h.lower() for h in headers)
            if not found:
                results.append(('WARN', '%s: Columna "%s" no encontrada' % (name, col)))

    except Exception as e:
        results.append(('FAIL', '%s: Error leyendo CSV: %s' % (name, str(e))))

    return results


def validate_db():
    """Valida integridad de la base de datos SQLite."""
    results = []

    if not os.path.exists(DB_PATH):
        results.append(('FAIL', f'DB: {os.path.basename(DB_PATH)} no existe'))
        return results, {}

    size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)
    results.append(('OK', 'DB: %s (%.1f MB)' % (os.path.basename(DB_PATH), size_mb)))

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    db_meta = {}

    try:
        # Sales validation
        sales_count = c.execute("SELECT COUNT(*) FROM sales").fetchone()[0]
        sales_dates = c.execute("SELECT MIN(fecha), MAX(fecha), COUNT(DISTINCT fecha) FROM sales").fetchone()
        sales_chains = c.execute("SELECT DISTINCT sub_cadena FROM sales").fetchall()
        chain_names = [r[0] for r in sales_chains]

        db_meta['sales_count'] = sales_count
        db_meta['sales_date_from'] = sales_dates[0]
        db_meta['sales_date_to'] = sales_dates[1]
        db_meta['sales_days'] = sales_dates[2]
        db_meta['sales_chains'] = chain_names

        if sales_count > 0:
            results.append(('OK', 'DB Sales: %s registros, %d dias' % ('{:,}'.format(sales_count), sales_dates[2])))
        else:
            results.append(('FAIL', 'DB Sales: 0 registros'))

        if sales_dates[2] >= MIN_SALES_DATES:
            results.append(('OK', 'DB Sales: %d dias (min: %d)' % (sales_dates[2], MIN_SALES_DATES)))
        else:
            results.append(('WARN', 'DB Sales: Solo %d dias (min: %d)' % (sales_dates[2], MIN_SALES_DATES)))

        # Check chain coverage
        missing = [ch for ch in EXPECTED_CHAINS if ch not in chain_names]
        if len(chain_names) >= MIN_CHAINS:
            results.append(('OK', 'DB Sales: %d cadenas presentes' % len(chain_names)))
        else:
            results.append(('WARN', 'DB Sales: Solo %d cadenas (min: %d). Faltan: %s' % (len(chain_names), MIN_CHAINS, ', '.join(missing))))

        # Stock validation
        stock_count = c.execute("SELECT COUNT(*) FROM stock").fetchone()[0]
        stock_dates = c.execute("SELECT MIN(fecha), MAX(fecha), COUNT(DISTINCT fecha) FROM stock").fetchone()

        db_meta['stock_count'] = stock_count
        db_meta['stock_date_from'] = stock_dates[0]
        db_meta['stock_date_to'] = stock_dates[1]
        db_meta['stock_days'] = stock_dates[2]

        if stock_count > 0:
            results.append(('OK', 'DB Stock: %s registros, %d dias' % ('{:,}'.format(stock_count), stock_dates[2])))
        else:
            results.append(('WARN', 'DB Stock: 0 registros'))

        # Check OOS
        oos_count = c.execute("SELECT COUNT(*) FROM stock WHERE quiebres > 0").fetchone()[0]
        oos_pct = (oos_count / stock_count * 100) if stock_count > 0 else 0
        db_meta['oos_count'] = oos_count
        db_meta['oos_pct'] = round(oos_pct, 1)

        if oos_pct > 20:
            results.append(('WARN', 'DB Stock: %.1f%% OOS (alto, revisar)' % oos_pct))
        else:
            results.append(('OK', 'DB Stock: %.1f%% OOS' % oos_pct))

        # Freshness check - parse dates YYYY-MM-DD (or dd-mm-yyyy fallback)
        try:
            latest = sales_dates[1]
            parts = latest.split('-')
            if len(parts) == 3:
                if len(parts[0]) == 4:  # YYYY-MM-DD
                    latest_dt = datetime(int(parts[0]), int(parts[1]), int(parts[2]))
                else:  # dd-mm-yyyy fallback
                    latest_dt = datetime(int(parts[2]), int(parts[1]), int(parts[0]))
                days_old = (datetime.now() - latest_dt).days
                db_meta['days_since_latest'] = days_old

                if days_old <= 2:
                    results.append(('OK', 'Frescura: Datos de hace %d dias' % days_old))
                elif days_old <= MAX_STALE_DAYS:
                    results.append(('WARN', 'Frescura: Datos de hace %d dias (actualizar pronto)' % days_old))
                else:
                    results.append(('FAIL', 'Frescura: Datos de hace %d dias (DESACTUALIZADO)' % days_old))
        except (ValueError, IndexError):
            results.append(('WARN', 'Frescura: No se pudo parsear fecha "%s"' % sales_dates[1]))

        # Pull log
        last_pull = c.execute("SELECT pull_date FROM pull_log ORDER BY pull_id DESC LIMIT 1").fetchone()
        if last_pull:
            db_meta['last_pull'] = last_pull[0]
            results.append(('INFO', 'Ultimo pull: %s' % last_pull[0][:16]))

    except Exception as e:
        results.append(('FAIL', 'DB Error: %s' % str(e)))

    conn.close()
    return results, db_meta


def validate_dashboard_data():
    """Verifica que real_data.js exista y tenga contenido."""
    results = []
    rdjs = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dashboard", "real_data.js")

    if not os.path.exists(rdjs):
        results.append(('FAIL', 'Dashboard: real_data.js no existe'))
        return results

    size_kb = os.path.getsize(rdjs) / 1024
    if size_kb > 10:
        results.append(('OK', 'Dashboard: real_data.js (%.0f KB)' % size_kb))
    else:
        results.append(('WARN', 'Dashboard: real_data.js muy pequeno (%.0f KB)' % size_kb))

    return results


def generate_status(all_results, db_meta):
    """Genera pipeline_status.json para el dashboard."""
    fails = sum(1 for level, _ in all_results if level == 'FAIL')
    warns = sum(1 for level, _ in all_results if level == 'WARN')

    if fails > 0:
        overall = 'error'
    elif warns > 0:
        overall = 'warning'
    else:
        overall = 'ok'

    status = {
        'timestamp': datetime.now().isoformat(),
        'overall': overall,
        'fails': fails,
        'warnings': warns,
        'checks': [{'level': level, 'message': msg} for level, msg in all_results],
        'db': db_meta,
    }

    with open(STATUS_PATH, 'w', encoding='utf-8') as f:
        json.dump(status, f, indent=2, ensure_ascii=False)

    return overall


def main():
    print("\n" + "=" * 60)
    print("  TBC Sell Out - Pipeline Validator")
    print("  %s" % datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    print("=" * 60)

    args = sys.argv[1:] if len(sys.argv) > 1 else ['--all']
    all_results = []
    db_meta = {}

    if '--all' in args or '--sales' in args:
        print("\n  --- Validando Sales CSV ---")
        r = validate_csv(
            os.path.join(DATA_DIR, "sales_latest.csv"),
            "Sales CSV",
            MIN_SALES_RECORDS,
            ['Fechas', 'Local', 'Sub Cadena', 'Unidades']
        )
        all_results.extend(r)
        for level, msg in r:
            log(level, msg)

    if '--all' in args or '--stock' in args:
        print("\n  --- Validando Stock CSV ---")
        r = validate_csv(
            os.path.join(DATA_DIR, "stock_latest.csv"),
            "Stock CSV",
            MIN_STOCK_RECORDS,
            ['Fechas', 'Local', 'Stock Total']
        )
        all_results.extend(r)
        for level, msg in r:
            log(level, msg)

    if '--all' in args or '--db' in args:
        print("\n  --- Validando Base de Datos ---")
        r, db_meta = validate_db()
        all_results.extend(r)
        for level, msg in r:
            log(level, msg)

    if '--all' in args:
        print("\n  --- Validando Dashboard ---")
        r = validate_dashboard_data()
        all_results.extend(r)
        for level, msg in r:
            log(level, msg)

    # Generate status file
    overall = generate_status(all_results, db_meta)

    fails = sum(1 for level, _ in all_results if level == 'FAIL')
    warns = sum(1 for level, _ in all_results if level == 'WARN')
    oks = sum(1 for level, _ in all_results if level == 'OK')

    print("\n" + "=" * 60)
    if overall == 'ok':
        print("  RESULTADO: TODO OK (%d checks passed)" % oks)
    elif overall == 'warning':
        print("  RESULTADO: WARNING (%d ok, %d advertencias)" % (oks, warns))
    else:
        print("  RESULTADO: ERROR (%d ok, %d advertencias, %d errores)" % (oks, warns, fails))
    print("  Status guardado en: %s" % STATUS_PATH)
    print("=" * 60 + "\n")

    if fails > 0:
        sys.exit(2)
    elif warns > 0:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
