@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ==========================================
echo   小账本 · 本地预览
echo ==========================================
echo.
echo 电脑上打开:  http://localhost:8080
echo 手机上打开:  http://本机局域网IP:8080
echo              (手机和电脑要连同一个 Wi-Fi)
echo.
echo 查看本机 IP: 在另一个窗口运行 ipconfig
echo 关闭预览:    在这个窗口按 Ctrl+C
echo.
python -m http.server 8080