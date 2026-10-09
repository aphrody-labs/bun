import json, math, sys
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from statistics import median

directory = Path(sys.argv[1])
report = json.loads((directory / "product-benchmarks.json").read_text())
rows = [row for row in report["cases"] if row["status"] == "measured"]
if not rows:
    raise SystemExit("No measured cases to plot")
labels = [row["id"] + " (" + row["metric"] + ")" for row in rows]
positions = list(range(len(rows)))
ratios = [row["interval"]["ratio"] for row in rows]
low = [row["interval"]["low"] for row in rows]
high = [row["interval"]["high"] for row in rows]
if not all(math.isfinite(v) and v > 0 for v in ratios + low + high):
    raise SystemExit("Invalid plotted ratio")
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "axes.spines.top": False, "axes.spines.right": False})
fig, axes = plt.subplots(1, 3, figsize=(18, max(6, len(rows) * .5)), gridspec_kw={"width_ratios": [1.35, 1, 1]})
axes[0].errorbar(ratios, positions, xerr=[[a-b for a,b in zip(ratios,low)],[b-a for a,b in zip(ratios,high)]], fmt="o", color="#2855a5", capsize=3)
axes[0].axvline(1, color="#666666", linestyle="--", linewidth=1)
axes[0].set_xscale("log")
axes[0].set_yticks(positions, labels)
axes[0].set_xlabel("Reference / Bun time, paired bootstrap 95% interval")
axes[0].set_title("Per-workload ratio (above 1 favours Bun)")
for side, offset, color in [("left", -.12, "#2855a5"), ("right", .12, "#d57b24")]:
    axes[1].scatter([row[side]["median"] for row in rows], [p+offset for p in positions], color=color, s=25)
    rss = [median(sample[side]["rssKiB"] for sample in row["raw"]) / 1024 for row in rows]
    axes[2].scatter(rss, [p+offset for p in positions], color=color, s=25)
axes[1].set_xscale("log")
axes[1].set_title("Median measured time")
axes[1].set_xlabel("Milliseconds (workMs or wallMs as labelled)")
axes[2].set_title("Median reported peak RSS")
axes[2].set_xlabel("MiB, GNU time per-process maximum")
for axis in axes:
    axis.invert_yaxis()
    axis.grid(axis="x", alpha=.2)
for axis in axes[1:]:
    axis.set_yticks(positions, [""] * len(rows))
fig.suptitle("Bun products vs reference implementations · SSH VPS", fontsize=15)
fig.legend(handles=[Line2D([0],[0],marker="o",color="w",markerfacecolor="#2855a5",label="Bun product"),Line2D([0],[0],marker="o",color="w",markerfacecolor="#d57b24",label="Reference")],loc="lower center",ncol=2)
footer = report["environment"]["bunVersion"] + " · " + report["generatedAt"] + " · " + str(report["samples"]) + " paired samples · no result plotted for unsupported or failed cases"
fig.text(.5, .01, footer, ha="center", fontsize=8)
fig.tight_layout(rect=(0,.06,1,.95))
fig.savefig(directory / "comparison.png", dpi=160)
fig.savefig(directory / "comparison.svg")
print(directory / "comparison.png")

