import { cookies } from "next/headers";
import { greet } from "../actions";
import EchoButton from "../echo-button";

export default function FormPage() {
  const suffix = "!";
  async function shout(formData) {
    "use server";
    (await cookies()).set("shouted", String(formData.get("name")) + suffix);
  }
  return (
    <main>
      <form id="greet" action={greet}>
        <input name="name" defaultValue="bun" />
        <button>greet</button>
      </form>
      <form id="shout" action={shout}>
        <input name="name" defaultValue="bun" />
        <button>shout</button>
      </form>
      <EchoButton />
    </main>
  );
}
