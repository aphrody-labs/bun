import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";

test.each(["\uFEFF", "\uFFFE", "\uFEFF\uFEFF", "", "latin", "text\uFEFF"])(
  "SQLite retains BOM codepoints as data: %j",
  prefix => {
    using db = new Database(":memory:");
    db.exec("CREATE TABLE text_values(value TEXT)");
    const value = prefix + "é😀\u0000end";
    const hex = Buffer.from(value).toString("hex").toUpperCase();
    db.query("INSERT INTO text_values VALUES(?)").run(value);
    const read = db.query<{ value: string; hex: string }, []>("SELECT value,hex(value) AS hex FROM text_values").get();
    expect(read).toEqual({ value, hex });
    db.query("UPDATE text_values SET value=$value").run({ $value: value });
    expect(db.query("SELECT value,hex(value) AS hex FROM text_values").get()).toEqual({ value, hex });
  },
);
