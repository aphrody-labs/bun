import { add, greet } from "./util";
import data from "./data.json";
import { Counter } from "./counter";
const c = new Counter();
for (const n of data.numbers) c.push(add(n, 1));
console.log(greet("perf"), c.total());
