import json, re, statistics, sys, time
import cloudscraper

url, runs = sys.argv[1], int(sys.argv[2])
scraper = cloudscraper.create_scraper()
out = []
for _ in range(runs):
    t0 = time.perf_counter()
    r = scraper.get(url, headers={"user-agent": "Mozilla/5.0 (compatible; bench)"}, timeout=30)
    html = r.text
    title = (re.search(r"<title>(.*?)</title>", html, re.S) or [None, ""])[1].strip()
    items = len(re.findall(r'<span class="titleline"><a ', html))
    out.append({"ms": (time.perf_counter() - t0) * 1000, "status": r.status_code, "title": title, "items": items})
print(json.dumps({"runs": out, "medianMs": statistics.median(x["ms"] for x in out)}))
