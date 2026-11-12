"""Loopback-only browser preview. The installed Tizen app does not need this server."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def make_server(port=8765, desktop=None):
    siblings = Path(__file__).resolve().parents[2]
    adapter_path = Path(desktop) if desktop else next((path for path in [siblings/'MovieBoxDesktop', siblings/'moviebox-desktop'] if (path/'service.py').is_file()), siblings/'MovieBoxDesktop')
    sys.path.insert(0, str(adapter_path))
    from service import MovieBoxService
    from media_bridge import MediaBridge
    api, bridge = MovieBoxService(), MediaBridge()
    root = Path(__file__).resolve().parents[1] / 'app'

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def log_message(self, *args):
            pass

        def do_POST(self):
            if self.path != '/dev-api':
                self.send_error(404)
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 65536:
                    raise ValueError('Invalid request size')
                body = json.loads(self.rfile.read(length))
                method, args = body.get('method'), body.get('args') or []
                if method == 'text':
                    url = args[0]
                    host = (urlsplit(url).hostname or '').lower()
                    allowed = ('aoneroom.com', 'hakunaymatata.com')
                    if urlsplit(url).scheme != 'https' or not any(host == domain or host.endswith('.'+domain) for domain in allowed):
                        raise ValueError('Only service subtitle URLs are allowed in preview')
                    with urlopen(Request(url, headers={'User-Agent': api.native.user_agent}), timeout=15) as response:
                        result = response.read(4 * 1024 * 1024).decode('utf-8-sig', errors='replace')
                elif method in ('home', 'search', 'suggest', 'detail', 'playback', 'captions'):
                    result = getattr(api, method)(*args)
                    if method == 'playback':
                        result = [{**stream, 'url': bridge.register(stream['url'], stream.get('headers'))} for stream in result]
                else:
                    raise ValueError('Unknown preview method')
                payload, status = {'data': result}, 200
            except Exception as error:
                payload, status = {'error': str(error)}, 400
            data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    server.media_bridge = bridge
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--desktop', help='Path to the sibling MovieBox desktop source')
    options = parser.parse_args()
    server = make_server(options.port, options.desktop)
    print(f'TV browser preview: http://127.0.0.1:{options.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.media_bridge.close()
        server.server_close()
