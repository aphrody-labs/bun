import dotenv from "dotenv";
import { cli } from "../packages/cli/src/index";

dotenv.config({ quiet: true });
await cli();
