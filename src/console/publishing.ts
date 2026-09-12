import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { DiscoveredPackage, PublishEntry } from "./discovery"

export interface PublishOptions {
    /** Restrict to one package by name. */
    package?: string
    /** Restrict to one or more tags. */
    tags?: string[]
    /** Overwrite files that already exist at the destination. */
    force?: boolean
}

export interface PublishResult {
    package: string
    tag: string
    from: string
    to: string
    status: "published" | "overwritten" | "skipped"
}

interface PublishTarget {
    package: string
    tag: string
    entry: PublishEntry
}

/** Flatten the manifest's publish groups into individual targets, applying the filters. */
export function collectPublishTargets(packages: DiscoveredPackage[], options: PublishOptions = {}): PublishTarget[] {
    const targets: PublishTarget[] = []

    for (const pkg of packages) {
        if (options.package && pkg.name !== options.package) {
            continue
        }

        for (const [tag, entries] of Object.entries(pkg.publishes)) {
            if (options.tags && options.tags.length > 0 && !options.tags.includes(tag)) {
                continue
            }

            for (const entry of entries) {
                targets.push({ package: pkg.name, tag, entry })
            }
        }
    }

    return targets
}

/** Copy each publishable file into the consuming project, honoring `--force`. */
export function publish(packages: DiscoveredPackage[], options: PublishOptions = {}): PublishResult[] {
    return collectPublishTargets(packages, options).map(({ package: name, tag, entry }) => {
        const exists = existsSync(entry.to)

        if (exists && !options.force) {
            return { package: name, tag, from: entry.from, to: entry.to, status: "skipped" as const }
        }

        mkdirSync(dirname(entry.to), { recursive: true })
        copyFileSync(entry.from, entry.to)

        return {
            package: name,
            tag,
            from: entry.from,
            to: entry.to,
            status: exists ? ("overwritten" as const) : ("published" as const),
        }
    })
}
