"""
Recognises scraped rows that came from a scraper's mock generator.

ScrapedData has no "simulated" flag, and mock records carry the same metadata
keys as live ones. Mock *content*, though, is pure template text: each
generator fills one of its sentence templates with the query, and the news and
Guardian generators put that sentence first in a fixed body. So every text a
generator could have produced for a workflow can be rebuilt from the scrapers'
own template lists (read here, never changed) and cleaned exactly as the
pipeline cleaned it.

simulated=True means "recognised as generated". False means "not recognised",
not "verified real": a template edited after a run is no longer recognised.
"""

import importlib

from app.agents.cleaning_agent import clean_text

# Twitter/X has no live path at all (see app/scrapers/twitter.py).
ALWAYS_SIMULATED = frozenset({"twitter"})

# source -> (scraper module, template lists, how the generator fills the query)
_TEMPLATES = {
    "hackernews": ("hackernews", ("_POSITIVE_HN", "_NEGATIVE_HN", "_NEUTRAL_HN"), "as_is"),
    "bluesky": ("bluesky", ("_POSITIVE_BSK", "_NEGATIVE_BSK", "_NEUTRAL_BSK"), "as_is"),
    "guardian": ("guardian", ("_POSITIVE_GRD", "_NEGATIVE_GRD", "_NEUTRAL_GRD"), "title"),
    "news": ("newsdata", ("_POSITIVE_NEWS", "_NEGATIVE_NEWS", "_NEUTRAL_NEWS"), "title"),
    "reddit": ("reddit", ("_POSITIVE_POSTS", "_NEGATIVE_POSTS", "_NEUTRAL_POSTS", "_REPLY_TEMPLATES"), "product"),
    "youtube": ("youtube", ("_POSITIVE_COMMENTS", "_NEGATIVE_COMMENTS", "_NEUTRAL_COMMENTS"), "product"),
}


def _fill_value(query: str, style: str) -> str:
    if style == "title":
        return query.title()
    if style == "product":
        return query.replace("+", " ").title()
    return query


def mock_fingerprints(query: str) -> dict[str, tuple[str, ...]]:
    """Per source, the cleaned opening of every text its mock generator can produce."""
    prints: dict[str, tuple[str, ...]] = {}
    for source, (module_name, list_names, style) in _TEMPLATES.items():
        try:
            module = importlib.import_module(f"app.scrapers.{module_name}")
        except Exception:
            continue
        value = _fill_value(query, style)
        rendered = set()
        for list_name in list_names:
            for template in getattr(module, list_name, ()):
                try:
                    text = clean_text(template.format(query=value, product=value))
                except (KeyError, IndexError, ValueError):
                    continue
                if text:
                    rendered.add(text)
        prints[source] = tuple(rendered)
    return prints


def is_simulated(source: str, content: str, fingerprints: dict[str, tuple[str, ...]]) -> bool:
    if source in ALWAYS_SIMULATED:
        return True
    return any(content.startswith(opening) for opening in fingerprints.get(source, ()))
