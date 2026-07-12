import type { Argv } from "yargs"
import * as prompts from "@clack/prompts"

export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "upgrade mycode to the latest or a specific version",
  builder: (yargs: Argv) => {
    return yargs
      .positional("target", {
        describe: "version to upgrade to, for ex '0.1.48' or 'v0.1.48'",
        type: "string",
      })
      .option("method", {
        alias: "m",
        describe: "installation method to use",
        type: "string",
        choices: ["curl", "npm", "pnpm", "bun", "brew", "choco", "scoop"],
      })
  },
  handler: async () => {
    prompts.intro("Upgrade")
    prompts.log.warn("Upgrade is disabled in this build.")
    prompts.log.info("Update via git rebase upstream/dev instead. See docs/superpowers/update-procedure.md")
    prompts.outro("Done")
  },
}