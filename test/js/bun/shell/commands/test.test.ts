import { describe } from "bun:test";
import { createTestBuilder } from "../test_builder";
const TestBuilder = createTestBuilder(import.meta.path);

// An empty PATH proves `test` and `[` run as builtins instead of /usr/bin/test.
const noPath = { PATH: "" };

describe("test / [", async () => {
  TestBuilder.command`test abc`.env(noPath).exitCode(0).stderr("").runAsTest("non-empty string is true");

  TestBuilder.command`test ""`.env(noPath).exitCode(1).stderr("").runAsTest("empty string is false");

  TestBuilder.command`test`.env(noPath).exitCode(1).stderr("").runAsTest("no arguments is false");

  TestBuilder.command`[ -n abc ] && [ -z "" ] && echo ok`.env(noPath).stdout("ok\n").exitCode(0).runAsTest("-n and -z");

  TestBuilder.command`[ a = a ] && [ a != b ] && [ ! a = b ] && echo ok`
    .env(noPath)
    .stdout("ok\n")
    .exitCode(0)
    .runAsTest("string comparisons and negation");

  TestBuilder.command`[ 3 -lt 10 ] && [ 10 -ge 10 ] && [ -2 -ne 2 ] && echo ok`
    .env(noPath)
    .stdout("ok\n")
    .exitCode(0)
    .runAsTest("integer comparisons");

  TestBuilder.command`[ 10 -lt 3 ]`.env(noPath).exitCode(1).stderr("").runAsTest("false integer comparison");

  TestBuilder.command`[ a = a -a b = c ]`.env(noPath).exitCode(1).runAsTest("-a");

  TestBuilder.command`test "(" a = b ")" -o 1 -eq 1 && echo ok`
    .env(noPath)
    .stdout("ok\n")
    .exitCode(0)
    .runAsTest("-o with parentheses");

  TestBuilder.command`[ -f f.txt ] && [ -s f.txt ] && [ -e f.txt ] && [ -d d ] && [ ! -e nope ] && echo ok`
    .env(noPath)
    .ensureTempDir()
    .file("f.txt", "hi")
    .directory("d")
    .stdout("ok\n")
    .exitCode(0)
    .runAsTest("file predicates");

  TestBuilder.command`[ -f d ]`.env(noPath).ensureTempDir().directory("d").exitCode(1).runAsTest("-f on a directory");

  TestBuilder.command`[ -s empty.txt ]`
    .env(noPath)
    .ensureTempDir()
    .file("empty.txt", "")
    .exitCode(1)
    .runAsTest("-s on an empty file");

  TestBuilder.command`if [ -d . ]; then echo dir; fi`.env(noPath).stdout("dir\n").exitCode(0).runAsTest("inside if");

  TestBuilder.command`[ a = a`.env(noPath).stderr("[: missing `]'\n").exitCode(2).runAsTest("missing ]");

  TestBuilder.command`[ x -eq 1 ]`
    .env(noPath)
    .stderr("[: x: integer expression expected\n")
    .exitCode(2)
    .runAsTest("non-integer operand");

  TestBuilder.command`test a b`
    .env(noPath)
    .stderr("test: a: unary operator expected\n")
    .exitCode(2)
    .runAsTest("unknown unary operator");
});
