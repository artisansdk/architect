import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { discoverPackages, readManifest, writeManifest } from "@/console/discovery"
import { collectPublishTargets, publish } from "@/console/publishing"

const ROOT = join(import.meta.dir, "../.tmp-console-discovery")

function scaffold() {
    rmSync(ROOT, { recursive: true, force: true })

    const cqrs = join(ROOT, "node_modules", "@artisansdk", "cqrs")
    mkdirSync(join(cqrs, "dist", "console"), { recursive: true })
    mkdirSync(join(cqrs, "stubs"), { recursive: true })

    writeFileSync(
        join(ROOT, "package.json"),
        JSON.stringify({ name: "app", dependencies: { "@artisansdk/cqrs": "^1.0.0", "left-pad": "1.0.0" } }),
    )
    writeFileSync(
        join(cqrs, "package.json"),
        JSON.stringify({
            name: "@artisansdk/cqrs",
            architect: {
                commands: ["./dist/console/make-command.js", "./dist/console/make-query.js"],
                publishes: {
                    config: [{ from: "./stubs/config.ts", to: "./config/cqrs.ts" }],
                },
            },
        }),
    )
    writeFileSync(join(cqrs, "dist", "console", "make-command.js"), "export default class {}\n")
    writeFileSync(join(cqrs, "dist", "console", "make-query.js"), "export default class {}\n")
    writeFileSync(join(cqrs, "stubs", "config.ts"), "export default { queue: 'sync' }\n")

    // A dependency without an architect block is ignored.
    const leftPad = join(ROOT, "node_modules", "left-pad")
    mkdirSync(leftPad, { recursive: true })
    writeFileSync(join(leftPad, "package.json"), JSON.stringify({ name: "left-pad" }))

    return { cqrs }
}

afterEach(() => {
    rmSync(ROOT, { recursive: true, force: true })
})

describe("package discovery", () => {
    test("collects architect blocks from declared dependencies only", () => {
        scaffold()
        const packages = discoverPackages(ROOT)

        expect(packages).toHaveLength(1)
        expect(packages[0].name).toBe("@artisansdk/cqrs")
        expect(packages[0].commands).toHaveLength(2)
        expect(packages[0].commands[0]).toEndWith("dist/console/make-command.js")
        expect(packages[0].publishes.config[0].from).toEndWith("stubs/config.ts")
        expect(packages[0].publishes.config[0].to).toBe(join(ROOT, "config", "cqrs.ts"))
    })

    test("writes and reads back a manifest", () => {
        scaffold()
        const path = writeManifest(discoverPackages(ROOT), ROOT)

        expect(path).toBe(join(ROOT, "node_modules", ".cache", "architect", "packages.json"))

        const manifest = readManifest(ROOT)
        expect(manifest?.packages[0].name).toBe("@artisansdk/cqrs")
        expect(manifest?.generatedAt).toBeTruthy()
    })

    test("readManifest returns null before package:discover has run", () => {
        expect(readManifest(join(ROOT, "never"))).toBeNull()
    })
})

describe("vendor publishing", () => {
    test("filters publish targets by package and tag", () => {
        scaffold()
        const packages = discoverPackages(ROOT)

        expect(collectPublishTargets(packages, { tags: ["config"] })).toHaveLength(1)
        expect(collectPublishTargets(packages, { tags: ["missing"] })).toHaveLength(0)
        expect(collectPublishTargets(packages, { package: "other" })).toHaveLength(0)
    })

    test("publishes files, skips existing ones, and overwrites with force", () => {
        scaffold()
        const packages = discoverPackages(ROOT)

        const first = publish(packages, {})
        expect(first[0].status).toBe("published")

        const again = publish(packages, {})
        expect(again[0].status).toBe("skipped")

        const forced = publish(packages, { force: true })
        expect(forced[0].status).toBe("overwritten")
    })
})
