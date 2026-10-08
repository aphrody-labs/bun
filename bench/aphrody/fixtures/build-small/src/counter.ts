export class Counter {
  #values: number[] = [];
  push(n: number) {
    this.#values.push(n);
  }
  total() {
    return this.#values.reduce((a, b) => a + b, 0);
  }
}
