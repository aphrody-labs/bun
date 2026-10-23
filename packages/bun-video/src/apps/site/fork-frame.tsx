import React from "react";
import { Easing, interpolate } from "../../../remotion/core/src/index";
import mark from "../../../../../docs/logo/icon-192.png";
import type { ShowcaseWork } from "./collection";
import type { ForkRun, ForkScene } from "./fork-scenes";

/** Where a run was recorded: the Windows edition, or the Linux kernel release (os.version() there is a build string). */
function recordedOn(run: ForkRun): string {
  if (run.platform === "win32") return run.os.split(" ").slice(0, 3).join(" ");
  if (run.platform === "linux") return `Linux ${run.os.split(" ").at(-1)}`;
  return run.platform === "darwin" ? "macOS" : run.platform;
}

/**
 * One frame of a fork scene: the program typed in, then the command and the output its recorded run printed.
 * Timing is in seconds of the composition, so the scene keeps its pace at any frame rate.
 */
export function ForkFrame({
  work,
  scene,
  run,
  frame,
}: {
  work: ShowcaseWork;
  scene: ForkScene;
  run: ForkRun;
  frame: number;
}) {
  const fps = work.fps.num / work.fps.den;
  const t = frame / fps;
  const [file, code] = Object.entries(scene.files)[0]!;
  const output = run.stdout.split("\n");
  const ease = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) } as const;
  const intro = interpolate(t, [0, 0.8], [0, 1], ease);
  const typed = Math.round(
    interpolate(t, [1, 4.5], [0, code.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const command = interpolate(t, [4.7, 5.2], [0, 1], ease);
  const shown = Math.floor(
    interpolate(t, [5.3, 7.8], [0, output.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const where = `${recordedOn(run)} · Bun ${run.bun.version}`;
  // Short programs get large type: the largest size, from 3.3vh down, at which both panels' wrapped lines fit in
  // their 52vh of height. A monospace character is about 0.6em wide; the code panel holds 140/size characters per
  // line and the narrower terminal 125/size.
  const wrapped = (text: string[], width: number, size: number) =>
    text.reduce((count, line) => count + Math.max(1, Math.ceil(line.length / (width / size))), 0);
  let fit = 3.3;
  while (
    fit > 1.6 &&
    Math.max(wrapped(code.split("\n"), 140, fit), wrapped([`$ ${run.command}`, ...output], 125, fit)) * fit * 1.45 > 52
  )
    fit -= 0.1;
  const size = `${fit.toFixed(2)}vh`;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: "3.4vh 3.6vw",
        display: "grid",
        gridTemplateRows: "auto auto 1fr auto",
        gap: "2.4vh",
        background: "var(--md-sys-color-surface)",
        color: "var(--md-sys-color-on-surface)",
        fontFamily: '"Roboto Flex", system-ui, sans-serif',
      }}
    >
      <style>{`@font-face{font-family:"Google Sans Code";src:url("/fonts/GoogleSansCode-latin.woff2") format("woff2");font-weight:300 800;font-display:block}`}</style>
      <header style={{ display: "flex", alignItems: "center", gap: "1.4vw", opacity: intro }}>
        <img
          src={mark}
          alt=""
          style={{
            width: "6.4vh",
            height: "6.4vh",
            borderRadius: "50%",
            background: "var(--md-sys-color-surface-container-high)",
          }}
        />
        <span style={{ fontSize: "3vh", fontWeight: 600 }}>Bun OS</span>
        <span style={{ marginLeft: "auto", fontSize: "2.3vh", color: "var(--md-sys-color-on-surface-variant)" }}>
          Recorded on {where}
        </span>
      </header>
      <div style={{ opacity: intro, transform: `translateY(${(1 - intro) * 2}vh)` }}>
        <div
          style={{
            fontSize: "7vh",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--md-sys-color-primary)",
            fontFamily: '"Google Sans Code", monospace',
          }}
        >
          {scene.title}
        </div>
        <div style={{ fontSize: "3.1vh", marginTop: "0.8vh", color: "var(--md-sys-color-on-surface-variant)" }}>
          {scene.description}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "1.6vw", minHeight: 0 }}>
        <Panel title={file}>
          <pre style={{ ...codeStyle, fontSize: size }}>
            {code.slice(0, typed)}
            {typed < code.length && t >= 1 ? (
              <span style={{ background: "var(--md-sys-color-primary)" }}> </span>
            ) : null}
          </pre>
        </Panel>
        <Panel title="Terminal">
          <pre style={{ ...codeStyle, fontSize: size }}>
            <span style={{ opacity: command, color: "var(--md-sys-color-primary)" }}>$ {run.command}</span>
            {"\n"}
            {output.slice(0, shown).join("\n")}
          </pre>
        </Panel>
      </div>
      <footer style={{ fontSize: "2.4vh", color: "var(--md-sys-color-on-surface-variant)", opacity: intro }}>
        bun.aphrody.com{scene.docs}
      </footer>
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  margin: 0,
  padding: "1.6vh 1.2vw",
  fontFamily: '"Google Sans Code", monospace',
  fontSize: "2.15vh",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  overflow: "hidden",
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        minHeight: 0,
        display: "grid",
        gridTemplateRows: "auto 1fr",
        borderRadius: "1.6vh",
        background: "var(--md-sys-color-surface-container)",
        border: "1px solid var(--md-sys-color-outline-variant)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "0.9vh 1.2vw",
          fontSize: "2vh",
          color: "var(--md-sys-color-on-surface-variant)",
          background: "var(--md-sys-color-surface-container-high)",
          fontFamily: '"Google Sans Code", monospace',
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}
