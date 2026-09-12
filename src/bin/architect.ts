#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import ConsoleApplication from "../console/application"

function resolveVersion(): string {
    try {
        const here = dirname(fileURLToPath(import.meta.url))
        // src/bin/ -> repo root; dist/bin/ -> package root. Both are two levels up.
        const pkg = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")) as { version?: string }
        return pkg.version ?? "0.0.0"
    } catch {
        return "0.0.0"
    }
}

async function main(): Promise<void> {
    const app = ConsoleApplication.create({ name: "architect", version: resolveVersion() })
    await app.discover()

    const status = await app.run(process.argv.slice(2))
    process.exit(status)
}

void main()
