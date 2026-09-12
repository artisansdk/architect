import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"

/** A single `{ from, to }` copy declared under `architect.publishes.<tag>`. */
export interface PublishEntry {
    from: string
    to: string
}

/** What one package contributes through its `package.json#architect` block. */
export interface DiscoveredPackage {
    name: string
    /** Absolute paths to command modules, each default-exporting a `Command` subclass. */
    commands: string[]
    /** Publishable file groups keyed by tag; paths are absolute. */
    publishes: Record<string, PublishEntry[]>
}

export interface PackageManifest {
    generatedAt: string
    packages: DiscoveredPackage[]
}

interface ArchitectPackageBlock {
    commands?: string[]
    publishes?: Record<string, PublishEntry[]>
}

const MANIFEST_DIR = join("node_modules", ".cache", "architect")
const MANIFEST_FILE = "packages.json"

/** Where the cached command manifest lives for a given project root. */
export function manifestPath(cwd: string = process.cwd()): string {
    return join(cwd, MANIFEST_DIR, MANIFEST_FILE)
}

function readJson<T>(path: string): T | null {
    try {
        return JSON.parse(readFileSync(path, "utf8")) as T
    } catch {
        return null
    }
}

function dependencyNames(cwd: string): string[] {
    const pkg = readJson<Record<string, Record<string, string>>>(join(cwd, "package.json"))
    if (!pkg) {
        return []
    }

    return [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}),
    ]
}

function resolvePackageDir(cwd: string, name: string): string | null {
    const direct = join(cwd, "node_modules", name)
    if (existsSync(join(direct, "package.json"))) {
        return direct
    }

    return null
}

function absolutize(packageDir: string, path: string): string {
    return isAbsolute(path) ? path : resolve(packageDir, path)
}

function readArchitectBlock(packageDir: string): { name: string; block: ArchitectPackageBlock } | null {
    const pkg = readJson<{ name?: string; architect?: ArchitectPackageBlock }>(join(packageDir, "package.json"))
    if (!pkg?.architect) {
        return null
    }

    return { name: pkg.name ?? packageDir, block: pkg.architect }
}

function toDiscoveredPackage(
    name: string,
    packageDir: string,
    block: ArchitectPackageBlock,
    cwd: string,
): DiscoveredPackage {
    const publishes: Record<string, PublishEntry[]> = {}
    for (const [tag, entries] of Object.entries(block.publishes ?? {})) {
        publishes[tag] = entries.map((entry) => ({
            from: absolutize(packageDir, entry.from),
            to: absolutize(cwd, entry.to),
        }))
    }

    return {
        name,
        commands: (block.commands ?? []).map((path) => absolutize(packageDir, path)),
        publishes,
    }
}

/**
 * Walk the project's declared dependencies (plus the project itself) and collect
 * every `package.json#architect` block. No service provider required — a package
 * opts in purely through its manifest.
 */
export function discoverPackages(cwd: string = process.cwd()): DiscoveredPackage[] {
    const found: DiscoveredPackage[] = []
    const seen = new Set<string>()

    const consider = (packageDir: string) => {
        const architect = readArchitectBlock(packageDir)
        if (!architect || seen.has(architect.name)) {
            return
        }

        seen.add(architect.name)
        found.push(toDiscoveredPackage(architect.name, packageDir, architect.block, cwd))
    }

    consider(cwd)

    for (const name of dependencyNames(cwd)) {
        const dir = resolvePackageDir(cwd, name)
        if (dir) {
            consider(dir)
        }
    }

    return found.sort((a, b) => a.name.localeCompare(b.name))
}

/** Serialise a manifest to disk and return the path it was written to. */
export function writeManifest(packages: DiscoveredPackage[], cwd: string = process.cwd()): string {
    const path = manifestPath(cwd)
    mkdirSync(dirname(path), { recursive: true })

    const manifest: PackageManifest = { generatedAt: new Date().toISOString(), packages }
    writeFileSync(path, `${JSON.stringify(manifest, null, 4)}\n`)

    return path
}

/** Load a previously written manifest, or `null` if `package:discover` has never run. */
export function readManifest(cwd: string = process.cwd()): PackageManifest | null {
    return readJson<PackageManifest>(manifestPath(cwd))
}
