# Remplacement de WinUI 3 / XAML par Material 3

Inventaire de migration établi le 9 octobre 2026 à partir du [catalogue de contrôles Windows](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/), des composants `md-*` présents dans le front aphrody (`m3-front`, `m3-react`) et des exemples de `packages/bun-webos`.

Microsoft décrit plus de 45 contrôles WinUI. Le tableau couvre les contrôles et motifs courants; « existe » signifie qu’un composant Material Web correspondant est livré par aphrody M3, pas que l’apparence ou le comportement WinUI est reproduit à l’identique.

| Contrôle ou motif WinUI 3 / XAML | Équivalent M3 existant | État |
| --- | --- | --- |
| Button, DropDownButton, SplitButton, ToggleButton | `md-filled-button`, `md-outlined-button`, `md-text-button`, `md-split-button`, `md-button-group` | existe |
| AppBarButton / AppBarToggleButton | `md-icon-button`, `md-filled-icon-button`, `md-bottom-app-bar` | existe |
| CheckBox | `md-checkbox` | existe |
| ComboBox | `md-filled-select` ou `md-outlined-select` avec `md-select-option` | existe |
| HyperlinkButton | `md-link` ou lien HTML | existe |
| RadioButton | `md-radio` | existe |
| RatingControl | `md-rating` | existe |
| Slider | `md-slider` | existe |
| ToggleSwitch | `md-switch` | existe |
| TextBox / PasswordBox / NumberBox | `md-filled-text-field` ou `md-outlined-text-field` | existe |
| AutoSuggestBox / recherche | `md-autocomplete`, `md-search-bar` | existe |
| RichEditBox | aucun éditeur riche M3 livré | à créer |
| ListView / ItemsRepeater | `md-list`, `md-list-item`, `md-virtual-scroller` | existe |
| GridView | `md-grid-list`, `md-grid-tile` | existe |
| TreeView | `md-tree`, `md-tree-item` | existe |
| DataGrid / Table | `md-table` | existe |
| NavigationView | `md-navigation-drawer`, `md-navigation-rail`, `md-navigation-bar` | existe |
| TabView | `md-tabs`, `md-primary-tab`, `md-secondary-tab` | existe |
| CommandBar / MenuBar | `md-top-app-bar`, `md-toolbar`, `md-menu` | existe |
| BreadcrumbBar | `md-breadcrumbs` | existe |
| ContentDialog / Dialog | `md-dialog` | existe |
| Flyout / MenuFlyout / ContextFlyout | `md-menu`, `md-popover`, `md-tooltip` | existe |
| DatePicker / CalendarDatePicker | `md-date-picker`, `md-date-range-picker` | existe |
| TimePicker | `md-time-picker` | existe |
| ColorPicker | thème dynamique M3 via `m3-theme`; pas de sélecteur de couleur M3 | à créer |
| ProgressBar / ProgressRing | `md-linear-progress`, `md-circular-progress`, `md-loading-indicator` | existe |
| InfoBar | `md-alert`, `md-banner`, `md-snackbar` | existe |
| TeachingTip | aucun composant M3 dédié livré | à créer |
| ToolTip | `md-tooltip` | existe |
| Expander | `md-accordion`, `md-expansion-panel` | existe |
| Card | `md-card`, `md-filled-card`, `md-outlined-card` | existe |
| AppWindow / Window | fenêtre native créée par `Bun.WebView` | existe, capacités natives selon backend |

Le catalogue `md-*` est chargé à la demande avec `@aphrody/m3-front` (`registerM3Component` ou `registerM3`). `@aphrody/m3-react` publie le manifeste des tags et leurs modules; les extensions aphrody sont livrées dans son catalogue. Les contrôles encore à créer sont des écarts réels, à couvrir par un nouveau composant ou un assemblage M3 accessible, pas par du XAML.

## Fenêtre et matériaux Windows

- **Mica / Acrylic** : ce sont des matériaux d’arrière-plan de la fenêtre et du système Windows, pas des composants M3. Le backend natif Windows fournit le backdrop; le contenu transparent de la WebView laisse apparaître ce fond. Les surfaces de contenu M3 (`md-surface`, cartes et rôles `surface-container-*`) forment les couches au-dessus. Une couleur M3 opaque ou un `backdrop-filter` ne constitue pas Mica/Acrylic et ne doit pas être présenté comme tel. Mica est une couche de base; Microsoft recommande de ne l’appliquer qu’une fois et de garder transparents les niveaux qui doivent la laisser voir ([guide Mica](https://learn.microsoft.com/en-us/windows/apps/design/style/mica)).
- **Titre personnalisé** : le backend de fenêtre conserve les boutons système, la région de déplacement et les zones interactives non clientes; le contenu HTML peut fournir le titre et les commandes visuelles M3. Une barre de titre entièrement personnalisée doit préserver l’accessibilité clavier et le hit-testing natif ([guide des barres de titre](https://learn.microsoft.com/en-us/windows/apps/develop/title-bar?tabs=winui3)).
- **Snap layouts** : c’est une capacité de la fenêtre Windows, indépendante des composants M3. Garder un bouton d’agrandissement système et son hit-test natif; avec une barre de titre personnalisée, vérifier explicitement le menu Snap sur Windows 11 ([guide Snap layouts](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-snap-layout-menu)).

## Thème Windows et couleur d’accent

Le thème clair/sombre du système choisit le mode M3 (`m3-theme mode="auto"`). Si le backend Windows expose la couleur d’accent, la transmettre comme **seed** à `<m3-theme>` et laisser les utilitaires de couleur aphrody dériver les rôles M3 (`primary`, `on-primary`, `primary-container`, etc.); ne pas recopier une palette Fluent dans les composants. Recalculer le seed lorsque les réglages Windows changent et maintenir les contrastes des rôles. Microsoft documente `SystemAccentColor`, ses nuances et `UISettings.GetColorValue` ([thème et accent Windows](https://learn.microsoft.com/en-us/windows/apps/develop/ui/theming)).

À ce lot, la lecture réactive de l’accent système depuis `bun:windows` et l’application du backdrop/titlebar par `Bun.WebView` restent des intégrations natives à compléter. L’exemple montre le point d’extension sans simuler ces capacités sur Linux.

## Exemple Bun

[`packages/bun-webos/examples/m3-native-app`](../../../packages/bun-webos/examples/m3-native-app) montre une app lancée par Bun : Bun démarre une fenêtre `Bun.WebView` avec backend Chrome, sert l’interface M3 depuis une origine locale, et lit/écrit un fichier fixe via `Bun.file` et `Bun.write`. Sous Windows, elle tente aussi l’import de `bun:windows`; ailleurs l’interface indique que l’API n’est pas disponible. Elle ne contient ni XAML ni WinUI.

La WebView repose sur l’implémentation partagée `packages/bun-webview-core`. Aucun code de cette couche n’est dupliqué ici.

## Références

- [Microsoft Learn — contrôles Windows](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/)
- [Microsoft Learn — Mica](https://learn.microsoft.com/en-us/windows/apps/design/style/mica)
- [Microsoft Learn — personnalisation du titre](https://learn.microsoft.com/en-us/windows/apps/develop/title-bar?tabs=winui3)
- [Microsoft Learn — Snap layouts](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-snap-layout-menu)
- [Microsoft Learn — thème et couleur d’accent](https://learn.microsoft.com/en-us/windows/apps/develop/ui/theming)
- [microsoft/microsoft-ui-xaml — contrôles et sources WinUI](https://github.com/microsoft/microsoft-ui-xaml/tree/main/controls)
- [Catalogue aphrody M3 — m3-front](https://github.com/aphrody-labs/aphrody-m3/tree/main/packages/m3-front)
- [Manifeste des éléments aphrody M3](https://github.com/aphrody-labs/aphrody-m3/blob/main/packages/m3-react/md-elements.txt)
