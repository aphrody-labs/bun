import { apps, config, isSupported, notify, openWindow, ron, text } from "bun:cosmic";
import { describe, expect, test } from "bun:test";
import { chmodSync, readFileSync } from "node:fs";
import { bunEnv, bunExe, isLinux, isWindows, normalizeBunSnapshot, tempDir } from "harness";
import { join } from "node:path";

const fontPath = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "integration",
  "expo-app",
  "assets",
  "fonts",
  "SpaceMono-Regular.ttf",
);

describe("ron", () => {
  test("parses cosmic-config values", () => {
    const value = ron.parse(`#![enable(implicit_some)]
// comment
(
    layout: "us",
    options: Some("caps:escape"),
    repeat_delay: 600,
    rate: 2.5e1,
    mode: Dark,
    accent: Rgba(1.0, 0.5, /* inline */ 0.25, 1.0),
    gaps: (0, 8),
    unit: (),
    list: [1, -2, 0x10,],
    map: {"a": true, "b": None},
    raw: r#"x"y"#,
    big: 18446744073709551615,
    named: Fixed(width: 2),
)`);
    expect(value).toEqual({
      layout: "us",
      options: ron.some("caps:escape"),
      repeat_delay: 600,
      rate: 25,
      mode: ron.variant("Dark"),
      accent: ron.variant("Rgba", [1, 0.5, 0.25, 1]),
      gaps: ron.tuple(0, 8),
      unit: ron.tuple(),
      list: [1, -2, 16],
      map: new Map<any, any>([
        ["a", true],
        ["b", null],
      ]),
      raw: 'x"y',
      big: 18446744073709551615n,
      named: ron.variant("Fixed", { width: 2 }),
    });
  });

  test("stringifies like ron::ser::to_string_pretty", () => {
    const value = {
      x: 1,
      y: ron.some("z\n"),
      list: [1, 2],
      empty: [],
      map: new Map([["k", true]]),
      mode: ron.variant("Dark"),
      pair: ron.tuple(1.5, "a"),
      nested: { none: null },
    };
    const out = ron.stringify(value);
    expect(out).toBe(`(
    x: 1,
    y: Some("z\\n"),
    list: [
        1,
        2,
    ],
    empty: [],
    map: {
        "k": true,
    },
    mode: Dark,
    pair: (1.5, "a"),
    nested: (
        none: None,
    ),
)`);
    expect(ron.parse(out)).toEqual(value);
  });

  test("reports syntax errors with a position", () => {
    expect(() => ron.parse("(a: 1,\n  b: ]")).toThrow("RON 2:6");
  });
});

test("config reads defaults, writes atomically and watches", async () => {
  using dir = tempDir("cosmic-config", {
    "data/cosmic/com.example.Test/v2/theme": "Light",
    "data/cosmic/com.example.Test/v2/size": "12",
    "config/cosmic/com.example.Test/v1/legacy": `"old"`,
  });
  const script = `
    import { config, ron } from "bun:cosmic";
    import { readFileSync, readdirSync } from "node:fs";
    const c = config.open("com.example.Test", 2);
    const seen = [];
    const changed = Promise.withResolvers();
    const watcher = c.watch(key => { seen.push(key); if (key === "theme") changed.resolve(); });
    console.log(JSON.stringify([c.get("theme"), c.get("size"), c.getLocal("legacy"), c.get("missing") ?? "undefined"]));
    c.set("theme", ron.variant("Dark"));
    c.set("window", { width: 640, title: ron.some("Bun") });
    await changed.promise;
    watcher.close();
    console.log(JSON.stringify([c.get("theme"), c.getDefault("theme"), c.keys()]));
    console.log(readFileSync(c.path + "/window", "utf8"));
    console.log(readdirSync(c.path).filter(n => n.startsWith(".atomicwrite")).length, seen.some(k => k.startsWith(".atomicwrite")));
  `;
  await using proc = Bun.spawn({
    cmd: [bunExe(), "-e", script],
    env: {
      ...bunEnv,
      XDG_CONFIG_HOME: join(String(dir), "config"),
      XDG_DATA_HOME: join(String(dir), "data"),
      XDG_DATA_DIRS: join(String(dir), "none"),
    },
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  expect(stderr).toBe("");
  expect(normalizeBunSnapshot(stdout, dir)).toMatchInlineSnapshot(`
    "[{"name":"Light"},12,"old","undefined"]
    [{"name":"Dark"},{"name":"Light"},["size","theme","window"]]
    (
        width: 640,
        title: Some("Bun"),
    )
    0 false"
  `);
  expect(exitCode).toBe(0);
});

describe("apps.expandExec", () => {
  const context = { files: ["/a b.txt", "/c"], urls: ["https://x/"], name: "Editor", icon: "ed", path: "/e.desktop" };

  test.each([
    ["editor %f", ["editor", "/a b.txt"]],
    ["editor %F", ["editor", "/a b.txt", "/c"]],
    ["editor %U --x", ["editor", "https://x/", "--x"]],
    ["editor --file=%f", ["editor", "--file=/a b.txt"]],
    ["editor %i --title=%c %k", ["editor", "--icon", "ed", "--title=Editor", "/e.desktop"]],
    ['"/opt/my app/bin" "two words" "q\\\\"" 100%%', ["/opt/my app/bin", "two words", 'q"', "100%"]],
    ['sh -c "echo \\\\$HOME %f"', ["sh", "-c", "echo $HOME %f"]],
    ["editor\\s%d %m --x", ["editor", "--x"]],
  ])("%s", (exec, argv) => {
    expect(apps.expandExec(exec, context)).toEqual(argv);
  });

  test("drops file and URL codes without files or URLs", () => {
    expect(apps.expandExec("editor %f %F %u %U --new", {})).toEqual(["editor", "--new"]);
  });

  test("rejects unknown codes and unterminated quotes", () => {
    expect(() => apps.expandExec("editor %z")).toThrow(
      expect.objectContaining({ code: "ERR_BUN_COSMIC_INVALID_EXEC" }),
    );
    expect(() => apps.expandExec('"editor')).toThrow(expect.objectContaining({ code: "ERR_BUN_COSMIC_INVALID_EXEC" }));
  });
});

test("apps.launch spawns the Exec of an entry or action without a shell", async () => {
  using dir = tempDir("cosmic-launch", {
    "print.js": "console.log(JSON.stringify(process.argv.slice(2)));",
  });
  // Exec escaping, then the string-level escaping of every backslash (Windows paths).
  const quote = (s: string) => `"${s.replace(/[\\"`$]/g, c => "\\" + c).replaceAll("\\", "\\\\")}"`;
  const program = `${quote(bunExe())} ${quote(join(String(dir), "print.js"))}`;
  const entry = {
    id: "t",
    path: "/t.desktop",
    name: "Test App",
    icon: "test-icon",
    exec: `${program} %F --name=%c %i 100%% $HOME`,
    terminal: false,
    workingDirectory: null,
    actions: [{ id: "new", name: "New", exec: `${program} --new %u` }],
  } as any;

  await using proc = apps.launch(entry, { files: ["a b.txt", "c"], stdout: "pipe", env: bunEnv });
  const [stdout, exitCode] = await Promise.all([proc.stdout.text(), proc.exited]);
  expect(JSON.parse(stdout)).toEqual(["a b.txt", "c", "--name=Test App", "--icon", "test-icon", "100%", "$HOME"]);
  expect(exitCode).toBe(0);

  await using action = apps.launch(entry, { action: "new", urls: ["https://x/"], stdout: "pipe", env: bunEnv });
  const [actionOut, actionCode] = await Promise.all([action.stdout.text(), action.exited]);
  expect(JSON.parse(actionOut)).toEqual(["--new", "https://x/"]);
  expect(actionCode).toBe(0);

  expect(() => apps.launch(entry, { action: "missing" })).toThrow();
});

test("config rejects names that are not one path component", () => {
  expect(() => config.open("../etc")).toThrow();
  expect(() => config.open("com.example.Test").get("a/b")).toThrow();
});

test.skipIf(isLinux || isWindows)("native calls throw ERR_BUN_COSMIC_UNSUPPORTED outside Linux and Windows", () => {
  expect(isSupported).toBe(false);
  expect(() => text.layout("x")).toThrow(expect.objectContaining({ code: "ERR_BUN_COSMIC_UNSUPPORTED" }));
  expect(() => apps.list({ dirs: [] })).toThrow(expect.objectContaining({ code: "ERR_BUN_COSMIC_UNSUPPORTED" }));
  expect(() => openWindow()).toThrow(expect.objectContaining({ code: "ERR_BUN_COSMIC_UNSUPPORTED" }));
});

describe.skipIf(!isWindows)("windows", () => {
  test("lays out and renders text with cosmic-text", () => {
    expect(isSupported).toBe(true);
    expect(text.loadFont(fontPath)).toEqual(["Space Mono"]);
    const options = { family: "Space Mono", fontSize: 20, color: "#ff0000" };
    const layout = text.layout("Hello\nBun", options);
    expect(layout.lines.map(line => [line.line, line.glyphs.length])).toEqual([
      [0, 5],
      [1, 3],
    ]);
    const image = text.render("Hello\nBun", options);
    expect(image.height).toBe(48);
    expect(image.data.length).toBe(image.width * image.height * 4);
  });

  test("config lives under %APPDATA%\cosmic", () => {
    using dir = tempDir("cosmic-config-win", {});
    const previous = process.env.APPDATA;
    process.env.APPDATA = String(dir);
    try {
      const cfg = config.open("com.example.Win", 1);
      expect(cfg.path).toBe(join(String(dir), "cosmic", "com.example.Win", "v1"));
      cfg.set("accent", [0.5, 0.25, 1]);
      expect(readFileSync(join(cfg.path, "accent"), "utf8")).toBe(ron.stringify([0.5, 0.25, 1]));
      expect(cfg.get("accent")).toEqual([0.5, 0.25, 1]);
    } finally {
      if (previous === undefined) delete process.env.APPDATA;
      else process.env.APPDATA = previous;
    }
  });

  test(".desktop application index stays Linux-only", () => {
    expect(() => apps.list({ dirs: [] })).toThrow(expect.objectContaining({ code: "ERR_BUN_COSMIC_UNSUPPORTED" }));
  });
});

describe.skipIf(!isLinux)("linux", () => {
  test("loads a font, lays out and renders text", () => {
    expect(isSupported).toBe(true);
    expect(text.loadFont(fontPath)).toEqual(["Space Mono"]);
    expect(text.fonts().some(face => face.family === "Space Mono" && face.monospaced)).toBe(true);

    const options = { family: "Space Mono", fontSize: 20, color: "#ff0000" };
    const layout = text.layout("Hello\nBun", options);
    expect(layout.lines.map(line => [line.line, line.glyphs.length])).toEqual([
      [0, 5],
      [1, 3],
    ]);
    const glyphs = layout.lines[0].glyphs;
    expect(new Set(glyphs.map(g => g.font))).toEqual(new Set(["Space Mono"]));
    expect(new Set(glyphs.map(g => g.width)).size).toBe(1);
    expect(glyphs.map(g => [g.start, g.end])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBe(48);

    const image = text.render("Hello\nBun", options);
    expect(image.width).toBe(Math.ceil(layout.width));
    expect(image.height).toBe(48);
    expect(image.data.length).toBe(image.width * image.height * 4);
    let painted = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i + 3] > 0) {
        painted++;
        expect([image.data[i], image.data[i + 1], image.data[i + 2]]).toEqual([255, 0, 0]);
      }
    }
    expect(painted).toBeGreaterThan(50);

    expect(() => text.loadFont(new Uint8Array([1, 2, 3]))).toThrow(
      expect.objectContaining({ code: "ERR_BUN_COSMIC_INVALID_FONT" }),
    );
  });

  test("lists .desktop entries with localized names", () => {
    using dir = tempDir("cosmic-apps", {
      "a/org.example.Editor.desktop": `[Desktop Entry]
Type=Application
Name=Editor
Name[fr]=Éditeur
Exec=editor %F
Icon=accessories-text-editor
Categories=Utility;TextEditor;
Actions=new-window;

[Desktop Action new-window]
Name=New Window
Exec=editor --new-window
`,
      "b/org.example.Editor.desktop": `[Desktop Entry]
Type=Application
Name=Shadowed
Exec=other
`,
      "b/org.example.Hidden.desktop": `[Desktop Entry]
Type=Application
Name=Hidden
NoDisplay=true
Exec=hidden
`,
    });
    const entries = apps.list({ dirs: [join(String(dir), "a"), join(String(dir), "b")], locales: ["fr"] });
    const byId = Object.fromEntries(entries.map(e => [e.id, e]));
    expect(Object.keys(byId).sort()).toEqual(["org.example.Editor", "org.example.Hidden"]);
    expect(byId["org.example.Editor"]).toMatchObject({
      name: "Éditeur",
      exec: "editor %F",
      icon: "accessories-text-editor",
      categories: ["Utility", "TextEditor"],
      noDisplay: false,
      actions: [{ id: "new-window", name: "New Window", exec: "editor --new-window" }],
    });
    expect(byId["org.example.Hidden"].noDisplay).toBe(true);
  });

  test("openWindow and notify drive the bun-cosmic helper", async () => {
    using dir = tempDir("cosmic-helper", {
      "helper.sh": `#!/bin/sh
printf '%s\\n' "$@" > "$(dirname "$0")/args-$1.txt"
case "$1" in
  window) echo '{"event":"ready"}'; echo '{"event":"button","index":1,"label":"Cancel"}' ;;
  notify) echo '{"event":"shown","id":7}'; echo '{"event":"action","action":"open"}' ;;
esac
`,
    });
    const helper = join(String(dir), "helper.sh");
    chmodSync(helper, 0o755);
    const previous = process.env.BUN_COSMIC_HELPER;
    process.env.BUN_COSMIC_HELPER = helper;
    try {
      const win = openWindow({ title: "Hi", body: "--not a flag", buttons: ["OK", "Cancel"], width: 300 });
      await win.ready;
      expect(await win.closed).toEqual({ button: 1, label: "Cancel" });
      expect(readFileSync(join(String(dir), "args-window.txt"), "utf8")).toBe(
        "window\n--title=Hi\n--body=--not a flag\n--button=OK\n--button=Cancel\n--width=300\n",
      );

      expect(await notify({ summary: "Done", urgency: "critical", actions: { open: "Open" } })).toEqual({
        id: 7,
        action: "open",
      });
      expect(readFileSync(join(String(dir), "args-notify.txt"), "utf8")).toBe(
        "notify\n--summary=Done\n--urgency=critical\n--action=open=Open\n",
      );
    } finally {
      if (previous === undefined) delete process.env.BUN_COSMIC_HELPER;
      else process.env.BUN_COSMIC_HELPER = previous;
    }
  });
});
