import Command, { ExitCode } from "../command"
import { discoverPackages, readManifest } from "../discovery"
import { publish } from "../publishing"

/**
 * `architect vendor:publish` — copies package stub files into the consuming
 * project.
 *
 * ```
 * architect vendor:publish
 * architect vendor:publish --package=@artisansdk/cqrs
 * architect vendor:publish --tag=config
 * architect vendor:publish --force
 * ```
 */
export default class VendorPublishCommand extends Command {
    readonly signature =
        "vendor:publish {--package= : Only publish this package} {--tag=* : Only publish these tags} {--force : Overwrite existing files}"

    readonly description = "Publish package assets into the project"

    async handle(): Promise<number | void> {
        const packages = readManifest()?.packages ?? discoverPackages()

        const results = publish(packages, {
            package: (this.option("package") as string | undefined) || undefined,
            tags: this.option("tag") as string[],
            force: this.option("force") === true,
        })

        if (results.length === 0) {
            this.warn("Nothing to publish for the given filters.")
            return ExitCode.SUCCESS
        }

        for (const result of results) {
            const verb =
                result.status === "skipped"
                    ? "Skipped (exists)"
                    : result.status === "overwritten"
                      ? "Overwrote"
                      : "Published"

            const line = `  ${verb}: ${result.to}  [${result.package}:${result.tag}]`
            if (result.status === "skipped") {
                this.comment(line)
            } else {
                this.info(line)
            }
        }

        const skipped = results.filter((result) => result.status === "skipped").length
        if (skipped > 0) {
            this.comment(`${skipped} file(s) already existed. Re-run with --force to overwrite.`)
        }
    }
}
