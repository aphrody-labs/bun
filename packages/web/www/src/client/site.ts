// The script every page loads: search, copy buttons on code blocks and on commands, and the tabs of the docs.
interface SearchEntry {
  /** Title */
  t: string;
  /** Description */
  d: string;
  /** URL */
  u: string;
  /** Group */
  g: string;
  /** Headings */
  h: string[];
  /** Start of the text */
  x: string;
}

const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  root.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(selector),
];

async function copy(text: string, button: HTMLElement) {
  await navigator.clipboard.writeText(text);
  const label = button.textContent;
  button.dataset.copied = "";
  if (button.classList.contains("copy")) button.textContent = "Copied";
  setTimeout(() => {
    delete button.dataset.copied;
    if (button.classList.contains("copy")) button.textContent = label;
  }, 1500);
}

// A copy button on every code block of a documentation page.
for (const pre of $$("pre", $(".doc") ?? document.createElement("div"))) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy";
  button.textContent = "Copy";
  button.onclick = () => copy(pre.querySelector("code")?.innerText ?? pre.innerText, button);
  pre.append(button);
}
for (const button of $$("[data-copy]")) button.addEventListener("click", () => copy(button.dataset.copy ?? "", button));
// "Copy page": the Markdown twin of the page, for pasting into an agent.
for (const button of $$("[data-copy-url]"))
  button.addEventListener("click", () =>
    fetch(button.dataset.copyUrl!)
      .then(response => response.text())
      .then(text => copy(text, button)),
  );
// The page tree opens on the current page.
const current = $<HTMLAnchorElement>("aside[aria-label=Documentation] a[aria-current=page]");
const tree = current?.closest("aside");
if (current && tree && tree.scrollHeight > tree.clientHeight)
  tree.scrollTop = current.offsetTop - tree.clientHeight / 2;

// Mintlify tabs: one button per tab, one tab shown.
for (const tabs of $$(".tabs")) {
  const panels = $$(".tab", tabs).filter(panel => panel.parentElement === tabs);
  if (!panels.length) continue;
  const bar = document.createElement("div");
  bar.className = "tab-buttons";
  bar.setAttribute("role", "tablist");
  const select = (index: number) => {
    panels.forEach((panel, i) => panel.classList.toggle("on", i === index));
    $$("button", bar).forEach((button, i) => button.setAttribute("aria-selected", String(i === index)));
  };
  panels.forEach((panel, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.textContent = panel.dataset.title ?? `Tab ${index + 1}`;
    button.onclick = () => select(index);
    bar.append(button);
  });
  tabs.prepend(bar);
  tabs.classList.add("js");
  select(0);
}

// Search over the index built with the pages (/docs/search.json).
const input = $<HTMLInputElement>("#q");
const box = $("#results");
if (input && box) {
  let index: Promise<SearchEntry[]> | undefined;
  let selected = -1;
  const load = () => (index ??= fetch("/docs/search.json").then(response => response.json()));
  const normal = (text: string) => text.toLowerCase().normalize("NFKD");
  const escape = (text: string) =>
    text.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const run = async () => {
    const value = normal(input.value.trim());
    if (!value) return void (box.hidden = true);
    const entries = await load();
    const terms = value.split(/\s+/);
    const scored: [number, SearchEntry][] = [];
    for (const entry of entries) {
      const title = normal(entry.t);
      const headings = normal(entry.h.join(" "));
      const body = normal(`${entry.d} ${entry.x}`);
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += title.startsWith(term) ? 12 : 8;
        else if (headings.includes(term)) score += 4;
        else if (body.includes(term)) score += 1;
        else {
          score = 0;
          break;
        }
      }
      if (score) scored.push([score, entry]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    selected = -1;
    box.innerHTML =
      scored
        .slice(0, 12)
        .map(
          ([, entry]) =>
            `<a href="${escape(entry.u)}" class="block px-3 py-2.5 no-underline hover:bg-raised aria-selected:bg-raised"><span class="text-fg">${escape(entry.t)}</span><span class="block text-xs text-fg-faint">${escape(`${entry.g} · ${entry.d}`)}</span></a>`,
        )
        .join("") || '<p class="m-0 px-3 py-2.5 text-sm text-fg-faint">No results</p>';
    box.hidden = false;
  };
  input.addEventListener("input", run);
  input.addEventListener("focus", load);
  input.addEventListener("keydown", event => {
    const items = $$<HTMLAnchorElement>("a", box);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((item, i) => item.setAttribute("aria-selected", String(i === selected)));
    } else if (event.key === "Enter" && items.length) location.href = (items[selected] ?? items[0]!).href;
    else if (event.key === "Escape") {
      box.hidden = true;
      input.blur();
    }
  });
  document.addEventListener("click", event => {
    if (!(event.target as Element).closest("#q, #results")) box.hidden = true;
  });
  document.addEventListener("keydown", event => {
    if (
      (event.key === "k" && (event.metaKey || event.ctrlKey)) ||
      (event.key === "/" && document.activeElement === document.body)
    ) {
      event.preventDefault();
      input.focus();
    }
  });
}

// Downloads: say so when a runtime release is newer than the one this page was built from.
const latest = $("[data-latest-tag]");
if (latest)
  fetch(`https://api.github.com/repos/${latest.dataset.repo}/releases?per_page=10`)
    .then(response => (response.ok ? response.json() : []))
    .then((releases: { draft: boolean; prerelease: boolean; tag_name: string; html_url: string }[]) => {
      const release = releases.find(r => !r.draft && !r.prerelease && /^(bun-v|aphrody-v)/.test(r.tag_name));
      if (!release || release.tag_name === latest.dataset.latestTag) return;
      const link = document.createElement("a");
      link.href = release.html_url;
      link.textContent = release.tag_name;
      latest.replaceChildren("A newer release is available: ", link, ".");
      latest.hidden = false;
    })
    .catch(() => {});
