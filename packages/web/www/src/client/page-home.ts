// The home page: the install command per operating system, and the terminal, whose programs are typed out once when
// a tab is opened. The markup is complete without this script; it only adds the replay.
const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  root.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(selector),
];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Install command: Windows visitors see the PowerShell line first.
const install = $("[data-install]");
if (install) {
  const show = (os: string) => {
    for (const row of $$("[data-os]", install)) row.hidden = row.dataset.os !== os;
    for (const tab of $$("[data-os-tab]", install)) tab.setAttribute("aria-selected", String(tab.dataset.osTab === os));
  };
  for (const tab of $$("[data-os-tab]", install)) tab.addEventListener("click", () => show(tab.dataset.osTab!));
  if (/Windows/i.test(navigator.userAgent)) show("windows");
}

// Terminal: tabs, and a replay of the command and its output.
const terminal = $("[data-terminal]");
if (terminal) {
  const tabs = $$("[role=tab]", terminal);
  const panels = $$("[data-scene]", terminal);
  let timers: number[] = [];
  const replay = (panel: HTMLElement) => {
    timers.forEach(clearTimeout);
    timers = [];
    const command = $("[data-command]", panel);
    const output = $("[data-output]", panel);
    if (reduceMotion || !command || !output) return;
    output.dataset.full ??= output.textContent ?? "";
    const lines = output.dataset.full.split("\n");
    command.style.visibility = "hidden";
    output.textContent = "";
    timers.push(window.setTimeout(() => (command.style.visibility = ""), 250));
    lines.forEach((line, i) =>
      timers.push(window.setTimeout(() => (output.textContent += (i ? "\n" : "") + line), 700 + i * 260)),
    );
  };
  const open = (id: string) => {
    for (const tab of tabs) tab.setAttribute("aria-selected", String(tab.id === `tab-${id}`));
    for (const panel of panels) panel.hidden = panel.dataset.scene !== id;
    const panel = panels.find(p => p.dataset.scene === id);
    if (panel) replay(panel);
  };
  for (const tab of tabs) tab.addEventListener("click", () => open(tab.id.replace(/^tab-/, "")));
  const first = panels[0];
  if (first) replay(first);
}
