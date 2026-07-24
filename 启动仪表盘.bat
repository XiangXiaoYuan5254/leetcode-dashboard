@echo off
chcp 65001 >nul
rem 双击本文件即可启动力扣刷题统计仪表盘（Windows）。
rem 保持本窗口开着即服务运行；关闭窗口 = 停止服务。
cd /d "%~dp0"
set PORT=5881
set /p EXPECTED_VERSION=<VERSION
set RUNNING_VERSION=NONE

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先到 https://nodejs.org/ 安装 LTS 版本，装完重新双击本文件
  pause
  exit /b 1
)

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { $r=Invoke-RestMethod 'http://127.0.0.1:%PORT%/api/status' -TimeoutSec 1; if ($r.appVersion) { $r.appVersion } else { 'OLD' } } catch { 'NONE' }"`) do set RUNNING_VERSION=%%i
if "%RUNNING_VERSION%"=="%EXPECTED_VERSION%" (
  echo 当前版本服务已在运行，正在打开浏览器……
  start "" "http://127.0.0.1:5881"
  exit /b 0
)
if not "%RUNNING_VERSION%"=="NONE" (
  echo 检测到 5881 端口正在运行旧版仪表盘。
  echo 请先关闭旧版仪表盘的终端窗口，再重新双击本文件。
  pause
  exit /b 1
)

echo ======================================
echo   力扣刷题统计  http://127.0.0.1:5881
echo   保持本窗口开着；关闭窗口即停止服务
echo ======================================
start "" "http://127.0.0.1:5881"
node server.js
pause
