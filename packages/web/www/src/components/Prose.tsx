import type { ReactNode } from "react";
import type { TocEntry } from "../lib.ts";

/** A description with `code` spans, as the front matter of a page writes it. */
export function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split(/`([^`]+)`/).map((part, index) =>
        index % 2 ? (
          <code key={index} className="border border-line bg-slab px-1.5 py-0.5 font-mono text-[0.8125em] text-fg">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** The headings of a page, listed beside it. */
export function Toc({ entries }: { entries: TocEntry[] }) {
  if (entries.length < 2) return null;
  return (
    <nav
      aria-label="On this page"
      className="sticky top-24 hidden max-h-[calc(100dvh-8rem)] overflow-y-auto py-10 xl:block"
    >
      <p className="eyebrow mb-3">On this page</p>
      <ul className="m-0 grid list-none gap-1.5 border-l border-line p-0 text-[0.8125rem]">
        {entries.map(entry => (
          <li key={entry.id} style={{ paddingLeft: `${0.75 + Math.max(0, entry.level - 2) * 0.75}rem` }}>
            <a
              href={`#${entry.id}`}
              className="text-fg-faint no-underline hover:text-fg"
              dangerouslySetInnerHTML={{ __html: entry.text }}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow m-0">{children}</p>;
}
