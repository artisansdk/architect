import type { ConfigItems } from "../config/repository"
import { mergeRuntimeOptions, type RuntimeOptions } from "../container/runtime"

export type ApplicationConfigureOptions = {
    basePath?: string
    container?: RuntimeOptions
    config?: ConfigItems
}

export type ApplicationResolvedOptions = {
    basePath: string
    container: ReturnType<typeof mergeRuntimeOptions>
    config: ConfigItems
}

export function mergeConfigureOptions(options: ApplicationConfigureOptions = {}): ApplicationResolvedOptions {
    return {
        basePath: options.basePath ?? "./",
        container: mergeRuntimeOptions(options.container),
        config: options.config ?? {},
    }
}
