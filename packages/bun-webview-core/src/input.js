() => {
  const g = globalThis;
  if (g.__bunInput) return g.__bunInput;
  const mods = m => ({ altKey: !!(m & 1), ctrlKey: !!(m & 2), metaKey: !!(m & 4), shiftKey: !!(m & 8) });
  const buttonIndex = b => (b === "right" ? 2 : b === "middle" ? 1 : 0);
  const buttonsMask = b => (b === "right" ? 2 : b === "middle" ? 4 : b === "left" ? 1 : 0);
  const state = { down: null };
  const target = (x, y) => document.elementFromPoint(x, y) || document.body || document.documentElement;
  const focusable = el => {
    for (let e = el; e && e !== document; e = e.parentElement || (e.getRootNode && e.getRootNode().host)) {
      if (typeof e.focus === "function" && (e.tabIndex >= 0 || e.isContentEditable)) return e;
    }
    return null;
  };
  const active = () => {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a || document.body;
  };
  const isText = el =>
    el &&
    (el.isContentEditable ||
      el.tagName === "TEXTAREA" ||
      (el.tagName === "INPUT" &&
        !/^(button|submit|reset|checkbox|radio|file|image|range|color|hidden)$/i.test(el.type || "")));
  const insert = text => {
    const el = active();
    if (document.execCommand && document.execCommand("insertText", false, text)) return;
    if (el && "value" in el && isText(el)) {
      const s = el.selectionStart ?? el.value.length;
      const e = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, s) + text + el.value.slice(e);
      el.selectionStart = el.selectionEnd = s + text.length;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
  };
  const mouseInit = (o, extra) => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: o.x,
    clientY: o.y,
    screenX: o.x,
    screenY: o.y,
    button: buttonIndex(o.button),
    detail: o.clickCount || 1,
    ...mods(o.modifiers),
    ...extra,
  });
  const fire = (el, type, init) => {
    const C = type.startsWith("pointer") ? PointerEvent : type === "wheel" ? WheelEvent : MouseEvent;
    return el.dispatchEvent(new C(type, init));
  };
  const api = {
    mouse(o) {
      const el = target(o.x, o.y);
      if (o.kind === "move") {
        fire(el, "pointermove", mouseInit(o, { pointerType: "mouse", buttons: 0 }));
        fire(el, "mousemove", mouseInit(o, { buttons: 0 }));
        return;
      }
      if (o.kind === "wheel") {
        if (fire(el, "wheel", mouseInit(o, { deltaX: o.deltaX, deltaY: o.deltaY, deltaMode: 0 }))) {
          let s = el;
          while (
            s &&
            s !== document.documentElement &&
            !(s.scrollHeight > s.clientHeight && /(auto|scroll)/.test(getComputedStyle(s).overflowY))
          )
            s = s.parentElement;
          (s && s !== document.documentElement ? s : window).scrollBy(o.deltaX, o.deltaY);
        }
        return;
      }
      if (o.kind === "down") {
        state.down = el;
        fire(
          el,
          "pointerdown",
          mouseInit(o, { pointerType: "mouse", buttons: buttonsMask(o.button), isPrimary: true }),
        );
        if (fire(el, "mousedown", mouseInit(o, { buttons: buttonsMask(o.button) }))) {
          const f = focusable(el);
          if (f) f.focus();
          else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        }
        return;
      }
      fire(el, "pointerup", mouseInit(o, { pointerType: "mouse", buttons: 0, isPrimary: true }));
      fire(el, "mouseup", mouseInit(o, { buttons: 0 }));
      const same = state.down && (state.down === el || state.down.contains(el) || el.contains(state.down));
      state.down = null;
      if (!same) return;
      if (o.button === "right") {
        fire(el, "contextmenu", mouseInit(o, { buttons: 0 }));
        return;
      }
      if (o.button === "left" || !o.button || o.button === "none") {
        // A dispatched "click" MouseEvent runs activation behavior (links, checkboxes, labels, submit).
        fire(el, "click", mouseInit(o, { buttons: 0 }));
        if ((o.clickCount || 1) >= 2) fire(el, "dblclick", mouseInit(o, { buttons: 0, detail: 2 }));
      }
    },
    key(o) {
      const el = active();
      const init = {
        key: o.key,
        code: o.code || o.key,
        keyCode: o.keyCode,
        which: o.keyCode,
        bubbles: true,
        cancelable: true,
        composed: true,
        ...mods(o.modifiers),
      };
      if (o.kind === "up") {
        el.dispatchEvent(new KeyboardEvent("keyup", init));
        return;
      }
      if (o.kind === "char") {
        if (o.text) insert(o.text);
        return;
      }
      if (!el.dispatchEvent(new KeyboardEvent("keydown", init))) return;
      const ctrl = o.modifiers & 2 || o.modifiers & 4;
      if (o.text && !ctrl && o.kind === "down") {
        if (el.dispatchEvent(new KeyboardEvent("keypress", { ...init, charCode: o.text.charCodeAt(0) })))
          insert(o.text === "\r" ? "\n" : o.text);
        return;
      }
      switch (o.key) {
        case "Enter":
          if (el.tagName === "TEXTAREA" || el.isContentEditable) document.execCommand("insertLineBreak");
          else if (el.form && el.tagName === "INPUT") el.form.requestSubmit();
          else if (el.tagName === "BUTTON" || el.tagName === "A") el.click();
          break;
        case "Backspace":
          document.execCommand("delete");
          break;
        case "Delete":
          document.execCommand("forwardDelete");
          break;
        case "Tab": {
          const all = [
            ...document.querySelectorAll("a[href],button,input,select,textarea,[tabindex],[contenteditable]"),
          ].filter(e => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length);
          if (all.length) {
            const i = all.indexOf(el);
            const n = o.modifiers & 8 ? (i <= 0 ? all.length - 1 : i - 1) : (i + 1) % all.length;
            all[n].focus();
          }
          break;
        }
        case " ":
          if (el.tagName === "BUTTON" || (el.tagName === "INPUT" && /^(checkbox|radio|button|submit)$/i.test(el.type)))
            el.click();
          break;
        case "a":
          if (ctrl) document.execCommand("selectAll");
          break;
        case "Escape":
          if (document.fullscreenElement) document.exitFullscreen();
          break;
        case "ArrowLeft":
        case "ArrowRight":
        case "Home":
        case "End":
          if ("selectionStart" in el && el.selectionStart != null) {
            const len = el.value.length;
            const p = el.selectionStart;
            const n =
              o.key === "Home"
                ? 0
                : o.key === "End"
                  ? len
                  : o.key === "ArrowLeft"
                    ? Math.max(0, p - 1)
                    : Math.min(len, p + 1);
            el.setSelectionRange(n, n);
          }
          break;
        case "ArrowDown":
        case "PageDown":
          if (!isText(el)) window.scrollBy(0, o.key === "PageDown" ? innerHeight * 0.9 : 40);
          break;
        case "ArrowUp":
        case "PageUp":
          if (!isText(el)) window.scrollBy(0, o.key === "PageUp" ? -innerHeight * 0.9 : -40);
          break;
      }
    },
    insertText(text) {
      insert(text);
    },
  };
  Object.defineProperty(g, "__bunInput", { value: api, configurable: true });
  return api;
};
