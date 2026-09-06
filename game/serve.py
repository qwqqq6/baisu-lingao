# -*- coding: utf-8 -*-
"""本地开发服务器：在普通静态服务上加 no-cache 响应头，避免改代码后浏览器用旧缓存。

用法：在 game 目录下运行  python serve.py [端口]   （默认 8080）
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"临高启明·执政者  ->  http://localhost:{PORT}")
    httpd.serve_forever()
