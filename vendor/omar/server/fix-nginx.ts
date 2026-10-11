const p = 'C:/aphrody/tools/config/host/nginx/omar-pc.json';
const j = await Bun.file(p).json();
for (const loc of j.servers[0].locations) if (loc.path === '/system-snapshot/') loc.headers = [['Host', '$host']];
await Bun.write(p, JSON.stringify(j, null, 2) + '\n');
