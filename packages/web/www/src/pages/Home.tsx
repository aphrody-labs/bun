import { Icon } from "../components/Icon.tsx";
import type { IconName } from "../components/icons.generated.ts";
import { Terminal } from "../components/Terminal.tsx";
import type { HomeInput } from "../lib.ts";
import type { Recorded } from "../data/scenes.ts";

export interface HomeProps extends HomeInput {
  origin: string;
  repo: string;
  scenes: Recorded[];
  /** Colours a program of the terminal (the build's highlighter). */
  highlight: (code: string) => string;
}

const MODULE_ICON: Record<string, IconName> = {
  adblock: "shield",
  chromium: "public",
  cosmic: "space_dashboard",
  dotnet: "data_object",
  fetch: "cloud_download",
  google: "search",
  graph: "account_tree",
  "graph-index": "account_tree",
  "graph-native": "hub",
  graphx: "hub",
  linux: "memory",
  nginx: "dns",
  obscura: "public",
  privacy: "lock",
  python: "code_blocks",
  rio: "terminal",
  vitest: "science",
  wasm: "deployed_code",
  windows: "desktop_windows",
  winrt: "window",
  winui: "window",
  yolo: "psychology",
};

const eyebrow = "eyebrow";
const section = "border-t border-line py-16 md:py-24";
const wrap = "mx-auto max-w-site px-gutter";

export function Home(props: HomeProps) {
  const { release, modules, repo, measured } = props;
  const tools: { icon: IconName; title: string; replaces: string; text: string; command: string; href: string }[] = [
    {
      icon: "terminal",
      title: "Runtime",
      replaces: "Node.js",
      text: "Runs JavaScript, TypeScript and JSX on JavaScriptCore, with Node.js and Web APIs.",
      command: "bun run index.tsx",
      href: props.doc("runtime/index"),
    },
    {
      icon: "inventory_2",
      title: "Package manager",
      replaces: "npm · yarn · pnpm",
      text: "Installs npm packages, manages workspaces and keeps a text lockfile.",
      command: "bun install",
      href: props.doc("pm/cli/install"),
    },
    {
      icon: "science",
      title: "Test runner",
      replaces: "Jest · Vitest",
      text: "Jest-compatible tests with mocks, snapshots and watch mode.",
      command: "bun test",
      href: props.doc("test/index"),
    },
    {
      icon: "layers",
      title: "Bundler",
      replaces: "esbuild · Vite · webpack",
      text: "Bundles JavaScript, TypeScript, JSX and CSS for browsers or servers.",
      command: "bun build ./app.tsx",
      href: props.doc("bundler/index"),
    },
  ];
  return (
    <>
      <section className="relative overflow-hidden">
        <div
          className={`${wrap} grid gap-12 pb-16 pt-10 md:pb-24 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-14`}
        >
          <div className="flex flex-col items-start">
            <h1 className="display text-[clamp(3.25rem,8.2vw,6.25rem)] text-fg">
              One runtime for the <span className="text-accent">whole machine.</span>
            </h1>
            <p className="mt-6 max-w-md text-[1.125rem] leading-[1.55] text-fg-muted">
              Bun with native modules for Windows, Linux, Python, .NET and media. One binary runs, installs, tests and
              bundles your code.
            </p>
            <InstallCard
              origin={props.origin}
              version={release?.name.replace(/^Bun\s*/, "") ?? props.upstream.version}
            />
            <a
              href={props.doc("quickstart")}
              className="mt-6 inline-flex items-center gap-2 border-b border-line-strong pb-0.5 text-[0.9375rem] font-medium no-underline hover:border-accent"
            >
              Then follow the quickstart <Icon name="arrow_forward" />
            </a>
          </div>
          <div className="min-w-0 self-start lg:mt-8">
            <Terminal scenes={props.scenes} highlight={props.highlight} />
          </div>
        </div>
      </section>

      <section className={section} aria-labelledby="toolkit">
        <div className={wrap}>
          <p className={eyebrow}>The toolkit</p>
          <h2 id="toolkit" className="display mt-3 max-w-2xl text-[clamp(2.25rem,5vw,3.75rem)]">
            Everything Bun already does, in one binary.
          </h2>
          <ul className="m-0 mt-10 cells grid list-none p-0 sm:grid-cols-2 lg:grid-cols-4">
            {tools.map(tool => (
              <li key={tool.title}>
                <a href={tool.href} className="group flex h-full flex-col p-6 no-underline hover:bg-subtle">
                  <span className="grid size-9 place-items-center border border-line-strong text-lg text-fg">
                    <Icon name={tool.icon} />
                  </span>
                  <span className="mt-5 text-[1.0625rem] font-semibold text-fg">{tool.title}</span>
                  <span className={`${eyebrow} mt-1 normal-case tracking-normal`}>replaces {tool.replaces}</span>
                  <span className="mt-3 text-[0.9375rem] leading-relaxed text-fg-muted">{tool.text}</span>
                  <code className="mt-auto pt-6 font-mono text-[0.8125rem] text-fg">
                    <span className="text-accent">$</span> {tool.command}
                  </code>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={section} aria-labelledby="modules">
        <div className={wrap}>
          <p className={eyebrow}>Built-in modules</p>
          <h2 id="modules" className="display mt-3 max-w-3xl text-[clamp(2.25rem,5vw,3.75rem)]">
            {modules.length} modules the machine already had.
          </h2>
          <p className="mt-4 max-w-xl text-fg-muted">
            Import them like any Bun module. Each page of the docs lists the platforms a module supports.
          </p>
          <ul className="m-0 mt-10 cells grid list-none p-0 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map(module => (
              <li key={module.name}>
                <a href={module.href} className="group flex h-full flex-col gap-3 p-5 no-underline hover:bg-subtle">
                  <span className="flex items-center justify-between text-fg-muted">
                    <Icon
                      name={MODULE_ICON[module.name.slice(4)] ?? "extension"}
                      className="text-xl group-hover:text-accent"
                    />
                    <Icon
                      name="arrow_outward"
                      className="text-fg-faint opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </span>
                  <code className="font-mono text-[0.8125rem] font-medium text-fg">{module.name}</code>
                  <span className="line-clamp-3 text-[0.875rem] leading-relaxed text-fg-muted" title={module.description}>
                    {module.description}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {release ? (
        <section className={section} aria-labelledby="release">
          <div className={`${wrap} grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]`}>
            <div>
              <p className={eyebrow}>Latest release · {release.date}</p>
              <h2 id="release" className="display mt-3 text-[clamp(2.5rem,6vw,4.5rem)]">
                {release.name}
              </h2>
              <p className="mt-4 max-w-sm text-fg-muted">
                {release.commits ? `${release.commits} commits of changes. ` : ""}Files and checksums for{" "}
                {release.platforms.join(" and ")}.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="/downloads" className="btn btn-primary">
                  <Icon name="download" /> Downloads
                </a>
                <a href={`/release-notes#${release.tag}`} className="btn">
                  Release notes
                </a>
              </div>
            </div>
            <ul className="m-0 cells grid list-none p-0">
              {release.highlights.map((text, index) => (
                <li key={text} className="flex gap-4 p-5">
                  <span className={`${eyebrow} pt-1`}>{String(index + 1).padStart(2, "0")}</span>
                  <span className="text-[0.9375rem] leading-relaxed text-fg">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {measured.length ? (
        <section className={section} aria-labelledby="measured">
          <div className={wrap}>
            <p className={eyebrow}>Measured builds</p>
            <h2 id="measured" className="display mt-3 max-w-2xl text-[clamp(2.25rem,5vw,3.75rem)]">
              Receipts for the published executables.
            </h2>
            <ul className="m-0 mt-10 cells grid list-none p-0 sm:grid-cols-2 lg:grid-cols-4">
              {measured.map(row => (
                <li key={row.target} className="flex flex-col gap-2 p-5">
                  <span className={eyebrow}>{row.target}</span>
                  <code className="font-mono text-[0.8125rem] text-fg">{row.version}</code>
                  <span className="font-display text-5xl font-extrabold leading-none text-fg [font-stretch:75%]">
                    {row.passed}
                  </span>
                  <span className="text-[0.8125rem] text-fg-muted">
                    tests passed, {row.failed} failed ·{" "}
                    <a
                      href={row.sourceUrl}
                      className="font-mono text-[0.75rem] text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg"
                    >
                      {row.source}
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className={section} aria-labelledby="start">
        <div className={`${wrap} flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between`}>
          <div>
            <p className={eyebrow}>Get started</p>
            <h2 id="start" className="display mt-3 text-[clamp(2.5rem,6vw,4.5rem)]">
              Install it. Run it.
            </h2>
            <p className="mt-4 max-w-md text-fg-muted">
              {props.docsPages.toLocaleString("en-US")} pages of documentation, built from{" "}
              <a
                href={props.upstream.url}
                className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-accent"
              >
                {props.upstream.name} {props.upstream.version}
              </a>{" "}
              under its original licences.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={props.doc("quickstart")} className="btn btn-primary">
              Quickstart <Icon name="arrow_forward" />
            </a>
            <a href="/docs" className="btn">
              <Icon name="menu_book" /> Docs
            </a>
            <a href={`https://github.com/${repo}`} className="btn">
              <Icon name="github" /> Source
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function InstallCard({ origin, version }: { origin: string; version: string }) {
  const host = new URL(origin).host;
  const commands = [
    { id: "unix", label: "macOS & Linux", text: `curl -fsSL ${origin}/install | bash` },
    { id: "windows", label: "Windows", text: `powershell -c "irm ${host}/install.ps1|iex"` },
  ];
  return (
    <div className="mt-8 w-full max-w-xl border border-line bg-subtle" data-install>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className={eyebrow}>Install Bun OS {version}</p>
        <a href="/install" className={`${eyebrow} no-underline hover:text-fg`}>
          View install script
        </a>
      </div>
      {commands.map((command, index) => (
        <div key={command.id} data-os={command.id} hidden={index !== 0} className="flex items-center gap-3 px-4 py-4">
          <span className="font-mono text-accent">&gt;</span>
          <code className="min-w-0 flex-1 break-all font-mono text-[0.75rem] text-fg">{command.text}</code>
          <button
            type="button"
            data-copy={command.text}
            aria-label="Copy the command"
            className="grid size-8 shrink-0 place-items-center border border-line text-base text-fg-muted hover:border-line-strong hover:text-fg"
          >
            <Icon name="content_copy" />
          </button>
        </div>
      ))}
      <div role="tablist" aria-label="Operating system" className="flex border-t border-line">
        {commands.map((command, index) => (
          <button
            key={command.id}
            type="button"
            role="tab"
            data-os-tab={command.id}
            aria-selected={index === 0}
            className="border-r border-line px-4 py-2 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-fg-faint hover:text-fg aria-selected:text-fg"
          >
            {command.label}
          </button>
        ))}
      </div>
    </div>
  );
}
