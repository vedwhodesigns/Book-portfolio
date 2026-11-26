# Video Lab, cloud half: yt-dlp finds the video file(s) behind a YouTube / Instagram / TikTok link.
# Called only by Postroom itself (x-cron-secret). Returns the info and direct file URLs; Node downloads and measures.
# YouTube blocks cloud servers: set YTDLP_PROXY (a residential proxy URL) to make YouTube links work.
import json
import os
import hmac
from http.server import BaseHTTPRequestHandler

import yt_dlp

KEEP = ('id', 'title', 'description', 'uploader', 'uploader_id', 'channel', 'channel_id', 'webpage_url', 'extractor_key',
        'duration', 'timestamp', 'upload_date', 'view_count', 'like_count', 'comment_count', 'tags', 'width', 'height')


def pick(info):
    out = {k: info.get(k) for k in KEEP}
    fmts = []
    for f in info.get('formats') or []:
        if not f.get('url') or f.get('protocol') not in (None, 'https', 'http'):
            continue
        fmts.append({k: f.get(k) for k in ('format_id', 'ext', 'vcodec', 'acodec', 'height', 'width', 'tbr', 'filesize', 'url', 'http_headers')})
    out['formats'] = fmts
    subs = {}
    for src in ('subtitles', 'automatic_captions'):
        for lang, items in (info.get(src) or {}).items():
            if not (lang == 'en' or lang.startswith('en-')) or lang in subs:
                continue
            vtt = [x for x in items if x.get('ext') == 'vtt']
            if vtt:
                subs[lang] = vtt[0]['url']
    out['subtitles'] = subs
    return out


class handler(BaseHTTPRequestHandler):
    def _send(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        secret = os.environ.get('CRON_SECRET', '')
        if not secret or not hmac.compare_digest(self.headers.get('x-cron-secret', ''), secret):
            return self._send(401, {'error': 'Bad secret'})
        try:
            n = int(self.headers.get('content-length') or 0)
            url = json.loads(self.rfile.read(n) or b'{}').get('url', '')
            if not url.startswith('https://'):
                return self._send(400, {'error': 'Send an https link.'})
            opts = {'quiet': True, 'no_warnings': True, 'skip_download': True, 'noplaylist': True, 'cachedir': False}
            if os.environ.get('YTDLP_PROXY'):
                opts['proxy'] = os.environ['YTDLP_PROXY']
            with yt_dlp.YoutubeDL(opts) as y:
                info = y.extract_info(url, download=False)
            if info.get('_type') == 'playlist' and info.get('entries'):
                info = next(e for e in info['entries'] if e)
            return self._send(200, pick(info))
        except Exception as e:  # yt-dlp's own message says what went wrong (login, private, removed, bot check)
            msg = str(e).replace('\x1b[0;31m', '').replace('\x1b[0m', '')
            return self._send(422, {'error': msg[:600]})
