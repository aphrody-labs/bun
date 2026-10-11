for (const path of ["http://127.0.0.1/", "http://127.0.0.1/a2a/ping", "http://127.0.0.1/system-snapshot/", "http://127.0.0.1:8796/health", "http://127.0.0.1:8081/health"]) {
  try {
    const response = await fetch(path, { signal: AbortSignal.timeout(8000) });
    console.log(JSON.stringify({ url: path, status: response.status }));
  } catch (error) {
    console.log(JSON.stringify({ url: path, error: String(error) }));
  }
}
const envText = await Bun.file("C:/Users/omara/.aphrody/private/mcp-http.env").text();
const line = envText.split(/\r?\n/).find((line) => /^\s*APHRODY_MCP_HTTP_TOKEN\s*=/.test(line));
let token = line?.slice(line.indexOf("=") + 1).trim() ?? "";
if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) token = token.slice(1, -1);
if (token.length < 32) throw new Error("Configured MCP token missing or too short");
const companion = (await Bun.file("C:/Users/omara/.aphrody/private/aphrody_mcp_http_token").text()).trim();
console.log(JSON.stringify({ configuredTokenUsable: true, companionMatches: token === companion }));
for (const endpoint of ["http://127.0.0.1:8793/mcp", "http://127.0.0.1:8793/mcp/", "http://127.0.0.1/mcp/"]) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "omar-server", version: "1.0.0" } } }),
      signal: AbortSignal.timeout(8000),
    });
    console.log(JSON.stringify({ url: endpoint, status: response.status, sessionEstablished: response.headers.has("mcp-session-id") }));
    await response.body?.cancel();
  } catch (error) {
    console.log(JSON.stringify({ url: endpoint, error: String(error) }));
  }
}
