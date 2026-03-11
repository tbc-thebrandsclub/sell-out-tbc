"""
============================================================
InstoreView API - Descarga de Datos
============================================================
Ejecutar: python pull_data.py [--sales] [--stock] [--masters] [--all]
Descarga datos de IV y los guarda en /data para el dashboard.
============================================================
"""

import requests
import json
import csv
import io
import os
import sys
import zipfile
import tempfile
from datetime import datetime, timedelta
from config import ISV_TOKEN, ENDPOINTS, get_headers

# Directorio de salida: CSVs pesados van a C:\TBC-Data (fuera de Google Drive)
# Maestras livianas van a data/ (dentro del repo)
_BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(_BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

# Directorio local para archivos pesados (ventas, stock)
LOCAL_DIR = r"C:\TBC-Data"
if os.path.exists(LOCAL_DIR):
    os.makedirs(LOCAL_DIR, exist_ok=True)
else:
    LOCAL_DIR = DATA_DIR  # Fallback si no existe C:\TBC-Data


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"  [{ts}] {msg}")


def download_s3_file(url, filename, dest_dir=None):
    """Descarga un archivo desde el link S3 que devuelve la API"""
    log(f"Descargando desde S3: {filename}")
    resp = requests.get(url, timeout=300)
    if resp.status_code != 200:
        log(f"Error descargando S3: HTTP {resp.status_code}")
        return None

    target_dir = dest_dir or DATA_DIR
    filepath = os.path.join(target_dir, filename)

    content_type = resp.headers.get("content-type", "")
    if "zip" in content_type or url.endswith(".zip"):
        # Extraer CSV del ZIP
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            tmp.write(resp.content)
            tmp_path = tmp.name

        try:
            with zipfile.ZipFile(tmp_path, 'r') as zf:
                csv_files = [f for f in zf.namelist() if f.endswith('.csv')]
                if csv_files:
                    csv_content = zf.read(csv_files[0]).decode('utf-8-sig')
                    csv_name = os.path.basename(filepath).replace('.zip', '.csv')
                    csv_path = os.path.join(target_dir, csv_name)
                    with open(csv_path, 'w', encoding='utf-8') as f:
                        f.write(csv_content)
                    log(f"CSV extraido: {csv_path}")
                    return csv_path
                else:
                    log(f"No se encontró CSV dentro del ZIP")
                    return None
        finally:
            os.unlink(tmp_path)
    else:
        with open(filepath, 'wb') as f:
            f.write(resp.content)
        log(f"Archivo guardado: {filepath}")
        return filepath


def csv_to_json(csv_path, json_path):
    """Convierte CSV a JSON para el dashboard (maneja latin-1 y delimitador ;)"""
    # Detectar encoding
    encoding = 'latin-1'
    for enc in ['utf-8-sig', 'utf-8']:
        try:
            with open(csv_path, 'r', encoding=enc) as f:
                f.read(500)
            encoding = enc
            break
        except UnicodeDecodeError:
            continue

    # Leer sample para detectar delimitador
    with open(csv_path, 'r', encoding=encoding) as f:
        sample = f.readline()
    delimiter = ';' if sample.count(';') > sample.count(',') else ','

    rows = []
    with open(csv_path, 'r', encoding=encoding) as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        for row in reader:
            cleaned = {}
            for k, v in row.items():
                key = k.strip('"').strip() if k else k
                val = v.strip('"').strip() if v else v
                cleaned[key] = val
            rows.append(cleaned)

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

    log(f"JSON generado: {json_path} ({len(rows)} registros)")
    return rows


# ── Maestras ─────────────────────────────────────────────
def pull_masters():
    """Descarga maestras de tiendas, productos y canales"""
    print("\n" + "="*50)
    print("  Descargando Maestras")
    print("="*50)

    for name, url_key in [("stores", "master_stores"), ("products", "master_products"), ("channels", "master_channels")]:
        log(f"Descargando maestra: {name}")
        try:
            # Primero intentar CSV directo
            url = ENDPOINTS[url_key] + "?type=csv"
            resp = requests.get(url, headers=get_headers(), timeout=60)

            if resp.status_code == 200:
                body = resp.text.strip()

                # La API puede devolver un JSON con URL de descarga
                try:
                    data = json.loads(body)
                    if isinstance(data, dict) and ("url" in data or "download_url" in data):
                        s3_url = data.get("url") or data.get("download_url")
                        log(f"Recibido link S3, descargando...")
                        csv_path = download_s3_file(s3_url, f"master_{name}.csv")
                        if csv_path:
                            json_path = os.path.join(DATA_DIR, f"master_{name}.json")
                            csv_to_json(csv_path, json_path)
                        continue
                except (json.JSONDecodeError, ValueError):
                    pass

                # Si no es JSON, es CSV directo
                csv_path = os.path.join(DATA_DIR, f"master_{name}.csv")
                with open(csv_path, 'w', encoding='utf-8') as f:
                    f.write(body)
                log(f"Guardado: {csv_path}")

                json_path = os.path.join(DATA_DIR, f"master_{name}.json")
                csv_to_json(csv_path, json_path)
            else:
                log(f"Error HTTP {resp.status_code}: {resp.text[:200]}")

        except Exception as e:
            log(f"Error descargando {name}: {e}")


# ── Ventas ───────────────────────────────────────────────
def pull_sales(days_back=7):
    """Descarga ventas de los últimos N días"""
    print("\n" + "="*50)
    print(f"  Descargando Ventas (últimos {days_back} días)")
    print("="*50)

    dates = []
    for i in range(days_back):
        d = (datetime.now() - timedelta(days=i+1)).strftime("%Y-%m-%d")
        dates.append(d)

    log(f"Fechas: {dates[0]} a {dates[-1]}")

    payload = {
        "view_type": "diario",
        "dates": dates,
        "views": ["Unidades", "Costos B2B", "Ventas B2B", "Valores PVP s/IVA"],
        "format": "csv",
        "chain_codes": [],
        "hierarchy": {
            "Canal": [],
            "Sub Cadena": [],
            "Región": [],
            "Comuna": [],
            "Supervisor Responsa.": [],
            "Cobertura": [],
            "Nombre Local": [],
            "Local": [],
            "Tipo Cent. Comercial": [],
            "Tipo de Local": [],
            "División": [],
            "Clase": [],
            "Subclase": [],
            "Categoría": [],
            "Negocio": [],
            "Propiedad": [],
            "Descripción Producto": [],
            "Temporada": [],
            "Divisional": [],
            "Código Interno": []
        }
    }

    try:
        log("Enviando request a API de ventas...")
        resp = requests.post(
            ENDPOINTS["sales"],
            headers=get_headers(),
            json=payload,
            timeout=300
        )
        log(f"HTTP Status: {resp.status_code}")

        if resp.status_code == 200:
            body = resp.text.strip()
            s3_url = _extract_download_url(body)
            if s3_url:
                csv_path = download_s3_file(s3_url, "sales_latest.csv", dest_dir=LOCAL_DIR)
                if csv_path:
                    json_path = os.path.join(LOCAL_DIR, "sales_latest.json")
                    rows = csv_to_json(csv_path, json_path)
                    log(f"Ventas descargadas: {len(rows)} registros")
                    return rows
            else:
                csv_path = os.path.join(LOCAL_DIR, "sales_latest.csv")
                with open(csv_path, 'w', encoding='utf-8') as f:
                    f.write(body)
                json_path = os.path.join(LOCAL_DIR, "sales_latest.json")
                rows = csv_to_json(csv_path, json_path)
                return rows
        else:
            log(f"Error: {resp.text[:300]}")
            return None

    except Exception as e:
        log(f"Error: {e}")
        return None


def _extract_download_url(body):
    """Extrae URL de descarga del body de la respuesta (JSON o texto plano)"""
    try:
        data = json.loads(body)
        if isinstance(data, dict):
            return data.get("download_url") or data.get("url")
    except (json.JSONDecodeError, ValueError):
        pass
    if "http" in body.lower() and "s3.amazonaws.com" in body:
        return body.strip('"').strip("'")
    return None


# ── Stock ────────────────────────────────────────────────
def pull_stock():
    """Descarga stock más reciente de cada cadena"""
    print("\n" + "="*50)
    print("  Descargando Stock (más reciente por cadena)")
    print("="*50)

    # Stock API requiere al menos 1 fecha; usamos los últimos 5 días
    dates = [(datetime.now() - timedelta(days=i+1)).strftime("%Y-%m-%d") for i in range(5)]
    log(f"Fechas: {dates[0]} a {dates[-1]}")

    payload = {
        "dates": dates,
        "views": ["Unidades", "Costos B2B", "Ventas B2B", "Valores PVP s/IVA"],
        "format": "csv",
        "in_stock": True,
        "over_stock": False,
        "alerts_mix": True,
        "chain_codes": [],
        "hierarchy": {
            "Canal": [],
            "Sub Cadena": [],
            "Región": [],
            "Comuna": [],
            "Nombre Local": [],
            "Local": [],
            "Propiedad": [],
            "Descripción Producto": [],
            "Código Interno": []
        }
    }

    try:
        log("Enviando request a API de stock...")
        resp = requests.post(
            ENDPOINTS["stock"],
            headers=get_headers(),
            json=payload,
            timeout=900
        )
        log(f"HTTP Status: {resp.status_code}")

        if resp.status_code == 200:
            body = resp.text.strip()
            s3_url = _extract_download_url(body)
            if s3_url:
                csv_path = download_s3_file(s3_url, "stock_latest.csv", dest_dir=LOCAL_DIR)
                if csv_path:
                    json_path = os.path.join(LOCAL_DIR, "stock_latest.json")
                    rows = csv_to_json(csv_path, json_path)
                    log(f"Stock descargado: {len(rows)} registros")
                    return rows
            else:
                csv_path = os.path.join(LOCAL_DIR, "stock_latest.csv")
                with open(csv_path, 'w', encoding='utf-8') as f:
                    f.write(body)
                json_path = os.path.join(LOCAL_DIR, "stock_latest.json")
                rows = csv_to_json(csv_path, json_path)
                return rows
        else:
            log(f"Error: {resp.text[:300]}")
            return None

    except Exception as e:
        log(f"Error: {e}")
        return None


# ── Main ─────────────────────────────────────────────────
def main():
    print("\n" + "="*60)
    print("  TBC - InstoreView Data Pull")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60)

    if ISV_TOKEN == "TU_TOKEN_AQUI":
        print("\n  ERROR: Configura tu token primero en api/config.py")
        print("  Ejecuta 'python test_connection.py' para verificar.")
        sys.exit(1)

    args = sys.argv[1:] if len(sys.argv) > 1 else ["--all"]

    if "--all" in args or "--masters" in args:
        pull_masters()

    # Soporte --days N para override de ventana de ventas
    sales_days = 14
    for i, a in enumerate(args):
        if a == '--days' and i + 1 < len(args):
            sales_days = int(args[i + 1])

    if "--all" in args or "--sales" in args:
        pull_sales(days_back=sales_days)

    if "--all" in args or "--stock" in args:
        pull_stock()

    print("\n" + "="*60)
    print("  Descarga completada!")
    print(f"  Archivos guardados en: {DATA_DIR}")
    print("="*60)

    # Listar archivos generados
    if os.path.exists(DATA_DIR):
        files = os.listdir(DATA_DIR)
        if files:
            print("\n  Archivos generados:")
            for f in sorted(files):
                size = os.path.getsize(os.path.join(DATA_DIR, f))
                print(f"    {f} ({size:,} bytes)")


if __name__ == "__main__":
    main()
