# ThreatRadar — Cyber Intelligence Console

ThreatRadar is a source-first cyber threat intelligence dashboard. It retrieves current public reporting through SerpApi's Google News engine, normalizes the results, and applies transparent keyword-based severity triage to help users investigate reports faster.

## Features

- **Live web intelligence:** SerpApi Google News searches through a FastAPI backend.
- **Region-aware scans:** India, United States, United Kingdom, Canada and Australia.
- **Quick scan profiles:** zero-day exploits, ransomware, phishing, data breaches, CVEs and cloud security.
- **Threat feed controls:** in-memory text search, severity filter, risk-first/source sorting and manual refresh.
- **Signal analytics:** severity distribution, top publisher labels and a relative signal index computed from the current scan.
- **Saved intelligence board:** save or remove individual reports; local browser storage persists across refreshes.
- **Query history:** the last six successful searches are kept locally for quick reuse.
- **Exports:** download visible results as CSV or JSON, and export saved items as JSON.
- **Responsive visual system:** animated radar, vibrant cyan/violet accents, technical grid, motion-aware transitions, toast feedback, and optional light theme.
- **Security-conscious API handling:** the SerpApi key is read by the backend only and is never required in browser JavaScript.
- **Health endpoint:** reports server and API-key configuration state.

## Run locally on Windows CMD

Requires Python 3.10+.

```cmd
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
set "SERPAPI_KEY=YOUR_REAL_SERPAPI_KEY"
.venv\Scripts\python -m uvicorn app:app --reload
```

Run the commands from the folder that contains `app.py` and `requirements.txt`. The environment variable is scoped to that CMD window. If you change the key, stop the server with `Ctrl+C`, set the variable again and restart.

Open the dashboard: http://127.0.0.1:8000  
Health check: http://127.0.0.1:8000/api/health

## API

- `GET /api/health` — service status and whether a key is configured.
- `GET /api/search?q=ransomware%20campaign&limit=15&region=in` — retrieve current Google News results.
- `limit` accepts 1–20. Supported `region` values: `in`, `us`, `gb`, `ca`, `au`.
- Optional `category` appends a category term to the query.

## Severity and score caveat

Critical/High/Medium/Low labels use visible keyword rules applied to headlines and snippets. The relative signal index is a weighted summary of those labels for the current result set. Neither is a validated CVSS score, confirmed incident finding, or prediction. Do not use them alone for operational decisions. News reporting is not a substitute for vendor advisories, NVD/CVE databases, SIEM/EDR telemetry or incident response.

## Deploy

1. Push this folder to a Git repository.
2. Deploy the repository to a Python web service host such as Railway or another ASGI-compatible host.
3. Add `SERPAPI_KEY` as a server-side environment variable in the host settings; do not commit `.env` or the real key.
4. Use a start command equivalent to `uvicorn app:app --host 0.0.0.0 --port $PORT` where required by the host.
5. Test `/api/health`, then run a real query from the public dashboard.

Check each host's current pricing and terms before selecting a deployment target. No app-builder plugin or Replit dependency is required by this project.

## Suggested 2-minute demo

1. Explain the signal-to-noise problem in cyber threat reporting.
2. Run the Ransomware quick scan and switch the region to show region-aware search.
3. Sort by highest risk, then open original publisher links.
4. Save two reports to the intelligence board and show that they persist after refresh.
5. Export the current feed as CSV and saved intelligence as JSON.
6. Explain that severity and signal index are transparent heuristics and that all reporting must be verified at source.
