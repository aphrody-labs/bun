// This fixture is checked by test/tsconfig.json, which owns the Bun ESNext environment.
import { m3SchemeCss, type M3Options } from "../../../../packages/bun-plugin-tailwind/src/m3";

function checkM3TypeBoundary() {
  const options: M3Options = { variant: "expressive", contrastLevel: 0.5 };
  const css: Promise<string> = m3SchemeCss("#6750a4", options);
  // @ts-expect-error The browser dependency must not introduce DOM globals into Bun tests.
  void document.body;
  // @ts-expect-error Unknown M3 scheme variants remain rejected by the generated API.
  m3SchemeCss("#6750a4", { variant: "invalid" });
  return css;
}

void checkM3TypeBoundary;
