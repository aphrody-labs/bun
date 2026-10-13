/** cc-rs also reads Cargo's Rust wrapper variables when compiling C dependencies. */
export function withoutMissingRustWrappers(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...input };
  const path = env.PATH ?? env.Path;
  for (const key of Object.keys(env)) {
    if (!/^(RUSTC_WRAPPER|CARGO_BUILD_RUSTC_WRAPPER|RUSTC_WORKSPACE_WRAPPER)$/i.test(key)) continue;
    const wrapper = env[key];
    if (wrapper && !Bun.which(wrapper, { PATH: path })) delete env[key];
  }
  return env;
}
