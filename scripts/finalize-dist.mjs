// Post-processes the `tsc` output in dist/ so the package is consumable as plain
// ESM without a bundler (no `transpilePackages` needed downstream):
//
//   1. Rewrites every relative import/export specifier to a fully-specified path
//      with a `.js` extension (`./foo` -> `./foo.js`, a dir -> `./foo/index.js`).
//      `tsc` emits extensionless specifiers under moduleResolution "Bundler";
//      Node's ESM resolver and strict bundlers reject those.
//   2. Restores the hand-authored ambient declaration (`env.global.d.ts`) and its
//      `/// <reference />` in index.d.ts, which `tsc` does not copy on its own.
//
// The source tree stays extensionless — Bun runs it directly via the "bun"
// export condition, everyone else gets this finalized dist/.

import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(fileURLToPath(import.meta.url), "../..")
const dist = join(root, "dist")

const SPECIFIER = /(\bfrom\s*|\bimport\s*|\bexport\s*\*\s*from\s*|\bimport\s*\(\s*)(["'])(\.\.?\/[^"']*?)\2/g

function walk(dir) {
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) out.push(...walk(full))
        else if (/\.(js|d\.ts)$/.test(entry.name)) out.push(full)
    }
    return out
}

function resolveSpecifier(fromFile, spec) {
    const base = resolve(dirname(fromFile), spec)
    if (existsSync(`${base}.js`)) return `${spec}.js`
    if (existsSync(base) && statSync(base).isDirectory() && existsSync(join(base, "index.js"))) {
        return `${spec.replace(/\/$/, "")}/index.js`
    }
    return null
}

let rewritten = 0
let touched = 0
for (const file of walk(dist)) {
    const src = readFileSync(file, "utf8")
    let changed = false
    const next = src.replace(SPECIFIER, (match, head, quote, spec) => {
        if (/\.(js|json|css)$/.test(spec)) return match
        const fixed = resolveSpecifier(file, spec)
        if (!fixed) {
            console.warn(`  ! could not resolve ${spec} in ${file.slice(dist.length + 1)}`)
            return match
        }
        changed = true
        rewritten++
        return `${head}${quote}${fixed}${quote}`
    })
    if (changed) {
        writeFileSync(file, next)
        touched++
    }
}

// Ambient global declaration — tsc leaves it behind.
const ambientSrc = join(root, "src/config/env.global.d.ts")
const ambientOut = join(dist, "config/env.global.d.ts")
if (existsSync(ambientSrc)) {
    copyFileSync(ambientSrc, ambientOut)
    const indexDts = join(dist, "index.d.ts")
    const reference = '/// <reference path="./config/env.global.d.ts" />\n'
    const current = readFileSync(indexDts, "utf8")
    if (!current.includes(reference.trim())) {
        writeFileSync(indexDts, reference + current)
    }
}

console.log(`finalize-dist: rewrote ${rewritten} specifiers across ${touched} files`)
