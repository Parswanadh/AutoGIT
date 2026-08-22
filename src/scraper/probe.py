"""probe_json wrapper for scraper resilience. markdown + ld+json."""
import json
import re
from typing import Optional, Union, Dict, List, Any

from src.utils.json_parser import extract_json_from_text

# ponytail: first valid ld+json wins, merge/graph-array handling if site uses @graph lists
_LDJSON_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


def probe_json(resp_text: str, html: bool = False) -> Optional[Union[Dict, List]]:
    """Extract JSON from scraper response.

    Wraps src.utils.json_parser.extract_json_from_text.
    - Handles markdown fences (```json / ```) via wrapper.
    - When html=True, extracts first valid application/ld+json block before fallback.

    Args:
        resp_text: raw response text / html
        html: if True, try LD+JSON extraction first

    Returns:
        Parsed dict/list or None.
    """
    if not resp_text or not isinstance(resp_text, str) or not resp_text.strip():
        return None

    if html:
        for raw in _LDJSON_RE.findall(resp_text):
            candidate = raw.strip()
            if not candidate:
                continue
            # LD block may itself be wrapped in markdown or have preamble
            parsed = extract_json_from_text(candidate)
            if parsed is not None:
                return parsed
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    return extract_json_from_text(resp_text)


if __name__ == "__main__":
    # ponytail: minimal self-check, fails if wrapper breaks
    assert probe_json('{"a":1}') == {"a": 1}
    assert probe_json('```json\n{"a":1}\n```') == {"a": 1}
    assert probe_json('```\n{"a":1}\n```') == {"a": 1}
    html_doc = '<html><script type="application/ld+json">{"@type":"Article","name":"x"}</script></html>'
    assert probe_json(html_doc, html=True) == {"@type": "Article", "name": "x"}
    assert probe_json(html_doc, html=False) is not None  # fallback still finds json
    assert probe_json("") is None
    assert probe_json("not json") is None
    print("probe self-check ok")
