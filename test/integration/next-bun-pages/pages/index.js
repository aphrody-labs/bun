import Link from "next/link";
import { useState } from "react";
import { greeting } from "../lib/greeting";

export async function getStaticProps() {
  return { props: { message: greeting("static") } };
}

export default function Home({ message }) {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>{message}</h1>
      <button onClick={() => setCount(count + 1)}>count: {count}</button>
      <Link href="/posts/first">first post</Link>
    </main>
  );
}
