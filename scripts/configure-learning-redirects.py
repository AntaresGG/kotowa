"""Enable legacy lesson redirects and the same-origin progress bridge on Nginx."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from urllib.parse import urljoin, urlsplit


def quote(value: str) -> str:
    if any(character in value for character in ('\n', '\r', '\x00', '$', '{', '}')):
        raise ValueError('Unsupported Nginx configuration value')
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


def build_snippet(site_url: str, bridge: Path) -> str:
    parsed = urlsplit(site_url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Use an HTTPS production site URL')
    base = site_url.rstrip('/') + '/'
    origin = f'{parsed.scheme}://{parsed.netloc}'
    lines = ['# Kotowa foundation lessons; keep the original files for rollback.']
    for old, new in [('a', 'word-classes'), ('b', 'kana'), ('c', 'verbs')]:
        target = urljoin(base, f'learn/{new}/')
        redirect = quote(target)[:-1] + '$is_args$args"'
        for location in (f'= /{old}', f'^~ /{old}/'):
            lines.append(f'location {location} {{ return 301 {redirect}; }}')
    lines.extend([
        'location = /_kotowa-migration/ {',
        '    rewrite ^ /_kotowa-migration/index.html last;',
        '}',
        'location = /_kotowa-migration/index.html {',
        f'    alias {quote(str(bridge))};',
        '    default_type text/html;',
        '    add_header Cache-Control "no-store" always;',
        # A location with its own add_header does not inherit SAMEORIGIN from the server.
        f'    add_header Content-Security-Policy {quote("frame-ancestors " + origin)} always;',
        '    add_header X-Content-Type-Options "nosniff" always;',
        '}',
    ])
    return '\n'.join(lines) + '\n'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-url', required=True)
    parser.add_argument('--release-root', type=Path, required=True)
    parser.add_argument('--legacy-root', type=Path, required=True)
    parser.add_argument('--nginx-config', type=Path, required=True)
    parser.add_argument('--snippet', type=Path, required=True)
    parser.add_argument('--backup-dir', type=Path, required=True)
    args = parser.parse_args()
    bridge = args.release_root / 'legacy-migration/index.html'
    if not bridge.is_file():
        raise ValueError('Deploy and verify the new release before enabling redirects')
    snippet = build_snippet(args.site_url, bridge)
    for path in (args.release_root, args.legacy_root, args.nginx_config, args.snippet, args.backup_dir):
        if not path.is_absolute():
            raise ValueError('Use absolute deployment paths')
    original = args.nginx_config.read_text(encoding='utf-8')
    include = f'include {quote(str(args.snippet))};'
    updated = original
    if include not in original:
        # Anchor the include in the intended site block, not its HTTP redirect block.
        anchor = re.compile(r'(^\s*root\s+' + re.escape(str(args.legacy_root)) + r';)', re.MULTILINE)
        updated, count = anchor.subn(lambda match: match.group(0) + '\n      ' + include, original)
        if count != 1:
            raise ValueError('Could not uniquely identify the legacy site root')
    previous_snippet = args.snippet.read_bytes() if args.snippet.exists() else None
    backup = args.backup_dir / f'learning-{time.time_ns()}'
    backup.mkdir(parents=True)
    shutil.copy2(args.nginx_config, backup / 'site.conf')
    if previous_snippet is not None:
        (backup / 'snippet.conf').write_bytes(previous_snippet)
    args.snippet.parent.mkdir(parents=True, exist_ok=True)
    args.snippet.write_text(snippet, encoding='utf-8')
    args.nginx_config.write_text(updated, encoding='utf-8')
    try:
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except Exception:
        args.nginx_config.write_text(original, encoding='utf-8')
        if previous_snippet is not None:
            args.snippet.write_bytes(previous_snippet)
        else:
            args.snippet.unlink()
        raise
    print(json.dumps({'ok': True, 'backup': str(backup), 'redirects': ['a', 'b', 'c']}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'ok': False, 'stage': 'legacy-redirects', 'message': str(error)}), file=sys.stderr)
        sys.exit(1)
