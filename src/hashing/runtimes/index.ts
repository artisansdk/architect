import { type BunPassword, bunRuntime } from "./bun"
import type { Runtime } from "./contract"
import { type NodeCrypto, nodeRuntime } from "./node"
import { wasmRuntime } from "./wasm"

type Globals = {
    Bun?: { password: BunPassword }
    process?: { getBuiltinModule?: (id: string) => Partial<NodeCrypto> | undefined }
}

let detected: Runtime | undefined

/**
 * Picks the fastest runtime available: Bun's native hasher, then Node's `crypto.argon2`, then WASM
 * (browsers, workers, Deno, Tauri webviews, older Node). `getBuiltinModule` keeps `node:crypto`
 * out of browser bundles.
 */
export function detectRuntime(): Runtime {
    if (detected) {
        return detected
    }

    const globals = globalThis as Globals
    const crypto = globals.process?.getBuiltinModule?.("node:crypto")

    if (globals.Bun?.password) {
        detected = bunRuntime(globals.Bun.password)
    } else if (typeof crypto?.argon2 === "function") {
        detected = nodeRuntime(crypto as NodeCrypto)
    } else {
        detected = wasmRuntime
    }

    return detected
}

export { type BunPassword, bunRuntime, type NodeCrypto, nodeRuntime, wasmRuntime }
