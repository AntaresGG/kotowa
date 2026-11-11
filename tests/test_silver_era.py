"""Silver Era appearance checks against the generated site or the deployed release."""
import json
import re

import pytest

expect = pytest.importorskip('playwright.sync_api').expect

# Reuse the isolated Chromium and static-server fixtures, including KOTOWA_TEST_URL.
from test_flashcard_focus import browser, site_url, pytestmark  # noqa: F401


def test_silver_theme_controls_and_navigation(browser, site_url):
    page = browser.new_page(locale="en-US", viewport={"width": 1440, "height": 1000})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(site_url)
    expect(page.locator('.se-receiver')).not_to_be_visible()
    page.locator('#theme-silver').click()
    expect(page.locator('html')).to_have_attribute('data-appearance', 'silver-era')
    expect(page.locator('#theme-silver')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('.se-receiver')).to_be_visible()
    page.locator('#se-panel-toggle').click()
    expect(page.locator('#se-faceplate')).not_to_be_visible()
    page.reload()
    expect(page.locator('#se-panel-toggle')).to_have_attribute('aria-expanded', 'false')
    page.locator('#se-panel-toggle').click()
    expect(page.locator('#se-faceplate')).to_be_visible()
    metadata = page.request.get(site_url + 'dataset/json/meta.json').json()
    expect(page.locator('#se-meter-left')).to_have_attribute('aria-valuenow', str(metadata['counts']['vocab']['total']))
    expect(page.locator('#se-meter-right')).to_have_attribute('aria-valuenow', str(metadata['counts']['kanji']['total']))
    expect(page.locator('.se-counter output')).to_have_text(str(metadata['counts']['grammar']['total']).zfill(4))
    # The knob changes reading size, persists across pages and stays scoped to this theme.
    page.locator('#se-text-size').press('End')
    expect(page.locator('#se-size-label')).to_have_text('Large')
    assert float(page.locator('.page-content').evaluate('el => getComputedStyle(el).zoom')) == 1.1
    page.emulate_media(color_scheme='dark', reduced_motion='reduce')
    assert page.locator('html').evaluate('el => getComputedStyle(el).colorScheme') == 'light'
    assert page.locator('.se-knob').evaluate('el => getComputedStyle(el).transitionDuration') == '0s'
    page.locator('#q').fill('肥皂')
    page.locator('#results a').first.click()
    expect(page.locator('main')).to_contain_text('我用肥皂洗了手')
    expect(page.locator('html')).to_have_attribute('data-silver-size', '2')
    for path in ('', 'n5/', 'n5/vocab.html', 'n5/grammar.html', 'n5/kanji.html',
                 'grammar/te-oku.html', 'kanji/日.html', 'flashcards.html', 'analyzer.html', 'data.html'):
        page.goto(site_url + path)
        expect(page.locator('html')).to_have_attribute('data-appearance', 'silver-era')
        for width in (320, 390, 768, 1024, 1440):
            page.set_viewport_size({"width": width, "height": 900})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (path, width)
    page.goto(site_url + 'grammar/te-oku.html')
    controls = page.locator('[data-furigana]')
    assert controls.count() == 2
    controls.first.uncheck()
    expect(controls.last).not_to_be_checked()
    expect(page.locator('html')).to_have_class(re.compile('no-furigana'))
    controls.last.check()
    expect(controls.first).to_be_checked()
    page.reload()
    expect(controls.first).to_be_checked()
    page.locator('#theme-switch').press('ArrowLeft')
    expect(page.locator('html')).to_have_attribute('data-appearance', 'theme1')
    expect(page.locator('.se-receiver')).not_to_be_visible()
    assert float(page.locator('.page-content').evaluate('el => getComputedStyle(el).zoom')) == 1
    page.locator('#theme-silver').click()
    page.locator('#theme-switch').click(position={"x": 12, "y": 12})
    expect(page.locator('html')).to_have_attribute('data-appearance', 'theme1')
    page.locator('#theme-switch').press('ArrowRight')
    expect(page.locator('html')).to_have_attribute('data-appearance', 'theme2')
    expect(page.locator('#theme-silver')).to_have_attribute('aria-pressed', 'false')
    assert not errors
    page.close()


def test_silver_flashcard_readings_preserve_progress(browser, site_url):
    page = browser.new_page(locale="en-US")
    page.goto(site_url + 'flashcards.html')
    expect(page.locator('#fc-front')).not_to_be_empty()
    page.locator('#theme-silver').click()
    expect(page.locator('#se-meter-left')).to_have_attribute('aria-valuenow', '0')
    expect(page.locator('#se-meter-right')).to_have_attribute('aria-valuenow', '0')
    page.locator('#fc-flip').click()
    page.locator('#fc-good').click()
    expect(page.locator('#fc-studied')).to_have_text('1')
    expect(page.locator('#se-meter-left')).to_have_attribute('aria-valuetext', re.compile('1 of .* studied'))
    expect(page.locator('#se-meter-right')).to_have_attribute('aria-valuenow', '5')
    expect(page.locator('#se-meter-right')).to_have_attribute('aria-valuetext', '1 of 20 completed this session')
    assert page.locator('#se-meter-right .se-needle').evaluate('el => el.getAnimations().length') == 1
    page.emulate_media(reduced_motion='reduce')
    page.wait_for_function("Array.from(document.querySelectorAll('.se-needle')).every(el => el.getAnimations().length === 0)")
    progress = page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5')")
    session = page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5:session')")
    assert len(json.loads(progress)) == 1
    page.locator('#theme-switch').press('ArrowLeft')
    page.locator('#theme-switch').press('ArrowRight')
    page.locator('#theme-silver').click()
    assert page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5')") == progress
    assert page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5:session')") == session
    page.reload()
    expect(page.locator('#se-meter-right')).to_have_attribute('aria-valuenow', '5')
    page.locator('#fc-mode button[data-v="focus"]').click()
    expect(page.locator('#se-context')).to_contain_text('Focused review')
    expect(page.locator('#se-meter-right')).to_have_attribute('aria-valuetext', '0 of 0 completed this session')
    assert page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5')") == progress
    page.locator('#fc-mode button[data-v="daily"]').click()
    expect(page.locator('#se-meter-right')).to_have_attribute('aria-valuenow', '5')
    # Failed deck requests clear old readings instead of displaying another deck's progress.
    page.route('**/data/kanji-n5.json', lambda route: route.fulfill(status=503, body='Unavailable'))
    page.locator('#fc-kind button[data-v="kanji"]').click()
    expect(page.locator('#se-context')).to_contain_text('could not load')
    expect(page.locator('#se-meter-left')).not_to_have_attribute('aria-valuenow', re.compile('.+'))
    expect(page.locator('#se-meters')).to_have_attribute('aria-busy', 'false')
    page.close()


def test_silver_storage_sync_and_blocked_storage(browser, site_url):
    context = browser.new_context(locale='en-US', reduced_motion='reduce')
    first, second = context.new_page(), context.new_page()
    first.goto(site_url)
    second.goto(site_url + 'grammar/te-oku.html')
    first.locator('#theme-silver').click()
    expect(second.locator('html')).to_have_attribute('data-appearance', 'silver-era')
    first.locator('#se-text-size').press('Home')
    expect(second.locator('#se-text-size')).to_have_value('0')
    assert second.locator('.se-needle').evaluate_all('items => items.every(el => el.getAnimations().length === 0)')
    context.close()
    blocked = browser.new_context(locale="en-US")
    blocked.add_init_script("Object.defineProperty(window, 'localStorage', {get() {throw new Error('Storage blocked')}})")
    page = blocked.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(site_url)
    page.locator('#theme-silver').click()
    page.locator('#se-text-size').press('End')
    page.locator('[data-furigana]').uncheck()
    expect(page.locator('html')).to_have_attribute('data-silver-size', '2')
    expect(page.locator('html')).to_have_class(re.compile('no-furigana'))
    assert not errors
    blocked.close()
