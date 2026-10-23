import type { Recorded } from "../data/scenes.ts";

/**
 * The home page terminal: tabs of programs the runtime really ran, each with its source and the output recorded when
 * it ran. The first tab is rendered finished, so the page reads without script; page-home.ts replays the typing.
 */
export function Terminal({ scenes, highlight }: { scenes: Recorded[]; highlight: (code: string) => string }) {
  return (
    <div className="border border-line bg-code-bg" data-terminal>
      <div role="tablist" aria-label="Programs" className="flex overflow-x-auto border-b border-line">
        {scenes.map((scene, index) => (
          <button
            key={scene.id}
            type="button"
            role="tab"
            id={`tab-${scene.id}`}
            aria-selected={index === 0}
            aria-controls={`panel-${scene.id}`}
            className="shrink-0 border-r border-line px-4 py-3 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-fg-faint transition-colors hover:text-fg aria-selected:bg-canvas aria-selected:text-fg aria-selected:shadow-[inset_0_-2px_0_var(--color-accent)]"
          >
            {scene.tab}
          </button>
        ))}
      </div>
      {scenes.map((scene, index) => (
        <div
          key={scene.id}
          role="tabpanel"
          id={`panel-${scene.id}`}
          aria-labelledby={`tab-${scene.id}`}
          hidden={index !== 0}
          data-scene={scene.id}
          className="grid min-h-[22rem]"
        >
          <div className="min-w-0 border-b border-line">
            <p className="eyebrow border-b border-line px-5 py-2.5 normal-case tracking-normal">{scene.file}</p>
            <div
              className="overflow-x-auto px-5 py-4 font-mono text-[0.75rem] leading-[1.75] text-code-fg [&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:p-0 [&_code]:font-mono"
              dangerouslySetInnerHTML={{ __html: highlight(scene.code.trimEnd()) }}
            />
          </div>
          <div className="min-w-0 px-5 py-4 font-mono text-[0.75rem] leading-[1.75]">
            <p className="m-0 text-code-fg" data-command>
              <span className="text-accent">$</span> bun {scene.args.join(" ")}
            </p>
            <div data-output className="whitespace-pre-wrap break-words text-fg-muted">
              {scene.output}
            </div>
          </div>
          <p className="eyebrow border-t border-line px-5 py-2.5 normal-case tracking-normal">
            Output recorded on {scene.os} with Bun {scene.bun} ·{" "}
            <a
              href={scene.docs}
              className="text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg"
            >
              docs
            </a>
          </p>
        </div>
      ))}
    </div>
  );
}
