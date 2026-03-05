"""
============================================================
InstoreView API - Test de Conexión
============================================================
Ejecutar: python test_connection.py
Este script verifica paso a paso que la API funcione.
============================================================
"""

import requests
import json
import sys
import os
from datetime import datetime, timedelta

# Importar configuración
from config import ISV_TOKEN, ENDPOINTS, get_headers


def print_step(num, title):
    print(f"\n{'='*60}")
    print(f"  PASO {num}: {title}")
    print(f"{'='*60}")


def print_ok(msg):
    print(f"  [OK] {msg}")


def print_fail(msg):
    print(f"  [FAIL] {msg}")


def print_info(msg):
    print(f"  [INFO] {msg}")


def check_token():
    """Paso 1: Verificar que el token está configurado"""
    print_step(1, "Verificar Token")

    if ISV_TOKEN == "TU_TOKEN_AQUI" or not ISV_TOKEN:
        print_fail("Token no configurado.")
        print_info("Abre api/config.py y reemplaza ISV_TOKEN con tu token real.")
        print_info("Si no tienes token, solicítalo a: soporte@instoreview.com")
        return False

    print_ok(f"Token configurado: {ISV_TOKEN[:8]}...{ISV_TOKEN[-4:]}")
    return True


def test_master_stores():
    """Paso 2: Descargar maestra de tiendas (GET simple)"""
    print_step(2, "Maestra de Tiendas (GET)")
    print_info(f"URL: {ENDPOINTS['master_stores']}")

    try:
        resp = requests.get(
            ENDPOINTS["master_stores"],
            headers=get_headers(),
            timeout=30
        )
        print_info(f"HTTP Status: {resp.status_code}")

        if resp.status_code == 200:
            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text[:500]
            if isinstance(data, list):
                print_ok(f"Recibidas {len(data)} tiendas")
                if len(data) > 0:
                    print_info(f"Ejemplo primera tienda: {json.dumps(data[0], ensure_ascii=False, indent=2)[:300]}")
            elif isinstance(data, dict):
                print_ok(f"Respuesta recibida. Keys: {list(data.keys())[:10]}")
            else:
                print_ok(f"Respuesta recibida ({len(str(data))} chars)")
            return True
        elif resp.status_code == 401:
            print_fail("Token inválido o expirado (401 Unauthorized)")
            print_info("Verifica tu token en config.py o solicita uno nuevo a soporte@instoreview.com")
            return False
        elif resp.status_code == 403:
            print_fail("Acceso denegado (403 Forbidden)")
            return False
        else:
            print_fail(f"Respuesta inesperada: {resp.status_code}")
            print_info(f"Body: {resp.text[:300]}")
            return False

    except requests.exceptions.ConnectionError:
        print_fail("No se pudo conectar a la API. Verifica tu conexión a internet.")
        return False
    except requests.exceptions.Timeout:
        print_fail("Timeout - la API no respondió en 30 segundos.")
        return False
    except Exception as e:
        print_fail(f"Error inesperado: {e}")
        return False


def test_master_products():
    """Paso 3: Descargar maestra de productos"""
    print_step(3, "Maestra de Productos (GET)")
    print_info(f"URL: {ENDPOINTS['master_products']}")

    try:
        resp = requests.get(
            ENDPOINTS["master_products"],
            headers=get_headers(),
            timeout=30
        )
        print_info(f"HTTP Status: {resp.status_code}")

        if resp.status_code == 200:
            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text[:500]
            if isinstance(data, list):
                print_ok(f"Recibidos {len(data)} productos")
                if len(data) > 0:
                    print_info(f"Ejemplo primer producto: {json.dumps(data[0], ensure_ascii=False, indent=2)[:300]}")
            else:
                print_ok(f"Respuesta recibida")
            return True
        else:
            print_fail(f"HTTP {resp.status_code}: {resp.text[:200]}")
            return False

    except Exception as e:
        print_fail(f"Error: {e}")
        return False


def test_sales_api():
    """Paso 4: Probar endpoint de ventas con fecha reciente"""
    print_step(4, "API de Ventas (POST)")
    print_info(f"URL: {ENDPOINTS['sales']}")

    # Usar una fecha de hace 3 días para tener data disponible
    test_date = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d")
    print_info(f"Fecha de prueba: {test_date}")

    payload = {
        "view_type": "diario",
        "dates": [test_date],
        "views": ["Unidades", "Ventas B2B"],
        "format": "csv",
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

    print_info(f"Payload: {json.dumps(payload, indent=2)}")

    try:
        resp = requests.post(
            ENDPOINTS["sales"],
            headers=get_headers(),
            json=payload,
            timeout=60
        )
        print_info(f"HTTP Status: {resp.status_code}")

        if resp.status_code == 200:
            body = resp.text.strip()
            # La API devuelve un link S3 para descargar
            if "s3.amazonaws.com" in body or "http" in body.lower():
                print_ok(f"Link de descarga recibido:")
                print_info(f"  {body[:200]}")
                print_info("La API funciona correctamente. El link permite descargar el CSV/ZIP.")
            else:
                print_ok(f"Respuesta recibida ({len(body)} chars)")
                print_info(f"  {body[:300]}")
            return True
        elif resp.status_code == 401:
            print_fail("Token inválido (401)")
            return False
        else:
            print_fail(f"HTTP {resp.status_code}")
            print_info(f"Body: {resp.text[:300]}")
            return False

    except Exception as e:
        print_fail(f"Error: {e}")
        return False


def test_stock_api():
    """Paso 5: Probar endpoint de stock"""
    print_step(5, "API de Stock (POST)")
    print_info(f"URL: {ENDPOINTS['stock']}")

    test_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    print_info(f"Fecha de prueba: {test_date}")

    payload = {
        "dates": [test_date],
        "views": ["Unidades"],
        "format": "csv",
        "in_stock": True,
        "over_stock": False,
        "alerts_mix": False,
        "chain_codes": [],
        "hierarchy": {
            "Canal": [],
            "Sub Cadena": [],
            "Nombre Local": [],
            "Local": [],
            "Propiedad": [],
            "Descripción Producto": [],
            "Código Interno": []
        }
    }

    try:
        resp = requests.post(
            ENDPOINTS["stock"],
            headers=get_headers(),
            json=payload,
            timeout=180
        )
        print_info(f"HTTP Status: {resp.status_code}")

        if resp.status_code == 200:
            body = resp.text.strip()
            if "s3.amazonaws.com" in body or "http" in body.lower():
                print_ok(f"Link de descarga recibido:")
                print_info(f"  {body[:200]}")
            else:
                print_ok(f"Respuesta recibida ({len(body)} chars)")
                print_info(f"  {body[:300]}")
            return True
        else:
            print_fail(f"HTTP {resp.status_code}: {resp.text[:200]}")
            return False

    except Exception as e:
        print_fail(f"Error: {e}")
        return False


def main():
    print("\n" + "="*60)
    print("  TBC - InstoreView API Connection Test")
    print("="*60)

    results = {}

    # Paso 1: Token
    if not check_token():
        print("\n" + "="*60)
        print("  RESULTADO: Configura tu token primero en api/config.py")
        print("="*60)
        sys.exit(1)

    # Paso 2: Maestra tiendas
    results["Maestra Tiendas"] = test_master_stores()

    # Paso 3: Maestra productos
    results["Maestra Productos"] = test_master_products()

    # Paso 4: Ventas
    results["API Ventas"] = test_sales_api()

    # Paso 5: Stock
    results["API Stock"] = test_stock_api()

    # Resumen
    print("\n" + "="*60)
    print("  RESUMEN DE CONEXIÓN")
    print("="*60)
    for test_name, passed in results.items():
        status = "[OK]" if passed else "[FAIL]"
        print(f"  {status} {test_name}")

    all_ok = all(results.values())
    print(f"\n  {'TODOS LOS TESTS PASARON' if all_ok else 'ALGUNOS TESTS FALLARON'}")
    print("="*60)

    if all_ok:
        print("\n  Siguiente paso: ejecuta 'python pull_data.py' para descargar datos")

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
