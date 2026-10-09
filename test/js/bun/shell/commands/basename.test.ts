import { describe } from "bun:test";
import { createTestBuilder } from "../test_builder";
const TestBuilder = createTestBuilder(import.meta.path);

describe("basename", async () => {
  TestBuilder.command`basename`.exitCode(1).stdout("").stderr("usage: basename string\n").runAsTest("shows usage");

  TestBuilder.command`basename js/bun/shell/commands/basename.test.ts`
    .exitCode(0)
    .stdout("basename.test.ts\n")
    .stderr("")
    .runAsTest("works relative");

  TestBuilder.command`basename /home/tux/example.txt`
    .exitCode(0)
    .stdout("example.txt\n")
    .stderr("")
    .runAsTest("works absolute");

  TestBuilder.command`basename -a /usr/share/aclocal/pkg.m4 /var/log/bar/file.txt`
    .exitCode(0)
    .stdout("pkg.m4\nfile.txt\n")
    .stderr("")
    .runAsTest("works multiple");

  TestBuilder.command`basename /usr/share/aclocal/pkg.m4 /var/log/bar/file.txt /tmp/x`
    .exitCode(0)
    .stdout("pkg.m4\nfile.txt\nx\n")
    .stderr("")
    .runAsTest("more than two operands are all names");

  TestBuilder.command`basename a/b/c.txt .txt`
    .exitCode(0)
    .stdout("c\n")
    .stderr("")
    .runAsTest("second operand is a suffix");

  TestBuilder.command`basename a/b/.txt .txt`
    .exitCode(0)
    .stdout(".txt\n")
    .stderr("")
    .runAsTest("suffix equal to the name is kept");

  TestBuilder.command`basename -s .ts a/x.ts b/y.ts c/z.js`
    .exitCode(0)
    .stdout("x\ny\nz.js\n")
    .stderr("")
    .runAsTest("-s strips the suffix from every name");

  TestBuilder.command`basename C:/Documents/Newsletters/Summer2018.pdf`
    .exitCode(0)
    .stdout("Summer2018.pdf\n")
    .stderr("")
    .runAsTest("works windows");

  TestBuilder.command`basename /catalog/`.exitCode(0).stdout("catalog\n").stderr("").runAsTest("leading slash");

  TestBuilder.command`basename /catalog`.exitCode(0).stdout("catalog\n").stderr("").runAsTest("at root");

  TestBuilder.command`basename /`.exitCode(0).stdout("/\n").stderr("").runAsTest("root is idempotent");
});

describe("basename without stdout", async () => {
  TestBuilder.command`echo $(basename js/bun/shell/commands/basename.test.ts)`
    .exitCode(0)
    .stdout("basename.test.ts\n")
    .stderr("")
    .runAsTest("works relative without stdout");

  TestBuilder.command`echo $(basename /home/tux/example.txt)`
    .exitCode(0)
    .stdout("example.txt\n")
    .stderr("")
    .runAsTest("works absolute without stdout");
});
