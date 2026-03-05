@echo off
chcp 65001 >nul 2>&1
echo.
echo ============================================================
echo   TBC Sell Out - Actualizacion de Datos
echo   %date% %time:~0,8%
echo ============================================================
echo.

cd /d "%~dp0"

:: ── Paso 0: Backup preventivo ────────────────────────────
echo [0/4] Creando backup preventivo...
python -c "import shutil,os;from datetime import datetime;ts=datetime.now().strftime('%%Y-%%m-%%d_%%H%%M');d='data/pulls';os.makedirs(d,exist_ok=True);src='data/sellout.db';dst=os.path.join(d,'sellout_'+ts+'_pre-pull.db');shutil.copy2(src,dst) if os.path.exists(src) else None;print('  Backup: '+dst if os.path.exists(src) else '  Sin DB previa')"
echo.

:: ── Paso 1: Descargar datos desde API ────────────────────
echo [1/4] Descargando datos desde InstoreView API...
python api/pull_data.py --all
if errorlevel 1 (
    echo.
    echo   *** ERROR: Fallo la descarga de datos ***
    echo   Verifica tu conexion a internet y el token API.
    echo   Los datos anteriores NO fueron modificados.
    echo.
    pause
    exit /b 1
)
echo.

:: ── Paso 2: Ingresar datos a SQLite ─────────────────────
echo [2/4] Ingresando datos a SQLite (deduplicacion automatica)...
python api/data_warehouse.py ingest
if errorlevel 1 (
    echo.
    echo   *** ERROR: Fallo la ingesta a SQLite ***
    echo   El backup esta disponible en data/pulls/
    echo.
    pause
    exit /b 1
)
echo.

:: ── Paso 3: Generar datos para dashboard ────────────────
echo [3/4] Generando datos para dashboard...
python api/process_for_dashboard.py
if errorlevel 1 (
    echo.
    echo   *** ERROR: Fallo el procesamiento ***
    echo.
    pause
    exit /b 1
)
echo.

:: ── Paso 4: Validacion de integridad ────────────────────
echo [4/4] Validando integridad de datos...
python api/validate_pipeline.py
if errorlevel 2 (
    echo.
    echo   *** ATENCION: Se detectaron ERRORES en los datos ***
    echo   Revisa los mensajes arriba antes de usar el dashboard.
    echo   El backup esta disponible en data/pulls/
    echo.
    pause
    exit /b 1
)
if errorlevel 1 (
    echo.
    echo   NOTA: Hay advertencias menores. Los datos son usables
    echo   pero revisa los mensajes arriba para mas detalle.
    echo.
)

echo.
echo ============================================================
echo   Actualizacion completada!
echo   Abre dashboard/index.html para ver los datos actualizados.
echo ============================================================
echo.
pause
