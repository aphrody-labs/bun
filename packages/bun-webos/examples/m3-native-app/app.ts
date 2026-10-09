// SPDX-License-Identifier: Apache-2.0
import "@aphrody/m3-front/theme-element";
import "@aphrody/material-web/button/filled-button.js";
import "@aphrody/material-web/button/outlined-button.js";
import "@aphrody/material-web/card/card.js";
import "@aphrody/material-web/progress/circular-progress.js";
import "@aphrody/material-web/navigationrail/navigation-rail.js";
import "@aphrody/material-web/navigationrail/navigation-rail-item.js";

const note = document.querySelector<HTMLTextAreaElement>("#note")!;
const message = document.querySelector<HTMLElement>("#file-message")!;
const windowsResult = document.querySelector<HTMLElement>("#windows-result")!;

async function readNote(): Promise<void> {
  const response = await fetch("/api/note");
  if (!response.ok) throw new Error(`Lecture du fichier impossible (${response.status})`);
  note.value = ((await response.json()) as { text: string }).text;
  message.textContent = "Fichier lu par Bun.file";
}

document.querySelector("#reload")!.addEventListener("click", () => void readNote());
document.querySelector("#save")!.addEventListener("click", async () => {
  const response = await fetch("/api/note", {
    method: "PUT",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: note.value,
  });
  message.textContent = response.ok ? "Enregistré par Bun.write" : `Échec (${response.status})`;
});
document.querySelector("#windows")!.addEventListener("click", async () => {
  const response = await fetch("/api/windows");
  windowsResult.textContent = JSON.stringify(await response.json(), null, 2);
});

await readNote();
