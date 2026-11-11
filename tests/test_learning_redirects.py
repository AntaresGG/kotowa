"""Production redirect configuration can be checked without changing Nginx."""
from pathlib import Path
import runpy

import pytest

helpers = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/configure-learning-redirects.py'))


def test_redirects_preserve_query_and_scope_the_migration_frame_policy():
    source = helpers['build_snippet']('https://study.example.org/', Path('/srv/site/current/legacy-migration/index.html'))
    for old, new in [('a', 'word-classes'), ('b', 'kana'), ('c', 'verbs')]:
        assert f'location = /{old} ' in source
        assert f'location ^~ /{old}/ ' in source
        assert f'return 301 "https://study.example.org/learn/{new}/$is_args$args";' in source
    assert 'location = /_kotowa-migration/' in source
    assert 'frame-ancestors https://study.example.org' in source
    assert 'Cache-Control "no-store" always' in source
    assert 'X-Frame-Options' not in source
    assert 'location / {' not in source


@pytest.mark.parametrize('url', ['http://study.example.org/', 'https://user:password@example.org/', 'https://example.org/?x=y', 'https://example.org/#fragment'])
def test_reject_invalid_production_targets(url):
    with pytest.raises(ValueError):
        helpers['build_snippet'](url, Path('/srv/current/legacy-migration/index.html'))
