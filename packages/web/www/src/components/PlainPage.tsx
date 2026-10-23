import type { PlainPage as PlainPageData } from "../lib.ts";
import { Toc } from "./Prose.tsx";

/** A page whose body is HTML from the content pipeline, in the prose column with its outline beside it. */
export function PlainPage({ page }: { page: PlainPageData }) {
  return (
    <div className="mx-auto grid max-w-[76rem] gap-x-12 px-gutter py-10 lg:py-14 xl:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="doc min-w-0 max-w-4xl" dangerouslySetInnerHTML={{ __html: page.body }} />
      <Toc entries={page.toc ?? []} />
    </div>
  );
}
