export const dynamic = "force-dynamic";

export function GET(request) {
  const url = new URL(request.url);
  return Response.json({
    hello: url.searchParams.get("name") ?? "world",
    runtime: typeof Bun === "undefined" ? "node" : "bun",
  });
}
