import { $ } from "bun";
for (let i = 0; i < 50; i++) {
  await $`echo hello | cat > /dev/null`.quiet();
  await $`ls /usr/bin`.quiet();
  await $`basename /a/b/c.txt; dirname /a/b/c.txt; seq 1 100`.quiet();
}
