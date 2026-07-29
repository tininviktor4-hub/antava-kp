import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const client = join(dist, "client");
const server = join(dist, "server");

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });
await mkdir(join(dist, ".openai"), { recursive: true });

for (const file of ["index.html", "styles.css", "app.js", "supabase-config.js"]) {
  await cp(join(root, file), join(client, file));
}

await cp(join(root, "assets"), join(client, "assets"), { recursive: true });
await cp(
  join(root, ".openai", "hosting.json"),
  join(dist, ".openai", "hosting.json")
);

await cp(
  join(root, "scripts", "worker-entry.js"),
  join(server, "index.js")
);
