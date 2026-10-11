import windows from "bun:windows";
console.log(JSON.stringify(Object.fromEntries(Object.entries(windows).map(([name, value]) => [name, value && typeof value === "object" ? Object.keys(value) : typeof value])), null, 2));
