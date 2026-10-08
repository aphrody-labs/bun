import { readFileSync } from "fs";
import { join } from "path";
import { greeting } from "../lib/greeting";

export async function getServerSideProps({ query }) {
  // `fs` must be stripped from the browser bundle together with getServerSideProps.
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  return { props: { message: greeting(query.name ?? "ssr"), pkg: pkg.name } };
}

export default function Ssr({ message, pkg }) {
  return (
    <main>
      <h1>{message}</h1>
      <p id="pkg">{pkg}</p>
    </main>
  );
}
