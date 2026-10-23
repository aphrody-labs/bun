import type { DocPageData, SidebarItem } from "../lib.ts";
import { Icon } from "./Icon.tsx";
import { InlineCode, Toc } from "./Prose.tsx";

/** A page of the runtime documentation: section tabs and the page tree on the left, the page, its outline on the right. */
export function DocPage({ page }: { page: DocPageData }) {
  return (
    <div className="mx-auto grid max-w-[88rem] gap-x-12 px-gutter lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_13rem]">
      <aside
        aria-label="Documentation"
        className="lg:sticky lg:top-16 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:py-10"
      >
        <details className="group border-b border-line py-3 lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
            Browse documentation <Icon name="expand_more" className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="pt-4">
            <Tree page={page} />
          </div>
        </details>
        <div className="hidden lg:block">
          <Tree page={page} />
        </div>
      </aside>
      <article className="min-w-0 max-w-3xl py-10 lg:py-12">
        <p className="eyebrow">
          {page.tab} · {page.group}
        </p>
        <h1 className="display mt-3 text-[clamp(2.5rem,5vw,3.75rem)] text-fg">{page.title}</h1>
        {page.description ? (
          <p className="mt-4 max-w-2xl text-[1.125rem] leading-relaxed text-fg-muted">
            <InlineCode text={page.description} />
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2 border-y border-line py-3 text-[0.8125rem]" data-pagefind-ignore>
          <button
            type="button"
            data-copy-url={page.markdownUrl}
            className="inline-flex h-8 items-center gap-1.5 border border-line px-2.5 text-fg-muted hover:border-line-strong hover:text-fg"
          >
            <Icon name="content_copy" /> Copy page
          </button>
          <a
            href={page.markdownUrl}
            className="inline-flex h-8 items-center gap-1.5 border border-line px-2.5 text-fg-muted no-underline hover:border-line-strong hover:text-fg"
          >
            <Icon name="description" /> View as Markdown
          </a>
          <a
            href={page.editUrl}
            className="inline-flex h-8 items-center gap-1.5 border border-line px-2.5 text-fg-muted no-underline hover:border-line-strong hover:text-fg"
          >
            <Icon name="edit" /> Edit on GitHub
          </a>
        </div>
        <div className="doc mt-8" dangerouslySetInnerHTML={{ __html: page.html }} />
        {page.previous || page.next ? (
          <nav
            aria-label="Pages"
            className="cells mt-16 grid sm:grid-cols-2"
            data-pagefind-ignore
          >
            {page.previous ? (
              <a href={page.previous.href} className="flex flex-col gap-1 p-5 no-underline hover:bg-subtle">
                <span className="eyebrow">Previous</span>
                <span className="font-medium text-fg">{page.previous.title}</span>
              </a>
            ) : (
              <span className="hidden sm:block" />
            )}
            {page.next ? (
              <a
                href={page.next.href}
                className="flex flex-col gap-1 p-5 text-right no-underline hover:bg-subtle"
              >
                <span className="eyebrow">Next</span>
                <span className="font-medium text-fg">{page.next.title}</span>
              </a>
            ) : null}
          </nav>
        ) : null}
      </article>
      <Toc entries={page.toc} />
    </div>
  );
}

function Tree({ page }: { page: DocPageData }) {
  return (
    <div data-pagefind-ignore>
      <nav aria-label="Documentation sections" className="mb-6 flex flex-wrap gap-1.5">
        {page.tabs.map(tab => (
          <a
            key={tab.href}
            href={tab.href}
            aria-current={tab.current ? "true" : undefined}
            className="border border-line px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-wider text-fg-faint no-underline hover:text-fg aria-[current=true]:border-accent aria-[current=true]:text-fg"
          >
            {tab.label}
          </a>
        ))}
      </nav>
      {page.groups.map(group => (
        <div key={group.title} className="mb-6">
          <p className="eyebrow mb-2">{group.title}</p>
          <Items items={group.items} />
        </div>
      ))}
    </div>
  );
}

function Items({ items, nested = false }: { items: SidebarItem[]; nested?: boolean }) {
  return (
    <ul
      className={`m-0 grid list-none gap-0.5 p-0 text-[0.875rem] ${nested ? "ml-2 mt-1 border-l border-line pl-3" : ""}`}
    >
      {items.map(item =>
        "group" in item ? (
          <li key={item.group} className="mt-2">
            <span className="text-[0.75rem] font-medium text-fg-faint">{item.group}</span>
            <Items items={item.items} nested />
          </li>
        ) : (
          <li key={item.href}>
            <a
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className="block py-1 text-fg-muted no-underline hover:text-fg aria-[current=page]:font-medium aria-[current=page]:text-accent-strong"
            >
              {item.title}
            </a>
          </li>
        ),
      )}
    </ul>
  );
}
