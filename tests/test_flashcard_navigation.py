"""Session navigation and explicit self-rating regression checks."""
import json

from test_flashcard_focus import browser, site_url, pytestmark  # noqa: F401


KEY = "openjlpt:fc:vocab:N5"


def session(page):
    return page.evaluate("key => JSON.parse(localStorage.getItem(key + ':session'))", KEY)


def progress(page):
    return page.evaluate("key => localStorage.getItem(key)", KEY)


def test_navigation_and_ratings_are_independent(browser, site_url):
    from playwright.sync_api import expect

    page = browser.new_page(locale="zh-CN")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(site_url + "flashcards.html")
    expect(page.locator("#fc-forward")).to_be_enabled()
    for selector, label, shortcut in (
        ("#fc-previous", "上一个", "←"),
        ("#fc-flip", "显示答案", "↑"),
        ("#fc-forward", "下一个", "→"),
        ("#fc-good", "已掌握", "↓"),
    ):
        expect(page.locator(selector)).to_contain_text(label)
        expect(page.locator(selector + " .kbd")).to_have_text(shortcut)
    initial = session(page)
    cards = {card[0]: card[1] for card in page.request.get(site_url + "data/vocab-n5.json").json()}
    expect(page.locator("#fc-previous")).to_be_disabled()
    # Travel farther than two cards, then return without rating or losing cards.
    for index in range(1, 7):
        page.locator("#fc-card").press("ArrowRight")
        expect(page.locator("#fc-front")).to_have_text(cards[initial["ids"][index]])
    for index in range(5, -1, -1):
        page.locator("#fc-card").press("ArrowLeft")
        expect(page.locator("#fc-front")).to_have_text(cards[initial["ids"][index]])
    assert progress(page) is None
    expect(page.locator("#fc-remaining")).to_have_text("20")
    page.locator("#fc-card").press("ArrowUp")
    expect(page.locator("#fc-card")).to_have_class("card fc-card flipped")
    page.reload()
    expect(page.locator("#fc-card")).to_have_class("card fc-card flipped")
    assert progress(page) is None
    page.locator("#fc-card").press("ArrowDown")
    expect(page.locator("#fc-front")).to_have_text(cards[initial["ids"][1]])
    expect(page.locator("#fc-remaining")).to_have_text("19")
    rated = progress(page)
    assert json.loads(rated)[initial["ids"][0]]["box"] == 1
    assert session(page)["ids"] == initial["ids"]
    page.locator("#fc-previous").click()
    expect(page.locator("#fc-front")).to_have_text(cards[initial["ids"][0]])
    expect(page.locator("#fc-good")).to_be_disabled()
    page.locator("#fc-card").press("ArrowDown")
    page.reload()
    expect(page.locator("#fc-front")).to_have_text(cards[initial["ids"][0]])
    expect(page.locator("#fc-good")).to_have_attribute("aria-pressed", "true")
    assert progress(page) == rated
    assert session(page)["done"] == 1
    # An explicit rating works on the front; holding Down must not rate more cards.
    page.locator("#fc-forward").click()
    page.locator("#fc-card").press("ArrowDown")
    expect(page.locator("#fc-remaining")).to_have_text("18")
    page.locator("#fc-card").dispatch_event("keydown", {"key": "ArrowDown", "repeat": True})
    assert session(page)["done"] == 2
    # Shortcuts leave form controls and focused buttons to their normal behavior.
    before = session(page)
    page.locator("#fc-flip").press("ArrowDown")
    page.locator("#language-select").press("ArrowLeft")
    assert session(page) == before
    assert not errors, errors
    page.close()


def test_skipped_cards_completion_and_legacy_resume(browser, site_url):
    from playwright.sync_api import expect

    page = browser.new_page(locale="en-US")
    page.goto(site_url + "flashcards.html")
    expect(page.locator("#fc-good")).to_be_enabled()
    cards = page.request.get(site_url + "data/vocab-n5.json").json()[2:7]
    # Existing sessions contain only pending IDs plus a completed count.
    page.evaluate("""({key, cards}) => {
        localStorage.setItem(key + ':session', JSON.stringify({
            day: new Date().toDateString(), ids: cards.map(card => card[0]), done: 2
        }));
    }""", {"key": KEY, "cards": cards})
    page.reload()
    expect(page.locator("#fc-front")).to_have_text(cards[0][1])
    expect(page.locator("#fc-session-caption")).to_contain_text("2 / 7 completed")
    for _ in range(4):
        page.locator("#fc-forward").click()
    expect(page.locator("#fc-forward")).to_be_disabled()
    expect(page.locator("#fc-remaining")).to_have_text("5")
    assert progress(page) is None
    page.locator("#fc-good").click()
    # Rating the last card returns to skipped cards instead of ending early.
    expect(page.locator("#fc-front")).to_have_text(cards[0][1])
    expect(page.locator("#fc-remaining")).to_have_text("4")
    for card in cards[:4]:
        expect(page.locator("#fc-front")).to_have_text(card[1])
        page.locator("#fc-good").click()
    expect(page.locator("#fc-complete")).to_be_visible()
    expect(page.locator("#fc-session-caption")).to_have_text("7 / 7 completed · Session complete")
    rated = progress(page)
    page.reload()
    expect(page.locator("#fc-complete")).to_be_visible()
    # Even a completed session retains every card for backward browsing.
    for card in reversed(cards):
        page.locator("#fc-previous").click()
        expect(page.locator("#fc-front")).to_have_text(card[1])
        expect(page.locator("#fc-good")).to_be_disabled()
    page.reload()
    expect(page.locator("#fc-front")).to_have_text(cards[0][1])
    expect(page.locator("#fc-remaining")).to_have_text("0")
    assert progress(page) == rated
    for _ in range(5):
        page.locator("#fc-forward").click()
    expect(page.locator("#fc-complete")).to_be_visible()
    page.close()
