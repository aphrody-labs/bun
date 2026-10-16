// packages/web/site pulls @aphrody/m3-tokens/dynamic-color, a browser module that reads `document` without the DOM lib.
interface HTMLElement {
  style: { setProperty(name: string, value: string): unknown; removeProperty(name: string): unknown };
}
declare var document: { documentElement: HTMLElement } | undefined;
