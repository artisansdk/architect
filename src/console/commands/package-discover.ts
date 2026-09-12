import Command from "../command"
import { discoverPackages, writeManifest } from "../discovery"

/** `architect package:discover` — rebuilds the cached command/publish manifest. */
export default class PackageDiscoverCommand extends Command {
    readonly signature = "package:discover"
    readonly description = "Rebuild the cached package command manifest"

    async handle(): Promise<void> {
        const packages = discoverPackages()
        const path = writeManifest(packages)

        this.info(`Discovered ${packages.length} package(s).`)

        for (const pkg of packages) {
            const commands = pkg.commands.length
            const tags = Object.keys(pkg.publishes)
            const details = [
                commands > 0 ? `${commands} command(s)` : null,
                tags.length > 0 ? `publishes: ${tags.join(", ")}` : null,
            ]
                .filter(Boolean)
                .join(", ")

            this.line(`  ${pkg.name}${details ? ` — ${details}` : ""}`)
        }

        this.comment(`Manifest written to ${path}`)
    }
}
