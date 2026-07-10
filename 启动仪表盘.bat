@echo off
chcp 65001 >nul
rem 双击本文件即可启动力扣刷题统计仪表盘（Windows）。
rem 保持本窗口开着即服务运行；关闭窗口 = 停止服务。
cd /d "%~dp0"
set PORT=5881

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先到 https://nodejs.org/ 安装 LTS 版本，装完重新双击本文件
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
