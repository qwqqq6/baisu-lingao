@echo off
chcp 65001 >nul
title 百日临高：执委会裁断 - 本地服务器（关闭此窗口即停止）
cd /d "%~dp0"

set PORT=8123

echo ============================================================
echo   百日临高：执委会裁断
echo   正在启动本地服务器 http://localhost:%PORT%/index.html
echo   浏览器会自动打开；保持本窗口开着，关闭即停止服务器。
echo ============================================================
echo.

rem 延迟 2 秒后自动打开浏览器（等服务器就绪），不阻塞下面的服务器进程。
start "" cmd /c "timeout /t 2 >nul & start "" http://localhost:%PORT%/index.html"

rem 优先用 python，退回到 py 启动器。服务器在本窗口前台运行。
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT% --directory web
) else (
  py -m http.server %PORT% --directory web
)

echo.
echo 服务器已停止。按任意键关闭窗口。
pause >nul
