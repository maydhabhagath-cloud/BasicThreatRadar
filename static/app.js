const $ = (id) => document.getElementById(id);
const SAVED_KEY = "threatRadar.saved.v2";
const HISTORY_KEY = "threatRadar.history.v2";
const THEME_KEY = "threatRadar.theme.v1";
let allResults = [];
let lastQuery = "cybersecurity threat";
let lastSuccessfulScan = false;
let savedItems = loadLocal(SAVED_KEY, []);
let queryHistory = loadLocal(HISTORY_KEY, []);
let scanMeta = { fetchedAt: null, region: "in", source: "SerpApi Google News" };
let toastTimer;

function loadLocal(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key) || "null"); return Array.isArray(value) ? value : fallback; }
  catch { return fallback; }
}
function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { showToast("Browser storage is full", "Remove a few saved reports and try again.", "warning"); return false; }
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function safeHttpUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; }
  catch { return false; }
}
function tickClock() {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  $("dateLabel").textContent = now.toLocaleDateString([], { weekday: "short", month: "short", day: "2-digit" }).toUpperCase();
}
tickClock();
setInterval(tickClock, 1000);

function showToast(title, message = "", type = "success") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-mark">${type === "success" ? "✓" : type === "warning" ? "!" : "i"}</span><div><b>${esc(title)}</b>${message ? `<p>${esc(message)}</p>` : ""}</div><button type="button" aria-label="Dismiss notification">×</button>`;
  el.querySelector("button").addEventListener("click", () => el.remove());
  $("toastRegion").appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast-visible"));
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.classList.remove("toast-visible"); window.setTimeout(() => el.remove(), 300); }, 4200);
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("Backend is unavailable");
    const data = await response.json();
    const configured = Boolean(data.serpapi_configured);
    $("connectionLabel").textContent = configured ? "ENGINE CONFIGURED" : "API KEY REQUIRED";
    $("engineStatus").textContent = configured ? "KEY CONFIGURED" : "KEY NEEDED";
    $("engineStatus").style.color = configured ? "var(--cyan)" : "var(--orange)";
    $("providerDot").className = `provider-dot ${configured ? "is-online" : "is-error"}`;
    $("systemPillText").textContent = configured ? "ENGINE READY" : "API KEY NEEDED";
    document.querySelector(".system-pill").classList.toggle("system-error", !configured);
  } catch {
    $("connectionLabel").textContent = "BACKEND OFFLINE";
    $("engineStatus").textContent = "OFFLINE";
    $("engineStatus").style.color = "var(--red)";
    $("providerDot").className = "provider-dot is-error";
    $("systemPillText").textContent = "BACKEND OFFLINE";
    document.querySelector(".system-pill").classList.add("system-error");
  }
}

function currentVisibleResults() {
  const filter = $("severityFilter").value;
  const term = $("feedSearch").value.trim().toLowerCase();
  let visible = allResults.filter((item) => (filter === "All" || item.severity === filter) && (!term || `${item.title} ${item.snippet} ${item.source}`.toLowerCase().includes(term)));
  const sort = $("sortSelect").value;
  const ranks = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  if (sort === "risk") visible = [...visible].sort((a, b) => (ranks[b.severity] || 0) - (ranks[a.severity] || 0));
  if (sort === "source") visible = [...visible].sort((a, b) => String(a.source).localeCompare(String(b.source)));
  return visible;
}
function resultIsSaved(item) { return savedItems.some((saved) => saved.id === item.id || (saved.link && saved.link === item.link)); }
function severityClass(severity) { return ({ Critical: "critical", High: "high", Medium: "medium", Low: "low" })[severity] || "low"; }

function renderFeed() {
  const visible = currentVisibleResults();
  $("feedCount").textContent = visible.length;
  $("navCount").textContent = visible.length;
  if (!allResults.length) {
    $("results").innerHTML = `<div class="empty-state"><div class="empty-art"><span class="empty-ring"></span><span class="empty-cross">+</span><span class="empty-lens">⌕</span></div><span class="empty-kicker">SYSTEM STANDING BY</span><h3>Ready to find the signal.</h3><p>Run a scan to collect current security reporting from across the open web.</p><button class="secondary-button" id="starterBtn" type="button">Scan cybersecurity threats <span>↗</span></button></div>`;
    $("starterBtn").addEventListener("click", () => scan("cybersecurity threat"));
    return;
  }
  if (!visible.length) {
    $("results").innerHTML = `<div class="empty-state compact-empty"><div class="empty-art"><span class="empty-lens">⌕</span></div><span class="empty-kicker">FILTER RETURNED ZERO ITEMS</span><h3>No reports match these controls.</h3><p>Try another keyword or select “All severities”. Your scan results are still loaded.</p><button class="secondary-button" id="clearFiltersBtn" type="button">Clear filters <span>↻</span></button></div>`;
    $("clearFiltersBtn").addEventListener("click", () => { $("severityFilter").value = "All"; $("feedSearch").value = ""; $("sortSelect").value = "relevance"; renderFeed(); });
    return;
  }
  $("results").innerHTML = visible.map((item, index) => {
    const saved = resultIsSaved(item);
    const link = safeHttpUrl(item.link) ? `<a class="source-link" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Open original <span>↗</span></a>` : `<span class="result-date">Source link unavailable</span>`;
    const thumb = safeHttpUrl(item.thumbnail) ? `<img src="${esc(item.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('thumb-failed');this.remove()">` : `<span>${esc((item.source || "OSINT").slice(0, 1).toUpperCase())}</span>`;
    return `<article class="result-card" style="animation-delay:${Math.min(index * 32, 320)}ms"><div class="severity-bar ${severityClass(item.severity)}"></div><div class="result-main"><div class="result-top"><span class="source-line"><span class="source-avatar">${thumb}</span><span>${esc(item.source || "News source")} <small>PUBLIC REPORT</small></span></span><span class="severity ${severityClass(item.severity)}">${esc(String(item.severity || "Low").toUpperCase())}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.snippet || "No summary supplied by the source.")}</p><div class="result-bottom"><span class="result-date"><span class="date-dot"></span>${esc(item.date || "Recently published")}</span><div class="result-actions"><button type="button" class="save-button ${saved ? "is-saved" : ""}" data-save-id="${esc(item.id)}" aria-pressed="${saved}" title="${saved ? "Remove from saved intelligence" : "Save report"}">${saved ? "▣ Saved" : "+ Save report"}</button>${link}</div></div></div></article>`;
  }).join("");
  document.querySelectorAll("[data-save-id]").forEach((button) => button.addEventListener("click", () => toggleSaved(button.dataset.saveId)));
}

function renderMetrics() {
  const critical = allResults.filter((item) => item.severity === "Critical").length;
  const high = allResults.filter((item) => item.severity === "High").length;
  const medium = allResults.filter((item) => item.severity === "Medium").length;
  const low = allResults.filter((item) => item.severity === "Low").length;
  const sources = new Set(allResults.map((item) => item.source).filter(Boolean));
  $("metricReports").textContent = allResults.length;
  $("metricHigh").textContent = critical + high;
  $("metricSources").textContent = sources.size;
  $("factorCritical").textContent = critical;
  $("factorHigh").textContent = high;
  $("factorMedium").textContent = medium;
  $("severityTotal").textContent = `${allResults.length} report${allResults.length === 1 ? "" : "s"}`;
  $("sourceTotal").textContent = `${sources.size} source${sources.size === 1 ? "" : "s"}`;
  const totals = { Critical: critical, High: high, Medium: medium, Low: low };
  const colors = { Critical: "var(--red)", High: "var(--orange)", Medium: "var(--violet)", Low: "var(--cyan)" };
  if (!allResults.length) $("severityChart").innerHTML = `<div class="chart-empty">Run a scan to calculate the distribution.</div>`;
  else $("severityChart").innerHTML = Object.entries(totals).map(([key, count]) => {
    const percent = allResults.length ? Math.round(count / allResults.length * 100) : 0;
    return `<div class="severity-row"><div class="severity-row-top"><span><i class="severity-key" style="background:${colors[key]}"></i>${key}</span><span><b>${count}</b><small>${percent}%</small></span></div><div class="bar-track"><span style="width:${percent}%;background:${colors[key]}"></span></div></div>`;
  }).join("");
  const sourceCounts = new Map();
  allResults.forEach((item) => { const source = item.source || "News source"; sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1); });
  const topSources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
  $("sourceList").innerHTML = topSources.length ? topSources.map(([name, count], i) => `<div class="source-row"><span class="source-rank">0${i + 1}</span><span class="source-name" title="${esc(name)}">${esc(name)}</span><span class="source-track"><i style="width:${Math.max(8, Math.round(count / Math.max(1, ...topSources.map((source) => source[1])) * 100))}%"></i></span><b>${count}</b></div>`).join("") : `<div class="chart-empty">Publisher signals appear after a scan.</div>`;
  const score = allResults.length ? Math.round((critical * 1 + high * .68 + medium * .34 + low * .12) / allResults.length * 100) : null;
  $("signalScore").innerHTML = score === null ? `—<small>/100</small>` : `${score}<small>/100</small>`;
  const circumference = 235.62;
  const offset = score === null ? circumference : circumference * (1 - score / 100);
  $("gaugeValue").style.strokeDasharray = `${circumference}`;
  $("gaugeValue").style.strokeDashoffset = String(offset);
  $("signalLevel").textContent = score === null ? "AWAITING REPORTS" : score >= 70 ? "ELEVATED SIGNAL DENSITY" : score >= 40 ? "MODERATE SIGNAL DENSITY" : "LOWER SIGNAL DENSITY";
  $("feedFootQuery").innerHTML = allResults.length ? `QUERY: ${esc(lastQuery.toUpperCase())} <b>·</b> REGION ${esc((scanMeta.region || "in").toUpperCase())}` : `AWAITING FIRST SCAN <b>·</b> LIVE PUBLIC REPORTING`;
}

function renderHistory() {
  const unique = queryHistory.slice(0, 6);
  $("queryHistory").innerHTML = unique.length ? unique.map((item) => `<button type="button" class="history-item" data-history-query="${esc(item.query)}"><span>↳</span><span>${esc(item.query)}</span><small>${esc(item.time || "RECENT")}</small></button>`).join("") : `<p class="history-empty">Your recent scans will appear here.</p>`;
  document.querySelectorAll("[data-history-query]").forEach((button) => button.addEventListener("click", () => scan(button.dataset.historyQuery)));
}

function rememberQuery(query) {
  const now = new Date();
  queryHistory = [{ query, time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) }, ...queryHistory.filter((item) => item.query.toLowerCase() !== query.toLowerCase())].slice(0, 6);
  saveLocal(HISTORY_KEY, queryHistory);
  renderHistory();
}

function renderSaved() {
  $("savedCount").textContent = savedItems.length;
  $("savedHeadingCount").textContent = savedItems.length;
  if (!savedItems.length) {
    $("savedResults").innerHTML = `<div class="saved-empty"><span>▣</span><b>Your board is empty</b><p>Use “Save report” on any threat feed item to collect intelligence here.</p></div>`;
    return;
  }
  $("savedResults").innerHTML = savedItems.map((item) => `<article class="saved-card"><div class="saved-card-top"><span class="severity ${severityClass(item.severity)}">${esc(String(item.severity || "Low").toUpperCase())}</span><button type="button" class="remove-saved" data-remove-saved="${esc(item.id)}" aria-label="Remove saved report">×</button></div><span class="saved-source">${esc(item.source || "NEWS SOURCE")}</span><h3>${esc(item.title)}</h3><p>${esc(item.snippet || "No summary supplied.")}</p><div class="saved-card-foot"><span>${esc(item.date || "Recently published")}</span>${safeHttpUrl(item.link) ? `<a class="source-link" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Read source ↗</a>` : ""}</div></article>`).join("");
  document.querySelectorAll("[data-remove-saved]").forEach((button) => button.addEventListener("click", () => removeSaved(button.dataset.removeSaved)));
}

function renderAll() { renderFeed(); renderMetrics(); renderSaved(); }
function toggleSaved(id) {
  const item = allResults.find((report) => report.id === id);
  if (!item) return;
  const index = savedItems.findIndex((saved) => saved.id === item.id || (saved.link && saved.link === item.link));
  if (index >= 0) { savedItems.splice(index, 1); showToast("Removed from saved intelligence", "The report was removed from your local board.", "info"); }
  else { savedItems.unshift({ ...item, savedAt: new Date().toISOString() }); savedItems = savedItems.slice(0, 100); showToast("Report saved", "Added to your local intelligence board."); }
  saveLocal(SAVED_KEY, savedItems); renderSaved(); renderFeed();
}
function removeSaved(id) {
  savedItems = savedItems.filter((item) => item.id !== id);
  saveLocal(SAVED_KEY, savedItems); renderSaved(); renderFeed();
  showToast("Saved report removed", "Your intelligence board has been updated.", "info");
}

function friendlyError(rawMessage, status) {
  const message = String(rawMessage || "");
  if (/invalid api key|api key.*invalid|invalid.*key/i.test(message)) return { title: "SerpApi rejected the API key", message: "Open your SerpApi dashboard and copy your current API key. Set SERPAPI_KEY in the same terminal used to start ThreatRadar, then restart the server. The key must not be placed in frontend files." };
  if (/run out|quota|limit|credits|searches left|monthly searches/i.test(message) || status === 429) return { title: "SerpApi search limit reached", message: "The account may have reached its available search allowance. Check the SerpApi dashboard before retrying to avoid repeated failed requests." };
  if (/not configured|key is not configured/i.test(message)) return { title: "SerpApi key is not configured", message: "Set SERPAPI_KEY in the same CMD window, stop the server with Ctrl+C, and restart it. Do not commit your key to GitHub." };
  if (status === 502 || /could not reach serpapi|timeout|network/i.test(message)) return { title: "Could not reach SerpApi", message: "Check the internet connection, then retry. Your current result set is kept in the dashboard where possible." };
  return { title: "The scan could not be completed", message: message || "Something interrupted the request. Check the server terminal for details, then retry." };
}
function showError(title, message) {
  $("errorTitle").textContent = title;
  $("errorMessage").textContent = message;
  $("errorBox").hidden = false;
  $("systemPillText").textContent = "SCAN NEEDS ATTENTION";
  document.querySelector(".system-pill").classList.add("system-error");
}

async function scan(query) {
  query = (query || $("query").value).trim();
  if (query.length < 2) { showError("Enter a longer search topic", "Use at least two characters, such as ransomware campaign or a CVE identifier."); return; }
  lastQuery = query;
  $("query").value = query;
  $("searchBtn").disabled = true;
  $("searchBtn").querySelector(".button-label").textContent = "Scanning threat landscape…";
  $("loading").hidden = false;
  $("errorBox").hidden = true;
  if (!lastSuccessfulScan) $("metricUpdated").textContent = "SCANNING";
  const region = $("regionSelect").value;
  const limit = Number($("limitSelect").value) || 15;
  try {
    const params = new URLSearchParams({ q: query, limit: String(limit), region });
    const response = await fetch(`/api/search?${params.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const formatted = friendlyError(data.detail || data.message, response.status);
      showError(formatted.title, formatted.message);
      $("metricUpdated").textContent = "NEEDS FIX";
      showToast(formatted.title, formatted.message, "warning");
      return;
    }
    allResults = Array.isArray(data.results) ? data.results : [];
    scanMeta = { fetchedAt: data.fetched_at || new Date().toISOString(), region: data.region || region, source: data.source || "SerpApi Google News" };
    lastSuccessfulScan = true;
    $("metricUpdated").textContent = new Date(scanMeta.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    $("metricUpdatedFoot").textContent = `Fetched · ${region.toUpperCase()}`;
    $("connectionLabel").textContent = "ENGINE RESPONDING";
    $("engineStatus").textContent = "LIVE RESULTS";
    $("engineStatus").style.color = "var(--green)";
    $("providerDot").className = "provider-dot is-online";
    $("systemPillText").textContent = "ENGINE LIVE";
    document.querySelector(".system-pill").classList.remove("system-error");
    rememberQuery(query);
    renderAll();
    if (allResults.length) showToast("Intelligence scan complete", `${allResults.length} report${allResults.length === 1 ? "" : "s"} retrieved for “${query}”.`);
    else showToast("Scan complete", "No reports matched that query. Try a broader topic.", "info");
  } catch (error) {
    const formatted = friendlyError(error.message, 0);
    showError(formatted.title, formatted.message);
    $("metricUpdated").textContent = "OFFLINE";
  } finally {
    $("loading").hidden = true;
    $("searchBtn").disabled = false;
    $("searchBtn").querySelector(".button-label").textContent = "Run intelligence scan";
  }
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCsv(items, fileName) {
  if (!items.length) { showToast("Nothing to export", "Run a scan or save a report first.", "warning"); return; }
  const columns = ["title", "severity", "source", "date", "snippet", "link", "category"];
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [columns.join(","), ...items.map((item) => columns.map((column) => quote(item[column])).join(","))].join("\r\n");
  downloadBlob(fileName, `\ufeff${csv}`, "text/csv;charset=utf-8;");
  showToast("CSV export ready", `${items.length} report${items.length === 1 ? "" : "s"} exported.`);
}
function exportJson(items, fileName) {
  if (!items.length) { showToast("Nothing to export", "Run a scan or save a report first.", "warning"); return; }
  downloadBlob(fileName, JSON.stringify({ exported_at: new Date().toISOString(), query: lastQuery, count: items.length, reports: items }, null, 2), "application/json;charset=utf-8;");
  showToast("JSON export ready", `${items.length} report${items.length === 1 ? "" : "s"} exported.`);
}

$("searchForm").addEventListener("submit", (event) => { event.preventDefault(); scan(); });
$("refreshBtn").addEventListener("click", () => scan(lastQuery));
$("starterBtn").addEventListener("click", () => scan("cybersecurity threat"));
$("severityFilter").addEventListener("change", renderFeed);
$("feedSearch").addEventListener("input", renderFeed);
$("sortSelect").addEventListener("change", renderFeed);
$("dismissError").addEventListener("click", () => { $("errorBox").hidden = true; });
document.querySelectorAll("[data-query]").forEach((button) => button.addEventListener("click", () => scan(button.dataset.query)));
$("exportCsvBtn").addEventListener("click", () => exportCsv(currentVisibleResults(), `threatRadar-${new Date().toISOString().slice(0, 10)}.csv`));
$("exportJsonBtn").addEventListener("click", () => exportJson(currentVisibleResults(), `threatRadar-${new Date().toISOString().slice(0, 10)}.json`));
$("exportSavedBtn").addEventListener("click", () => exportJson(savedItems, `threatRadar-saved-${new Date().toISOString().slice(0, 10)}.json`));
$("clearSavedBtn").addEventListener("click", () => {
  if (!savedItems.length) { showToast("Board is already empty", "Save a report from the feed first.", "info"); return; }
  if (!window.confirm("Remove all reports from your local Saved Intelligence board?")) return;
  savedItems = []; saveLocal(SAVED_KEY, savedItems); renderSaved(); renderFeed(); showToast("Saved board cleared", "Saved reports were removed from this browser.", "info");
});
$("themeToggle").addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light-theme");
  try { localStorage.setItem(THEME_KEY, isLight ? "light" : "dark"); } catch {}
  $("themeToggle").textContent = isLight ? "☾" : "☼";
  $("themeToggle").setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
});
try {
  const prefersLight = localStorage.getItem(THEME_KEY) === "light";
  if (prefersLight) { document.body.classList.add("light-theme"); $("themeToggle").textContent = "☾"; $("themeToggle").setAttribute("aria-label", "Switch to dark theme"); }
} catch {}
document.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing = target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
  if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); $("query").focus(); $("query").select(); }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); if (!$("searchBtn").disabled) scan(); }
});
document.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", () => {
  document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
  link.classList.add("active");
  const label = link.querySelector("span:nth-child(2)");
  if (label) $("breadcrumbCurrent").textContent = label.textContent;
}));

renderHistory(); renderSaved(); renderMetrics(); checkHealth();
