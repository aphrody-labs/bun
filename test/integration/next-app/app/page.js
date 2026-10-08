import Counter from "./counter";

export default function Home() {
  return (
    <main>
      <h1>Hello from the App Router</h1>
      <p id="runtime">{typeof Bun === "undefined" ? "node" : "bun"}</p>
      <Counter />
    </main>
  );
}
