"""Interface-language regression checks, separate from learning-content translation."""
import pytest

from test_flashcard_focus import browser, site_url, pytestmark  # noqa: F401

expect = pytest.importorskip("playwright.sync_api").expect


@pytest.mark.parametrize("locale,expected", [("zh-CN", "zh-CN"), ("zh-TW", "zh-CN"), ("en-US", "en"), ("fr-FR", "en")])
def test_language_selection_and_navigation(browser, site_url, locale, expected):
    context = browser.new_context(locale=locale)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(site_url)
    expect(page.locator("html")).to_have_attribute("lang", expected)
    expect(page.locator("#language-select")).to_have_value(expected)
    for language, flashcards in (("zh-CN", "闪卡"), ("en", "Flashcards")):
        page.locator("#language-select").select_option(language)
        expect(page.locator('.nav a[href$="flashcards.html"]')).to_have_text(flashcards)
        page.locator("#q").fill("肥皂")
        expect(page.locator("#results a").first).to_contain_text("せっけん")
        expect(page.locator("#results .kind").first).to_have_text("词汇" if language == "zh-CN" else "word")
        page.locator("#results a").first.click()
        expect(page.locator("html")).to_have_attribute("lang", language)
        expect(page.locator("main")).to_contain_text("我用肥皂洗了手")
        expect(page.locator(".speak")).to_have_attribute("aria-label", "播放读音" if language == "zh-CN" else "Listen")
        page.reload()
        expect(page.locator("#language-select")).to_have_value(language)
        page.goto(site_url)
    page.locator("#q").fill("no-such-word-zzzz")
    expect(page.locator("#results")).to_have_text("No results.")
    page.locator("#language-select").select_option("zh-CN")
    expect(page.locator("#results")).to_have_text("没有找到结果。")
    assert not errors, errors
    context.close()


@pytest.mark.parametrize("storage", ["blocked", "invalid"])
def test_language_storage_fallback(browser, site_url, storage):
    context = browser.new_context(locale="zh-CN")
    if storage == "blocked":
        context.add_init_script("Object.defineProperty(window, 'localStorage', {get() {throw new Error('Storage blocked')}})")
    else:
        context.add_init_script("localStorage.setItem('kotowa:language', 'invalid')")
    page = context.new_page()
    page.goto(site_url + "flashcards.html")
    expect(page.locator("#fc-mark")).to_be_enabled()
    expect(page.locator("html")).to_have_attribute("lang", "zh-CN")
    page.locator("#language-select").select_option("en")
    expect(page.locator("h1")).to_have_text("Flashcards")
    page.locator("#fc-mark").click()
    expect(page.locator("#fc-mark")).to_have_text("★ Saved for focused review")
    page.locator("#language-select").select_option("zh-CN")
    expect(page.locator("#fc-mark")).to_have_text("★ 已加入重点复习")
    if storage == "blocked":
        expect(page.locator("#fc-focus-message")).to_contain_text("浏览器存储不可用")
    context.close()


def test_language_sync_across_tabs(browser, site_url):
    context = browser.new_context(locale="zh-CN")
    first, second = context.new_page(), context.new_page()
    first.goto(site_url)
    second.goto(site_url + "grammar/te-oku.html")
    first.locator("#language-select").select_option("en")
    expect(second.locator("html")).to_have_attribute("lang", "en")
    expect(second.locator("#language-select")).to_have_value("en")
    first.evaluate("localStorage.removeItem('kotowa:language')")
    expect(second.locator("html")).to_have_attribute("lang", "zh-CN")
    expect(second.locator("h2").filter(has_text="中文释义")).to_have_count(1)
    context.close()


def test_flashcard_language_preserves_active_and_completed_sessions(browser, site_url):
    page = browser.new_page(locale="en-US")
    page.goto(site_url + "flashcards.html")
    expect(page.locator("#fc-mark")).to_be_enabled()
    page.locator("#fc-mark").click()
    page.locator("#fc-flip").click()
    word = page.locator("#fc-front").inner_text()
    snapshot = page.evaluate("JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.includes(':fc:'))))")
    for language in ("zh-CN", "en", "zh-CN"):
        page.locator("#language-select").select_option(language)
        expect(page.locator("#fc-front")).to_have_text(word)
        expect(page.locator("#fc-card")).to_have_class("card fc-card flipped")
        assert page.evaluate("JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.includes(':fc:'))))") == snapshot
        expect(page.locator("#fc-back a")).to_have_text("详情 ↗" if language == "zh-CN" else "details ↗")
    page.locator("#theme-silver").click()
    page.locator("#fc-good").click()
    expect(page.locator("#fc-studied")).to_have_text("1")
    expect(page.locator("#se-meter-right")).to_have_attribute("aria-valuetext", "本轮已完成 1 / 20 张")
    page.locator("#language-select").select_option("en")
    expect(page.locator("#se-meter-right")).to_have_attribute("aria-valuetext", "1 of 20 completed this session")
    page.locator('#fc-mode [data-v="focus"]').click()
    expect(page.locator("#fc-front")).to_have_text(word)
    page.locator("#fc-flip").click()
    page.locator("#fc-good").click()
    expect(page.locator("#fc-back")).to_contain_text("Your cards stay saved")
    page.locator("#language-select").select_option("zh-CN")
    expect(page.locator("#fc-back")).to_contain_text("收藏卡片会保留")
    page.locator("#fc-next").click()
    expect(page.locator("#fc-front")).to_have_text(word)
    page.locator("#language-select").select_option("en")
    page.locator("#fc-flip").click()
    expect(page.locator("#fc-back a")).to_have_text("details ↗")
    page.close()


def test_dynamic_analyzer_and_failed_deck_messages(browser, site_url):
    page = browser.new_page(locale="en-US")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(site_url + "analyzer.html")
    expect(page.locator("#summary")).to_contain_text("distinct kanji")
    page.locator("#text").fill("日本語")
    expect(page.locator("#summary")).to_contain_text("3 distinct kanji")
    page.locator("#language-select").select_option("zh-CN")
    expect(page.locator("#summary")).to_contain_text("3 个不同汉字")
    expect(page.locator("#text")).to_have_value("日本語")
    page.locator("#text").fill("")
    expect(page.locator("#summary")).to_have_text("未发现汉字。")
    page.locator("#language-select").select_option("en")
    expect(page.locator("#summary")).to_have_text("No kanji found.")
    page.locator("#text").fill("日")
    expect(page.locator("#summary")).to_contain_text("1 distinct kanji")
    page.locator("#language-select").select_option("zh-CN")
    expect(page.locator("#summary")).to_contain_text("1 个不同汉字")
    page.route("**/data/vocab-n5.json", lambda route: route.fulfill(status=503, body="Unavailable"))
    page.goto(site_url + "flashcards.html")
    expect(page.locator("#fc-status")).to_contain_text("无法载入")
    page.locator("#language-select").select_option("en")
    expect(page.locator("#fc-status")).to_contain_text("Unable to load")
    expect(page.locator("#se-context")).to_contain_text("could not load")
    expect(page.locator("#fc-overview")).to_be_hidden()
    assert not errors, errors
    page.close()


def test_bilingual_layout_and_static_message_coverage(browser, site_url):
    page = browser.new_page(locale="en-US")
    for language in ("en", "zh-CN"):
        page.goto(site_url)
        page.locator("#language-select").select_option(language)
        for theme in ("theme1", "theme2", "silver-era"):
            if theme == "silver-era":
                page.locator("#theme-silver").click()
            else:
                page.locator("#theme-switch").press("ArrowLeft" if theme == "theme1" else "ArrowRight")
            for path in ("", "n5/vocab.html", "grammar/te-oku.html", "flashcards.html", "analyzer.html", "data.html", "404.html"):
                page.goto(site_url + path)
                expect(page.locator("html")).to_have_attribute("lang", language)
                for width in (320, 390, 1024, 1440):
                    page.set_viewport_size({"width": width, "height": 900})
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), (language, theme, path, width)
                assert not page.locator("body").evaluate("el => el.textContent.includes('${ui(')")
                assert page.evaluate("""() => Array.from(document.querySelectorAll('[data-i18n]')).every(el => {
                    const params = JSON.parse(el.dataset.i18nParams || '{}');
                    return el.textContent === KotowaI18n.t(el.dataset.i18n, params);
                })""")
    page.close()
