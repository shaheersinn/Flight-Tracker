// apps/worker/src/index.ts
import dotenv from "dotenv";
dotenv.config();

import { runScraper } from "./scraper";

async function main() {
  try {
    await runScraper();
    process.exit(0);
  } catch (err: any) {
    console.error("Fatal error in scraper:", err);
    process.exit(1);
  }
}

main();
