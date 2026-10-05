// Hardcoded module "dotenv/config"
// Same option sources as dotenv 17 config.js: DOTENV_CONFIG_* environment variables, then
// dotenv_config_<option>=<value> arguments; quiet unless told otherwise.

const dotenv = require("internal/dotenv");

const options: Record<string, string> = {};
for (const [name, key] of [
  ["encoding", "DOTENV_CONFIG_ENCODING"],
  ["path", "DOTENV_CONFIG_PATH"],
  ["quiet", "DOTENV_CONFIG_QUIET"],
  ["debug", "DOTENV_CONFIG_DEBUG"],
  ["override", "DOTENV_CONFIG_OVERRIDE"],
  ["DOTENV_KEY", "DOTENV_CONFIG_DOTENV_KEY"],
]) {
  const value = process.env[key];
  if (value != null) options[name] = value;
}
const cli: Record<string, string> = {};
for (const arg of process.argv) {
  const match = arg.match(/^dotenv_config_(encoding|path|quiet|debug|override|DOTENV_KEY)=(.+)$/);
  if (match) cli[match[1]] = match[2];
}
if (!("quiet" in cli)) cli.quiet = "true";

dotenv.config(Object.assign(options, cli));

export default {};
