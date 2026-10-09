import dynamic from "next/dynamic";

const Hello = dynamic(() => import("../lib/hello"));
const ClientOnly = dynamic(() => import("../lib/client-only"), { ssr: false, loading: () => <p>loading</p> });

export default function Dynamic() {
  return (
    <main>
      <Hello />
      <ClientOnly />
    </main>
  );
}
