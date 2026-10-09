import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

APP_DIR = os.path.dirname(os.path.abspath(__file__))
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "").strip()
SUPPORTED_REGIONS = {"in", "us", "gb", "ca", "au"}

app = FastAPI(
    title="ThreatRadar API",
    version="2.0.0",
    description="Live cyber threat intelligence powered by SerpApi Google News",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "ThreatRadar",
        "version": "2.0.0",
        "serpapi_configured": bool(SERPAPI_KEY),
        "supported_regions": sorted(SUPPORTED_REGIONS),
    }


@app.get("/api/search")
async def search_threats(
    q: str = Query("cybersecurity threat", min_length=2, max_length=180),
    category: Optional[str] = Query(None, max_length=40),
    limit: int = Query(15, ge=1, le=20),
    region: str = Query("in", min_length=2, max_length=2),
):
    if not SERPAPI_KEY:
        raise HTTPException(
            status_code=503,
            detail="SerpApi key is not configured. Set SERPAPI_KEY in your environment and restart ThreatRadar.",
        )

    region = region.lower().strip()
    if region not in SUPPORTED_REGIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported region. Choose one of: {', '.join(sorted(SUPPORTED_REGIONS))}.",
        )

    query = q.strip()
    if category and category.lower() != "all":
        query = f"{query} {category.strip()}"

    params = {
        "engine": "google_news",
        "q": query,
        "api_key": SERPAPI_KEY,
        "hl": "en",
        "gl": region,
    }

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.get("https://serpapi.com/search.json", params=params)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        detail = "SerpApi rejected the request. Check the API key and account quota."
        try:
            detail = exc.response.json().get("error", detail)
        except (ValueError, AttributeError):
            pass
        raise HTTPException(status_code=502, detail=detail) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Could not reach SerpApi. Please retry.") from exc

    raw_results = payload.get("news_results", [])[:limit]
    items = []
    for index, item in enumerate(raw_results):
        source = item.get("source") or {}
        title = item.get("title") or "Untitled report"
        link = item.get("link") or ""
        snippet = item.get("snippet") or title or "No summary supplied by the source."
        date = item.get("date") or "Recently published"
        source_name = source.get("name", "News source") if isinstance(source, dict) else str(source)
        items.append(
            {
                "id": f"{item.get('position', index + 1)}-{abs(hash(link or title)) % 1000000}",
                "title": title,
                "snippet": snippet,
                "source": source_name,
                "link": link,
                "date": date,
                "thumbnail": item.get("thumbnail"),
                "category": category or "General",
                "severity": classify_severity(f"{title} {snippet}"),
            }
        )

    return {
        "query": q.strip(),
        "effective_query": query,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "count": len(items),
        "results": items,
        "region": region,
        "source": "SerpApi Google News",
    }


def classify_severity(text: str) -> str:
    """Classify reporting with explainable keyword rules; not a validated risk score."""
    normalized = text.lower()
    critical_terms = (
        "ransomware",
        "zero-day",
        "zero day",
        "actively exploited",
        "critical vulnerability",
        "mass breach",
    )
    high_terms = (
        "data breach",
        "malware",
        "exploit",
        "phishing",
        "botnet",
        "credential theft",
        "cve-",
    )
    medium_terms = ("patch", "security update", "vulnerability", "cyberattack", "cyber attack")

    if any(term in normalized for term in critical_terms):
        return "Critical"
    if any(term in normalized for term in high_terms):
        return "High"
    if any(term in normalized for term in medium_terms):
        return "Medium"
    return "Low"


# Keep the frontend and API in one service to simplify local running and deployment.
app.mount("/static", StaticFiles(directory=os.path.join(APP_DIR, "static")), name="static")


@app.get("/")
async def home():
    return FileResponse(os.path.join(APP_DIR, "static", "index.html"))
