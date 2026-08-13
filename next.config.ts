import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const appVersion: string = JSON.parse(readFileSync("./package.json", "utf-8")).version;
const gitSha: string = (() => {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim(); }
  catch { return "dev"; }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  // @ullav-dev/tack-notes and @ullav-dev/dam-picker both ship raw TS source
  // with no build step (see awe-client's next.config.ts) -- without this,
  // Next excludes node_modules from transpilation and the build fails.
  transpilePackages: ["@ullav-dev/tack-notes", "@ullav-dev/dam-picker"],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
};

export default withNextIntl(nextConfig);
