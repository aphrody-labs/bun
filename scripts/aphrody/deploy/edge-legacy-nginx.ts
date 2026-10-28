// Optional adapter for the historical Aphrody runtime; upstream Bun does not provide bun:nginx.
import Nginx from "bun:nginx";
import type { EdgeAdapter } from "./edge";

const adapter: EdgeAdapter = { create: options => Nginx.create(options) };
export default adapter;
