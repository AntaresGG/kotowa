"""Focused-review regression checks against a built site or deployed release."""
import functools
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(
    not (os.environ.get("OPENJLPT_SITE") or os.environ.get("KOTOWA_TEST_URL")),
    reason="Set OPENJLPT_SITE or KOTOWA_TEST_URL",
)


@pytest.fixture
def site_url():
    remote = os.environ.get("KOTOWA_TEST_URL")
    if remote:
        yield remote.rstrip("/") + "/"
        return
    handler = functools.partial(
        SimpleHTTPRequestHandler, directory=str(Path(os.environ["OPENJLPT_SITE"]).resolve())
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@pytest.fixture
def browser():
    sync = pytest.importorskip("playwright.sync_api")
    with sync.sync_playwright() as pw:
        kwargs = {"headless": True}
        if os.environ.get("OPENJLPT_CHROMIUM"):
            kwargs["executable_path"] = os.environ["OPENJLPT_CHROMIUM"]
        instance = pw.chromium.launch(**kwargs)
        try:
            yield instance
        finally:
            instance.close()


def test_focused_collection_and_independent_sessions(browser, site_url):
    from playwright.sync_api import expect

    page = browser.new_page(locale="en-US")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"{site_url}flashcards.html")
    expect(page.locator("#fc-mark")).to_be_enabled()
    daily_key = "openjlpt:fc:vocab:N5"
    first = page.locator("#fc-front").inner_text()
    initial = page.evaluate("key => localStorage.getItem(key + ':session')", daily_key)
    page.locator("#fc-mark").click()
    expect(page.locator("#fc-mark")).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("key => localStorage.getItem(key + ':session')", daily_key) == initial
    # A successful daily rating puts the saved card in the future.
    page.locator("#fc-flip").click()
    page.locator("#fc-good").click()
    second = page.locator("#fc-front").inner_text()
    page.locator("#fc-flip").click()
    page.locator("#fc-mark").click()
    expect(page.locator("#fc-card")).to_have_class("card fc-card flipped")
    expect(page.locator("#fc-focus-count")).to_have_text("2")
    progress = page.evaluate("key => localStorage.getItem(key)", daily_key)
    daily = page.evaluate("key => localStorage.getItem(key + ':session')", daily_key)
    page.reload()
    expect(page.locator("#fc-mark")).to_have_attribute("aria-pressed", "true")
    page.locator('#fc-mode [data-v="focus"]').click()
    expect(page.locator("#fc-front")).to_have_text(first)
    expect(page.locator("#fc-reset")).to_be_hidden()
    expect(page.locator("#fc-remaining")).to_have_text("2")
    page.locator("#fc-flip").click()
    page.locator("#fc-again").click()
    expect(page.locator("#fc-front")).to_have_text(second)
    expect(page.locator("#fc-remaining")).to_have_text("2")
    page.locator("#fc-shuffle").check()
    page.reload()
    expect(page.locator('#fc-mode [data-v="focus"]')).to_have_attribute("aria-pressed", "true")
    expect(page.locator("#fc-front")).to_have_text(second)
    expect(page.locator("#fc-shuffle")).to_be_checked()
    for word in (second, first):
        expect(page.locator("#fc-front")).to_have_text(word)
        page.locator("#fc-flip").click()
        page.locator("#fc-good").click()
    expect(page.locator("#fc-back")).to_contain_text("Your cards stay saved")
    expect(page.locator("#fc-focus-count")).to_have_text("2")
    page.reload()
    expect(page.locator("#fc-back")).to_contain_text("Your cards stay saved")
    assert page.evaluate("key => localStorage.getItem(key)", daily_key) == progress
    assert page.evaluate("key => localStorage.getItem(key + ':session')", daily_key) == daily
    # Returning to daily restores its flipped card, regardless of focus ratings.
    page.locator('#fc-mode [data-v="daily"]').click()
    expect(page.locator("#fc-front")).to_have_text(second)
    expect(page.locator("#fc-card")).to_have_class("card fc-card flipped")
    page.locator("#fc-shuffle").uncheck()
    page.on("dialog", lambda dialog: dialog.accept())
    page.locator("#fc-reset").click()
    expect(page.locator("#fc-studied")).to_have_text("0")
    expect(page.locator("#fc-focus-count")).to_have_text("2")
    # Editing the collection after completion starts a fresh focus session.
    page.locator("#fc-mark").click()
    expect(page.locator("#fc-focus-count")).to_have_text("1")
    page.locator('#fc-mode [data-v="focus"]').click()
    expect(page.locator("#fc-front")).to_have_text(second)
    # Removing the active card immediately removes it from the practice queue.
    page.locator("#fc-mark").click()
    expect(page.locator("#fc-back")).to_contain_text("No saved cards")
    expect(page.locator("#fc-next")).to_be_disabled()
    expect(page.locator("#fc-mark")).to_be_disabled()
    # Empty decks and different card kinds remain independent.
    page.locator('#fc-level [data-v="N4"]').click()
    expect(page.locator("#fc-back")).to_contain_text("No saved cards")
    page.locator('#fc-mode [data-v="daily"]').click()
    expect(page.locator("#fc-mark")).to_be_enabled()
    page.locator("#fc-mark").click()
    for kind in ("kanji", "grammar"):
        page.locator(f'#fc-kind [data-v="{kind}"]').click()
        expect(page.locator("#fc-focus-count")).to_have_text("0")
        expect(page.locator("#fc-mark")).to_be_enabled()
        page.locator("#fc-mark").click()
        expect(page.locator("#fc-focus-count")).to_have_text("1")
    page.locator('#fc-mode [data-v="focus"]').click()
    expect(page.locator("#fc-remaining")).to_have_text("1")
    page.locator("#fc-focus-library summary").click()
    for appearance in ("theme1", "theme2"):
        page.locator("#theme-switch").press("ArrowRight" if appearance == "theme2" else "ArrowLeft")
        for scheme in ("light", "dark"):
            page.emulate_media(color_scheme=scheme)
            for width in (320, 390, 1024):
                page.set_viewport_size({"width": width, "height": 900})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    page.locator("#fc-focus-list button").click()
    expect(page.locator("#fc-focus-empty")).to_be_visible()
    expect(page.locator("#fc-next")).to_be_disabled()
    page.reload()
    expect(page.locator("#fc-back")).to_contain_text("No saved cards")
    assert not errors, errors
    page.close()


@pytest.mark.parametrize("storage", ["blocked", "malformed"])
def test_focus_storage_fallback(browser, site_url, storage):
    from playwright.sync_api import expect

    page = browser.new_page(locale="en-US")
    if storage == "blocked":
        page.add_init_script("Object.defineProperty(window, 'localStorage', {get() {throw new Error('Storage blocked')}})")
    else:
        page.add_init_script("localStorage.setItem('kotowa:fc:focus:v1', '{broken')")
    page.goto(f"{site_url}flashcards.html")
    expect(page.locator("#fc-mark")).to_be_enabled()
    word = page.locator("#fc-front").inner_text()
    page.locator("#fc-mark").click()
    expect(page.locator("#fc-focus-count")).to_have_text("1")
    if storage == "blocked":
        expect(page.locator("#fc-focus-message")).to_contain_text("storage is unavailable")
    page.locator('#fc-mode [data-v="focus"]').click()
    expect(page.locator("#fc-front")).to_have_text(word)
    page.close()


def test_remove_queued_and_completed_cards(browser, site_url):
    from playwright.sync_api import expect

    page = browser.new_page(locale="en-US")
    page.goto(f"{site_url}flashcards.html")
    cards = page.request.get(f"{site_url}data/vocab-n5.json").json()[:3]
    page.evaluate("""cards => {
        localStorage.setItem('kotowa:fc:focus:v1', JSON.stringify({
            'vocab:N5': [...cards.map(card => card[0]), 'obsolete-id']
        }));
        localStorage.setItem('openjlpt:fc:selection', JSON.stringify({level: 'N5', kind: 'vocab', mode: 'focus'}));
    }""", cards)
    page.reload()
    expect(page.locator("#fc-focus-count")).to_have_text("3")
    expect(page.locator("#fc-front")).to_have_text(cards[0][1])
    page.locator("#fc-focus-library summary").click()
    page.locator("#fc-focus-list button").nth(1).click()
    expect(page.locator("#fc-front")).to_have_text(cards[0][1])
    expect(page.locator("#fc-remaining")).to_have_text("2")
    page.reload()
    expect(page.locator("#fc-remaining")).to_have_text("2")
    for card in (cards[0], cards[2]):
        expect(page.locator("#fc-front")).to_have_text(card[1])
        page.locator("#fc-flip").click()
        page.locator("#fc-good").click()
    expect(page.locator("#fc-next")).to_be_enabled()
    # A completed collection can start another full practice round.
    page.locator("#fc-next").click()
    expect(page.locator("#fc-remaining")).to_have_text("2")
    for _ in range(2):
        page.locator("#fc-flip").click()
        page.locator("#fc-good").click()
    page.locator("#fc-focus-library summary").click()
    for _ in range(2):
        page.locator("#fc-focus-list button").first.click()
    expect(page.locator("#fc-back")).to_contain_text("No saved cards")
    expect(page.locator("#fc-next")).to_be_disabled()
    expect(page.locator("#fc-focus-count")).to_have_text("0")
    page.close()
