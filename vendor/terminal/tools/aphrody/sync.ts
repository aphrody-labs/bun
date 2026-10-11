// bun run sync [--push] : fetch upstream/main puis rebase de la branche aphrody.
import { $ } from "bun";
import { ROOT, log } from "./lib.ts";

$.cwd(ROOT);
const remotes = (await $`git remote`.text()).split(/\s+/);
if (!remotes.includes("upstream")) await $`git remote add upstream https://github.com/microsoft/terminal.git`;
if ((await $`git status --porcelain --untracked-files=no`.text()).trim())
  throw new Error("arbre de travail modifié : commit ou stash avant sync");

const branch = (await $`git branch --show-current`.text()).trim();
if (branch !== "aphrody") await $`git switch aphrody`;
await $`git fetch upstream main`;
// Other machines push to origin/aphrody: integrate them first so the force push below cannot drop their commits.
if ((await $`git fetch origin aphrody`.nothrow()).exitCode === 0) {
  if ((await $`git merge-base --is-ancestor origin/aphrody HEAD`.nothrow()).exitCode !== 0) {
    const r = await $`git rebase origin/aphrody`.nothrow();
    if (r.exitCode !== 0) {
      await $`git rebase --abort`.nothrow();
      throw new Error("conflit avec origin/aphrody : résoudre à la main (git pull --rebase origin aphrody)");
    }
  }
}
const before = (await $`git rev-parse HEAD`.text()).trim();
const upstream = (await $`git rev-parse upstream/main`.text()).trim();
const behind = Number((await $`git rev-list --count HEAD..upstream/main`.text()).trim());
if (behind === 0) {
  log("sync", `à jour avec upstream/main (${upstream.slice(0, 10)})`);
} else {
  log("sync", `${behind} commits upstream à intégrer`);
  const r = await $`git rebase upstream/main`.nothrow();
  if (r.exitCode !== 0) {
    await $`git rebase --abort`.nothrow();
    throw new Error("conflit de rebase : résoudre à la main (git rebase upstream/main)");
  }
  log("sync", `${before.slice(0, 10)} -> ${(await $`git rev-parse HEAD`.text()).trim().slice(0, 10)}`);
}
// Both the rebased aphrody branch and main mirror upstream on the fork.
if (process.argv.includes("--push")) {
  await $`git push --force-with-lease origin aphrody`;
  await $`git push origin ${upstream}:refs/heads/main`;
}
