#!/bin/bash
# 双击本文件即可启动力扣刷题统计仪表盘（macOS）。
# 启动本地服务并自动在浏览器打开。保持本终端窗口开着即可；关闭窗口 = 停止服务。
cd "$(dirname "$0")"
export PORT=5881

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js，请先安装：https://nodejs.org/"
  read -r -p "按回车键退出…"
  exit 1
fi

# 若服务已在运行，直接打开浏览器
if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/api/status"; then
  echo "服务已在运行，正在打开浏览器……"
  open "http://127.0.0.1:$PORT"
  exit 0
fi

echo "======================================"
echo "  力扣刷题统计  http://127.0.0.1:$PORT"
echo "  保持本窗口开着；关闭窗口即停止服务"
echo "======================================"
( sleep 1; open "http://127.0.0.1:$PORT" ) &
exec node server.js
