"""canonical URL for scraper dedupe — stdlib only."""
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


def canonicalize_url(url: str) -> str:
    """Normalize URL for dedup: lower host, strip utm_*, sort query, drop fragment."""
    if not url:
        return url
    p = urlparse(url.strip())
    scheme = p.scheme.lower()

    # lower host only (preserve userinfo case, port)
    if p.hostname:
        host = p.hostname.lower()
        # ponytail: reconstruct netloc to avoid lowercasing userinfo
        userinfo = ""
        if p.username:
            userinfo = p.username
            if p.password is not None:
                userinfo += f":{p.password}"
            userinfo += "@"
        if p.port:
            host = f"{host}:{p.port}"
        # handle IPv6 bracket
        if ":" in p.hostname and not host.startswith("["):
            # urlparse strips brackets; restore if original had them
            if "[" in p.netloc:
                host = f"[{p.hostname.lower()}]"
                if p.port:
                    host += f":{p.port}"
        netloc = f"{userinfo}{host}"
    else:
        netloc = p.netloc.lower()

    # strip utm_* and sort
    qsl = parse_qsl(p.query, keep_blank_values=True)
    qsl = [(k, v) for k, v in qsl if not k.lower().startswith("utm_")]
    qsl.sort(key=lambda kv: (kv[0], kv[1]))
    query = urlencode(qsl, doseq=True)

    return urlunparse((scheme, netloc, p.path, p.params, query, ""))


if __name__ == "__main__":  # ponytail: minimal self-check, run `python -m src.scraper.canonical`
    assert canonicalize_url("https://EXAMPLE.COM/path") == "https://example.com/path"
    assert canonicalize_url("https://example.com/?utm_source=x&a=1&b=2") == "https://example.com/?a=1&b=2"
    assert canonicalize_url("https://example.com/?z=1&a=2") == "https://example.com/?a=2&z=1"
    assert canonicalize_url("https://example.com/p#frag") == "https://example.com/p"
    assert canonicalize_url("https://EXAMPLE.COM/p?z=1&utm_medium=cpc&a=2#x") == "https://example.com/p?a=2&z=1"
    print("ok")
