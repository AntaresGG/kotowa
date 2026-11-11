"""Foundation learning and cross-origin kana migration in an isolated browser."""
import html
import json
import os
import re
from pathlib import Path

import pytest

from test_flashcard_focus import browser, site_url, pytestmark  # noqa: F401

expect = pytest.importorskip("playwright.sync_api").expect


def test_kana_learning_and_progress_backup(browser, site_url, tmp_path):
    page = browser.new_page(locale="zh-CN")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(site_url + "learn/")
    expect(page.locator("h1")).to_have_text("基础学习")
    page.locator('.learn-hub a[href="kana/"]').click()
    expect(page.locator(".kana-tile")).to_have_count(104)
    expect(page.locator('#learn-message')).to_have_text('')
    assert page.locator('.kana-tile[data-id="ゆ"]').evaluate("el => getComputedStyle(el).gridColumnStart") == '4'
    assert page.locator('.kana-tile[data-id="を"]').evaluate("el => getComputedStyle(el).gridColumnStart") == '6'
    page.locator('#kana-script').select_option('both')
    page.locator('.kana-tile[data-id="あ"]').click()
    expect(page.locator('#kana-dialog')).to_be_visible()
    expect(page.locator('#learn-detail h2')).to_have_text('あ / ア')
    page.locator('#learn-mark').click()
    page.locator('#kana-close').click()
    expect(page.locator('#learn-progress-text')).to_have_text('已学 1 / 104 项')
    assert page.evaluate("localStorage.getItem('gojuon_learned')") is None
    page.reload()
    expect(page.locator('.kana-tile[data-id="あ"]')).to_have_attribute('data-studied', 'true')
    page.locator('#kana-hints').uncheck()
    page.locator('.kana-tile[data-id="あ"]').click()
    expect(page.locator('#learn-detail p[lang="zh-CN"]')).to_be_hidden()
    page.locator('#learn-mark').click()
    expect(page.locator('#learn-detail p[lang="zh-CN"]')).to_be_hidden()
    page.locator('#kana-dialog').press('Escape')
    page.locator('.learn-transfer summary').click()
    imported = tmp_path / 'kana.json'
    imported.write_text(json.dumps(['あ', 'い', 'not-kana']), encoding='utf-8')
    page.locator('#learn-import').set_input_files(imported)
    expect(page.locator('#learn-message')).to_have_text('已导入进度，并保留原有记录。')
    expect(page.locator('#learn-progress-text')).to_have_text('已学 2 / 104 项')
    with page.expect_download() as download:
        page.locator('#learn-export').click()
    exported = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
    assert exported['format'] == 'kotowa-learning'
    assert set(exported['modules']['kana']['learned']) == {'あ', 'い'}
    page.locator('#language-select').select_option('en')
    expect(page.locator('#learn-progress-text')).to_have_text('2 / 104 studied')
    assert not errors, errors
    page.close()


@pytest.mark.parametrize('module', ['verbs', 'word-classes'])
def test_lessons_quiz_and_focused_review_preserve_daily_progress(browser, site_url, module):
    page = browser.new_page(locale='en-US')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(site_url + 'learn/' + module + '/')
    expect(page.locator('#learn-mark')).to_be_enabled()
    page.evaluate("localStorage.setItem('openjlpt:fc:vocab:N5', JSON.stringify({untouched:{box:2,due:1234}}))")
    before = page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5')")
    if module == 'verbs':
        page.locator('#learn-search').fill('書く')
    else:
        page.locator('#learn-search').fill('僕')
    expect(page.locator('.learn-item')).to_have_count(1)
    page.locator('#learn-mark').click()
    expect(page.locator('#learn-mark')).to_have_attribute('aria-pressed', 'true')
    page.locator('#learn-focus').click()
    expect(page.locator('#learn-focus')).to_have_attribute('aria-pressed', 'true')
    target = page.locator('#learn-detail a').first.get_attribute('href')
    assert page.request.get(site_url + target.removeprefix('../../')).ok
    entry_page = browser.new_page(locale='en-US')
    entry_page.goto(site_url + target.removeprefix('../../'))
    lesson_link = entry_page.locator(f'.chips a[href*="learn/{module}/"]').first
    expect(lesson_link).to_be_visible()
    lesson_link.click()
    expect(entry_page.locator('#learn-detail h2')).to_have_text('書く' if module == 'verbs' else '僕')
    entry_page.close()
    page.locator('[data-mode="quiz"]').click()
    expect(page.locator('#learn-content')).to_be_hidden()
    if module == 'word-classes':
        # A one-category pool cannot create a category question with distinct answers.
        page.locator('#learn-quiz-type').select_option('category')
        page.locator('#learn-quiz-start').click()
        expect(page.locator('#learn-question')).to_contain_text('Choose a wider set')
        page.locator('#learn-search').fill('')
        page.locator('#learn-quiz-type').select_option('usage')
    page.locator('#learn-quiz-start').click()
    expected_questions = 1 if module == 'verbs' else 10
    for number in range(expected_questions):
        options = page.locator('.learn-quiz-options button')
        expect(options.first).to_be_enabled()
        options.first.click()
        expect(options.first).to_be_disabled()
        expect(page.locator('[data-result="correct"]')).to_have_count(1)
        if number == 0:
            snapshot = page.locator('.learn-question-word').inner_text()
            page.locator('#language-select').select_option('zh-CN')
            expect(page.locator('.learn-question-word')).to_have_text(snapshot)
            expect(page.locator('.learn-quiz-options button').first).to_be_disabled()
            page.locator('#language-select').select_option('en')
        page.locator('#learn-quiz-next').click()
    expect(page.locator('#learn-question')).to_contain_text('Round complete:')
    expect(page.locator('#learn-quiz-history')).to_contain_text(f'/ {expected_questions} correct · 1 rounds')
    assert page.evaluate("localStorage.getItem('openjlpt:fc:vocab:N5')") == before
    record = page.evaluate("module => JSON.parse(localStorage.getItem('kotowa:learn:'+module+':v1'))", module)
    assert len(record['learned']) == 1
    assert record['quiz']['rounds'] == 1
    assert record['quiz']['answered'] == expected_questions
    page.reload()
    expect(page.locator('#learn-quiz-history')).to_contain_text(f'/ {expected_questions} correct · 1 rounds')
    assert not errors, errors
    page.close()


@pytest.mark.parametrize('theme', ['theme1', 'theme2', 'silver-era'])
def test_foundation_layout_languages_and_meters(browser, site_url, theme):
    page = browser.new_page(locale='zh-CN', viewport={'width': 1920, 'height': 1080}, device_scale_factor=2)
    page.add_init_script(f"localStorage.setItem('kotowa:appearance', '{theme}')")
    for module in ['kana', 'verbs', 'word-classes']:
        page.goto(site_url + 'learn/' + module + '/')
        expect(page.locator('#learn-progress-text')).to_contain_text('已学 0 /')
        for width in [320, 390, 768, 1536, 1920]:
            page.set_viewport_size({'width':width,'height':1080})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (theme,module,width)
        if theme == 'silver-era':
            expect(page.locator('#se-meter-left')).to_have_attribute('aria-valuenow', '0')
            expect(page.locator('#se-meter-right')).to_have_attribute('aria-valuetext', '尚无测验答题记录。')
        page.locator('#language-select').select_option('en')
        expect(page.locator('h1')).to_have_text({'kana':'Kana','verbs':'Verb practice','word-classes':'Word classes'}[module])
        page.locator('#language-select').select_option('zh-CN')
    page.close()


@pytest.mark.parametrize('storage', ['blocked', 'invalid'])
def test_lesson_storage_fallback(browser, site_url, storage):
    context = browser.new_context(locale='en-US')
    if storage == 'blocked':
        context.add_init_script("Object.defineProperty(window, 'localStorage', {get() {throw new Error('Blocked')}})")
    else:
        context.add_init_script("localStorage.setItem('kotowa:learn:kana:v1', '{broken')")
    page = context.new_page()
    page.goto(site_url + 'learn/kana/')
    expect(page.locator('.kana-tile')).to_have_count(104)
    page.locator('.kana-tile[data-id="あ"]').click()
    page.locator('#learn-mark').click()
    expect(page.locator('#learn-progress-text')).to_have_text('1 / 104 studied')
    if storage == 'blocked':
        expect(page.locator('#learn-message')).to_contain_text('Browser storage is unavailable.')
    context.close()


@pytest.fixture
def legacy_origin(site_url):
    if os.environ.get('KOTOWA_TEST_URL'):
        pytest.skip('Cross-origin bridge simulation requires a local site')
    source = (Path(os.environ['OPENJLPT_SITE']) / 'legacy-migration/index.html').read_text(encoding='utf-8')
    source = re.sub(r'var target = .*?;', 'var target = ' + json.dumps({'origin':site_url.rstrip('/'), 'href':site_url+'learn/kana/'}) + ';', source)
    source = re.sub(r'<link rel="stylesheet"[^>]+>', '', source)
    # A fulfilled public test origin avoids Edge's local-network iframe restriction.
    return 'https://legacy.kotowa.test', source


@pytest.mark.parametrize('legacy_storage', ['available', 'blocked'])
def test_cross_origin_merge_and_untrusted_messages(browser, site_url, legacy_origin, legacy_storage):
    legacy_origin, bridge = legacy_origin
    context = browser.new_context(locale='en-US')
    context.route(legacy_origin + '/**', lambda route: route.fulfill(status=200, content_type='text/html; charset=utf-8', body=bridge))
    if legacy_storage == 'blocked':
        context.add_init_script(f"if (location.origin === {json.dumps(legacy_origin)}) Object.defineProperty(window, 'localStorage', {{get() {{throw new Error('Blocked')}}}})")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(legacy_origin + '/_kotowa-migration/')
    original = '["あ","い","unknown"]'
    if legacy_storage == 'available':
        page.evaluate('value => localStorage.setItem("gojuon_learned", value)', original)

    def configure(route):
        response = route.fetch()
        source = response.text()
        source = re.sub(r'data-legacy-origins="[^"]*"', 'data-legacy-origins="' + html.escape(json.dumps([legacy_origin]), quote=True) + '"', source)
        route.fulfill(response=response, body=source)

    page.route('**/learn/kana/', configure)
    page.goto(site_url + 'learn/kana/')
    if legacy_storage == 'available':
        expect(page.locator('#learn-progress-text')).to_have_text('2 / 104 studied')
        page.locator('#learn-migration summary').click()
        expect(page.locator('#learn-migration-status')).to_have_text('Old kana progress merged. Original records were kept.')
        page.evaluate("window.postMessage({type:'kotowa:legacy-kana',status:'ok',learned:['え']}, location.origin)")
        expect(page.locator('#learn-progress-text')).to_have_text('2 / 104 studied')
        page.locator('#learn-migrate').click()
        expect(page.locator('#learn-migration-status')).to_have_text('Old kana progress merged. Original records were kept.')
        expect(page.locator('#learn-progress-text')).to_have_text('2 / 104 studied')
        page.goto(legacy_origin + '/_kotowa-migration/')
        assert page.evaluate("localStorage.getItem('gojuon_learned')") == original
        # A completed migration must not repopulate a deliberately reset new lesson.
        page.goto(site_url + 'learn/kana/')
        page.on('dialog', lambda dialog: dialog.accept())
        page.locator('#learn-reset').click()
        page.reload()
        expect(page.locator('#learn-progress-text')).to_have_text('0 / 104 studied')
    else:
        page.locator('#learn-migration summary').click()
        expect(page.locator('#learn-migration-status')).to_contain_text('Automatic transfer is unavailable.')
        assert page.evaluate("localStorage.getItem('kotowa:learn:migrations:v1')") is None
    assert not errors, errors
    context.close()
