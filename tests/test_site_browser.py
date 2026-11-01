"""Opt-in browser checks for a built site (OPENJLPT_SITE); no external session is used."""
import functools
import json
import os
import re
import threading
from urllib.parse import urljoin, urlsplit
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(not os.environ.get("OPENJLPT_SITE"), reason="Set OPENJLPT_SITE to a built static site")


def test_download_links_follow_access_origin():
    site = Path(os.environ["OPENJLPT_SITE"]).resolve()
    for path in ("data.html", "n5/vocab.html", "n5/grammar.html", "n5/kanji.html"):
        html = (site / path).read_text(encoding="utf-8")
        links = [href for href in re.findall(r'href="([^"]+)"', html)
                 if "dataset/" in href or "downloads/" in href]
        assert links, path
        for base in ("http://lan.example:8086/", "https://tailnet.example:8446/", "https://example.org/kotowa/"):
            for href in links:
                resolved = urljoin(urljoin(base, path), href)
                assert resolved.startswith(base), (path, href, resolved)
                relative = urlsplit(resolved).path.removeprefix(urlsplit(base).path)
                assert (site / relative).is_file(), (path, href)


def test_site_chinese_search_downloads_and_mobile():
    sync = pytest.importorskip("playwright.sync_api")
    site = Path(os.environ["OPENJLPT_SITE"]).resolve()
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(site))
    server = ThreadingHTTPServer(("127.0.0.1", 8765), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync.sync_playwright() as pw:
            kwargs = {"headless": True}
            if os.environ.get("OPENJLPT_CHROMIUM"):
                kwargs["executable_path"] = os.environ["OPENJLPT_CHROMIUM"]
            browser = pw.chromium.launch(**kwargs)
            try:
                page = browser.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto("http://127.0.0.1:8765/")
                sync.expect(page).to_have_title(re.compile("Kotowa · 词和"))
                sync.expect(page.locator(".brand")).to_have_text("Kotowa · 词和")
                sync.expect(page.locator('link[rel="stylesheet"]')).to_have_attribute("href", re.compile(r"assets/style\.css\?v=[a-f0-9]{12}$"))
                for width in (320, 390, 768, 1024, 1440):
                    page.set_viewport_size({"width": width, "height": 844})
                    assert page.locator(".brand-name").evaluate("""el => {
                        const range = document.createRange();
                        range.selectNodeContents(el);
                        return range.getClientRects().length === 1 &&
                            getComputedStyle(el).whiteSpace === 'nowrap';
                    }"""), width
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), width
                for theme in ('theme2', 'theme1'):
                    page.locator('#theme-switch').press('ArrowRight' if theme == 'theme2' else 'ArrowLeft')
                    for path in ('', 'grammar/te-oku.html', 'flashcards.html', 'n5/'):
                        page.goto(f'http://127.0.0.1:8765/{path}')
                        sync.expect(page.locator('html')).to_have_attribute('data-appearance', theme)
                        sync.expect(page.locator('#theme-switch')).to_have_attribute('aria-checked', str(theme == 'theme2').lower())
                        for width in (320, 390, 768, 1024, 1440):
                            page.set_viewport_size({'width': width, 'height': 900})
                            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (theme, path, width)
                    page.goto('http://127.0.0.1:8765/')
                    page.reload()
                    sync.expect(page.locator('#theme-switch')).to_have_attribute('aria-checked', str(theme == 'theme2').lower())
                toggle = page.locator('#theme-switch')
                toggle.click()
                sync.expect(toggle).to_have_attribute('aria-checked', 'true')
                toggle.press('Space')
                sync.expect(toggle).to_have_attribute('aria-checked', 'false')
                toggle.press('Enter')
                sync.expect(toggle).to_have_attribute('aria-checked', 'true')
                for right in (False, True):
                    box = toggle.bounding_box()
                    left, end = box['x'] + 18, box['x'] + box['width'] - 18
                    start, finish = (left, end) if right else (end, left)
                    page.mouse.move(start, box['y'] + box['height'] / 2)
                    page.mouse.down()
                    page.mouse.move(finish, box['y'] + box['height'] / 2, steps=8)
                    page.mouse.up()
                    sync.expect(toggle).to_have_attribute('aria-checked', str(right).lower())
                page.emulate_media(reduced_motion='reduce')
                assert page.locator('.theme-thumb').evaluate("el => getComputedStyle(el).transitionDuration") == '0s'
                page.emulate_media(color_scheme='dark')
                page.locator('#theme-switch').press('ArrowRight')
                assert page.locator('body').evaluate("el => getComputedStyle(el).backgroundColor") == 'rgb(247, 245, 252)'
                page.locator('#theme-switch').press('ArrowLeft')
                assert page.locator('body').evaluate("el => getComputedStyle(el).backgroundColor") == 'rgb(20, 19, 18)'
                page.emulate_media(color_scheme='light')
                page.evaluate("localStorage.setItem('kotowa:appearance', 'invalid')")
                page.reload()
                sync.expect(page.locator('#theme-switch')).to_have_attribute('aria-checked', 'false')
                blocked = browser.new_context()
                blocked.add_init_script("Object.defineProperty(window, 'localStorage', {get() {throw new Error('Storage blocked')}})")
                blocked_page = blocked.new_page()
                blocked_page.goto('http://127.0.0.1:8765/')
                blocked_page.locator('#theme-switch').press('ArrowRight')
                sync.expect(blocked_page.locator('html')).to_have_attribute('data-appearance', 'theme2')
                blocked.close()
                sync.expect(page.locator(".brand img")).to_have_attribute("src", "assets/favicon.svg")
                sync.expect(page.locator('meta[property="og:site_name"]')).to_have_attribute("content", "Kotowa · 词和")
                sync.expect(page.locator("body")).not_to_contain_text("OpenJLPT-ZH-premium")
                logo = page.request.get("http://127.0.0.1:8765/assets/favicon.svg").text()
                assert "Kotowa" in logo and "あ</text>" not in logo
                hidden_metadata = re.compile("中文试点版|正式稿|审校|已审核|初稿|待复核")
                sync.expect(page.locator("body")).not_to_contain_text(hidden_metadata)
                page.locator("#q").fill("肥皂")
                result = page.locator("#results a").first
                sync.expect(result).to_contain_text("せっけん")
                sync.expect(result).not_to_contain_text(hidden_metadata)
                result.click()
                sync.expect(page.locator("body")).not_to_contain_text(hidden_metadata)
                sync.expect(page.locator("main")).to_contain_text("我用肥皂洗了手")
                page.goto("http://127.0.0.1:8765/grammar/te-oku.html")
                sync.expect(page).to_have_title(re.compile("Kotowa · 词和"))
                sync.expect(page.locator("main")).to_contain_text("事先做好")
                sync.expect(page.locator("main")).to_contain_text("请让空调保持开着")
                page.goto("http://127.0.0.1:8765/grammar/sou-da-hearsay.html")
                sync.expect(page.locator("body")).not_to_contain_text(hidden_metadata)
                sync.expect(page.locator("main")).to_contain_text("天气预报说明天会下雪")
                page.goto("http://127.0.0.1:8765/grammar/wake-da.html")
                sync.expect(page.locator("main")).to_contain_text("难怪")
                sync.expect(page.locator("main")).to_contain_text("窗户全开着")
                sync.expect(page.locator("body")).not_to_contain_text(hidden_metadata)
                page.goto("http://127.0.0.1:8765/vocab/愛.html")
                sync.expect(page.locator("main")).to_contain_text("爱恋")
                sync.expect(page.locator("main")).to_contain_text("爱就是连梦里都会见到她")
                for level in ('n5', 'n4', 'n3', 'n2', 'n1'):
                    for kind, meaning_column in (("vocab", 4), ("grammar", 3)):
                        cards = page.request.get(f"http://127.0.0.1:8765/data/{kind}-{level}.json").json()
                        dataset = page.request.get(f"http://127.0.0.1:8765/dataset/json/{kind}/{level}.json").json()
                        translations = {row['id']: row['zh'] for row in dataset}
                        assert len(cards) == len(translations)
                        for card in cards:
                            assert card[meaning_column].startswith('；'.join(translations[card[0]]['meanings']) + ' / ')
                            assert not re.search(r"中文试点版|正式稿\s*[·・]\s*AI\s*审校|待复核\s*[·・]", card[meaning_column])
                page.set_viewport_size({"width": 390, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                page.goto("http://127.0.0.1:8765/data.html")
                links = page.locator('a[href*="dataset/"], a[href*="downloads/"]')
                urls = set(links.evaluate_all("(items) => items.map(x => x.href)"))
                assert urls
                for url in urls:
                    assert url.startswith("http://127.0.0.1:8765/"), url
                    response = page.request.get(url)
                    assert response.status == 200, url
                page.goto("http://127.0.0.1:8765/flashcards.html")
                sync.expect(page.locator("#fc-front")).not_to_be_empty()
                sync.expect(page.locator('#fc-again .kbd')).to_have_text('←')
                sync.expect(page.locator('#fc-good .kbd')).to_have_text('→')
                initial_session = page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5:session')")
                page.locator('#fc-card').press('1')
                page.locator('#fc-card').press('2')
                assert page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5:session')") == initial_session
                page.locator('#fc-card').press('Space')
                sync.expect(page.locator("body")).not_to_contain_text(hidden_metadata)
                page.locator('#fc-card').press('ArrowRight')
                sync.expect(page.locator("#fc-status")).to_contain_text("19 to review · 1 studied · 0 / 674 learned")
                next_word = page.locator("#fc-front").inner_text()
                page.locator('#fc-kind button[data-v="kanji"]').click()
                sync.expect(page.locator("#fc-status")).to_contain_text("N5 kanji")
                page.locator("#fc-flip").click()
                page.locator("#fc-good").click()
                sync.expect(page.locator("#fc-status")).to_contain_text("1 studied")
                next_kanji = page.locator("#fc-front").inner_text()
                page.reload()
                sync.expect(page.locator("#fc-status")).to_contain_text("N5 kanji")
                sync.expect(page.locator("#fc-front")).to_have_text(next_kanji)
                sync.expect(page.locator("#fc-status")).to_contain_text("19 to review · 1 studied")
                page.locator('#fc-kind button[data-v="vocab"]').click()
                sync.expect(page.locator("#fc-front")).to_have_text(next_word)
                sync.expect(page.locator("#fc-status")).to_contain_text("19 to review · 1 studied")
                page.locator("#fc-flip").click()
                page.reload()
                sync.expect(page.locator("#fc-front")).to_have_text(next_word)
                sync.expect(page.locator("#fc-card")).to_have_class(re.compile("flipped"))
                sync.expect(page.locator("#fc-status")).to_contain_text("19 to review · 1 studied")
                page.locator('#fc-card').press('ArrowLeft')
                sync.expect(page.locator("#fc-status")).to_contain_text("19 to review · 2 studied")
                forgotten_session = page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5:session')")
                page.reload()
                sync.expect(page.locator("#fc-status")).to_contain_text("19 to review · 2 studied")
                assert page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5:session')") == forgotten_session
                # Finish a real group; refresh preserves completion until explicitly continued.
                for remaining in range(19, 0, -1):
                    page.locator('#fc-flip').click()
                    page.locator('#fc-good').click()
                    sync.expect(page.locator('#fc-status')).to_contain_text(f'{remaining - 1} to review')
                page.reload()
                sync.expect(page.locator("#fc-back")).to_contain_text("Session complete!")
                sync.expect(page.locator('#fc-good')).to_be_disabled()
                sync.expect(page.locator('#fc-flip')).to_be_disabled()
                sync.expect(page.locator('#fc-again')).to_be_disabled()
                sync.expect(page.locator('#fc-next')).to_be_enabled()
                completed_progress = page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5')")
                page.locator('#fc-choose').click()
                sync.expect(page.locator('#fc-level button[data-v="N5"]')).to_be_focused()
                page.locator('#fc-kind button[data-v="kanji"]').click()
                sync.expect(page.locator('#fc-front')).to_have_text(next_kanji)
                sync.expect(page.locator('#fc-complete')).to_be_hidden()
                page.locator('#fc-kind button[data-v="vocab"]').click()
                sync.expect(page.locator('#fc-back')).to_contain_text('Session complete!')
                page.locator('#fc-home').click()
                sync.expect(page).to_have_url('http://127.0.0.1:8765/')
                page.goto('http://127.0.0.1:8765/flashcards.html')
                sync.expect(page.locator('#fc-back')).to_contain_text('Session complete!')
                # Space activates the focused action instead of being swallowed by the flip shortcut.
                page.locator('#fc-next').focus()
                page.locator('#fc-next').press('Space')
                sync.expect(page.locator('#fc-status')).to_contain_text('20 to review · 20 studied')
                sync.expect(page.locator('#fc-complete')).to_be_hidden()
                sync.expect(page.locator('#fc-flip')).to_be_enabled()
                assert page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5')") == completed_progress
                next_group = page.evaluate("JSON.parse(localStorage.getItem('openjlpt:fc:vocab:N5:session'))")
                assert not set(next_group['ids']).intersection(json.loads(completed_progress))
                page.reload()
                sync.expect(page.locator('#fc-status')).to_contain_text('20 to review · 20 studied')
                assert page.evaluate("JSON.parse(localStorage.getItem('openjlpt:fc:vocab:N5:session'))") == next_group
                # No new group is offered when every card is scheduled for a future review.
                cards = page.request.get('http://127.0.0.1:8765/data/vocab-n5.json').json()
                page.evaluate("""cards => {
                    localStorage.setItem('openjlpt:fc:vocab:N5', JSON.stringify(Object.fromEntries(
                        cards.map(card => [card[0], {box: 1, due: Date.now() + 86400000}]))));
                }""", cards)
                page.reload()
                sync.expect(page.locator('#fc-back')).to_contain_text('Come back later for due reviews')
                sync.expect(page.locator('#fc-next')).to_be_disabled()
                sync.expect(page.locator('#fc-choose')).to_be_enabled()
                page.on("dialog", lambda dialog: dialog.accept())
                page.locator("#fc-reset").click()
                sync.expect(page.locator("#fc-status")).to_contain_text("20 to review · 0 studied")
                page.locator('#fc-kind button[data-v="kanji"]').click()
                sync.expect(page.locator("#fc-status")).to_contain_text("19 to review · 1 studied")
                page.locator('#fc-kind button[data-v="vocab"]').click()
                sync.expect(page.locator("#fc-status")).to_contain_text("N5 words")
                # A late response for another level must not overwrite the active deck.
                delayed = []
                page.route("**/data/vocab-n4.json", lambda route: delayed.append(route))
                page.locator('#fc-level button[data-v="N4"]').click()
                sync.expect(page.locator("#fc-status")).to_have_text("Loading…")
                page.locator('#fc-level button[data-v="N5"]').click()
                sync.expect(page.locator("#fc-status")).to_contain_text("N5 words")
                assert delayed
                delayed[0].fulfill(json=[['wrong-deck', 'WRONG', '', '', '', '', '', '']])
                page.wait_for_timeout(100)
                sync.expect(page.locator("#fc-front")).not_to_have_text("WRONG")
                sync.expect(page.locator("#fc-status")).to_contain_text("0 / 674 learned")
                # Deterministic random draws make ordering assertions non-flaky.
                page.evaluate("Math.random = () => 0")
                session_key = 'openjlpt:fc:vocab:N5:session'
                before_shuffle = page.evaluate("key => JSON.parse(localStorage.getItem(key))", session_key)
                progress_before = page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5')")
                page.locator('#fc-shuffle').check()
                shuffled = page.evaluate("key => JSON.parse(localStorage.getItem(key))", session_key)
                assert shuffled['ids'][0] == before_shuffle['ids'][0]
                assert shuffled['ids'][1:] != before_shuffle['ids'][1:]
                assert sorted(shuffled['ids']) == sorted(before_shuffle['ids'])
                assert shuffled['done'] == before_shuffle['done']
                assert page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5')") == progress_before
                page.reload()
                sync.expect(page.locator('#fc-shuffle')).to_be_checked()
                sync.expect(page.locator('#fc-status')).to_contain_text('N5 words')
                assert page.evaluate("key => JSON.parse(localStorage.getItem(key))", session_key) == shuffled
                page.locator('#fc-kind button[data-v="kanji"]').click()
                sync.expect(page.locator('#fc-status')).to_contain_text('N5 kanji')
                page.locator('#fc-kind button[data-v="vocab"]').click()
                sync.expect(page.locator('#fc-status')).to_contain_text('N5 words')
                assert page.evaluate("key => JSON.parse(localStorage.getItem(key))", session_key) == shuffled
                page.locator('#fc-shuffle').uncheck()
                ordered = page.evaluate("key => JSON.parse(localStorage.getItem(key))", session_key)
                assert ordered['ids'] == before_shuffle['ids']
                page.evaluate("Math.random = () => 0")
                page.locator('#fc-shuffle').check()
                page.locator('#fc-level button[data-v="N3"]').click()
                sync.expect(page.locator('#fc-status')).to_contain_text('N3 words')
                new_session = page.evaluate("JSON.parse(localStorage.getItem('openjlpt:fc:vocab:N3:session'))")
                source_rows = page.request.get('http://127.0.0.1:8765/data/vocab-n3.json').json()
                assert len(new_session['ids']) == len(set(new_session['ids'])) == 20
                assert set(new_session['ids']) != {row[0] for row in source_rows[:20]}
                assert not errors, errors
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
