const content = document.querySelector("#demo-content");
const title = document.querySelector("#window-title");
const examples = {
  files: [
    "Fichiers d’exemple",
    '<h2>Votre projet</h2><div class="file-row"><span>▤</span>README.md</div><div class="file-row"><span>▤</span>package.json</div><div class="file-row"><span>▤</span>src/</div><p class="demo-caption">Exemples de démonstration. Aucun fichier de votre machine n’est lu.</p>',
  ],
  terminal: [
    "Terminal de démonstration",
    '<h2>Un terminal, dans votre WebOS</h2><div class="terminal">$ bun --version\n1.4.4\n\n$ echo "Bonjour WebOS"\nBonjour WebOS</div><p class="demo-caption">Exemple illustratif. Les commandes du bureau installé s’exécutent sur votre propre machine.</p>',
  ],
  settings: [
    "Apparence",
    '<h2>Choisissez votre ambiance</h2><p>La couleur change uniquement cette démonstration.</p><div class="theme-row"><button data-theme="#dce5f8">Bleu</button><button data-theme="#d8ebe6">Sauge</button></div>',
  ],
};
document.querySelectorAll("[data-app]").forEach((button) => {
  button.addEventListener("click", () => {
    const [name, html] = examples[button.dataset.app];
    title.textContent = name;
    content.innerHTML = html;
    document
      .querySelectorAll("[data-app]")
      .forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  });
});
content.addEventListener("click", (event) => {
  const button = event.target.closest("[data-theme]");
  if (button) document.documentElement.style.setProperty("--desktop", button.dataset.theme);
});
