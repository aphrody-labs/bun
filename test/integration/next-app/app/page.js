import dynamic from "next/dynamic";
import Counter from "./counter";

const Lazy = dynamic(() => import("./lazy"));

export default function Home() {
  return (
    <main>
      <h1>Hello from the App Router</h1>
      <p id="runtime">{typeof Bun === "undefined" ? "node" : "bun"}</p>
      <Counter />
      <Lazy />
    </main>
  );
}
