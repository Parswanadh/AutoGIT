"""probe_json: markdown + ld+json wrapper."""
from src.scraper.probe import probe_json


def test_direct_json():
    assert probe_json('{"a": 1, "b": 2}') == {"a": 1, "b": 2}


def test_markdown_json_fence():
    assert probe_json('```json\n{"a":1}\n```') == {"a": 1}


def test_markdown_generic_fence():
    assert probe_json('```\n{"a":1}\n```') == {"a": 1}


def test_markdown_with_preamble():
    assert probe_json('Here is JSON:\n```json\n{"x": 99}\n```\nDone') == {"x": 99}


def test_ldjson_html_true():
    html = '<html><head><script type="application/ld+json">{"@type":"Article","name":"hello"}</script></head></html>'
    assert probe_json(html, html=True) == {"@type": "Article", "name": "hello"}


def test_ldjson_html_true_single_quotes_and_array():
    html = "<script type='application/ld+json'>[{\"a\":1},{\"a\":2}]</script>"
    assert probe_json(html, html=True) == [{"a": 1}, {"a": 2}]


def test_ldjson_multiple_blocks_first_wins():
    html = '<script type="application/ld+json">{"a":1}</script><script type="application/ld+json">{"b":2}</script>'
    assert probe_json(html, html=True) == {"a": 1}


def test_ldjson_with_markdown_inside_script():
    html = '<script type="application/ld+json">```json\n{"a":1}\n```</script>'
    # inner candidate wrapped in markdown should still parse via extract_json_from_text
    assert probe_json(html, html=True) == {"a": 1}


def test_ldjson_empty_block_skipped():
    html = '<script type="application/ld+json">   </script><script type="application/ld+json">{"ok": true}</script>'
    assert probe_json(html, html=True) == {"ok": True}


def test_html_false_fallback_still_extracts():
    html = '<html><script type="application/ld+json">{"a":1}</script></html>'
    # html=False should still find JSON via generic extractor
    assert probe_json(html, html=False) == {"a": 1}


def test_html_true_fallback_to_generic():
    html = '<html><body>{"fallback": 42}</body></html>'
    assert probe_json(html, html=True) == {"fallback": 42}


def test_invalid_returns_none():
    assert probe_json("not json at all") is None
    assert probe_json("```json\nnot json\n```") is None


def test_empty_returns_none():
    assert probe_json("") is None
    assert probe_json("   ") is None
    assert probe_json(None) is None


def test_array_direct():
    assert probe_json('[1,2,3]') == [1, 2, 3]


def test_array_markdown():
    assert probe_json('```json\n[1,2]\n```') == [1, 2]
