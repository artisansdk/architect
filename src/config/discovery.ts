import type { ConfigItems } from "./repository"
import ConfigRepository, { mergeItems } from "./repository"

type GlobLoader = (pattern: string | string[], options?: { eager?: boolean }) => Record<string, unknown>

type ConfigModule = { default?: unknown }

export interface ConfigLoader {
    load(basePath: string, staticItems?: ConfigItems): ConfigItems
}

function fileNameWithoutExtension(path: string): string {
    const file = path.split("/").pop() ?? path
    return file.replace(/\.[^/.]+$/, "")
}

function loadConfigFromModules(modules: Record<string, unknown>): ConfigItems {
    const discovered: ConfigItems = {}

    for (const [path, loaded] of Object.entries(modules)) {
        const key = fileNameWithoutExtension(path)
        const value = readConfigModuleDefault(loaded)
        if (key !== "index" && value !== undefined) {
            discovered[key] = value
        }
    }

    return discovered
}

function readConfigModuleDefault(loaded: unknown): unknown {
    const module = loaded as ConfigModule
    return module && "default" in module ? module.default : undefined
}

function cloneItems(items: ConfigItems): ConfigItems {
    if (typeof structuredClone === "function") {
        return structuredClone(items) as ConfigItems
    }
    return JSON.parse(JSON.stringify(items)) as ConfigItems
}

function loadEsmConfigModules(basePath: string): Record<string, unknown> {
    const glob = resolveConfigGlob()
    if (!glob) {
        return {}
    }

    const modules = glob(configPatternForBasePath(basePath), { eager: true })
    return modules as Record<string, unknown>
}

function resolveConfigGlob(): GlobLoader | null {
    const testGlob = (
        globalThis as {
            __iocConfigGlobForTests?: GlobLoader
        }
    ).__iocConfigGlobForTests

    const viteGlob = (
        import.meta as ImportMeta & {
            glob?: GlobLoader
        }
    ).glob

    return typeof testGlob === "function" ? testGlob : typeof viteGlob === "function" ? viteGlob : null
}

function configPatternForBasePath(basePath: string): string {
    return basePath.endsWith("/") ? `${basePath}config/**/*.ts` : `${basePath}/config/**/*.ts`
}

class EsmConfigLoader implements ConfigLoader {
    load(basePath: string, staticItems: ConfigItems = {}): ConfigItems {
        const esmItems = loadConfigFromModules(loadEsmConfigModules(basePath))

        return mergeItems(esmItems, cloneItems(staticItems))
    }
}

function createConfigRepository(
    basePath: string,
    staticItems: ConfigItems = {},
    loader?: ConfigLoader,
): ConfigRepository {
    const configLoader = loader ?? new EsmConfigLoader()
    const items = configLoader.load(basePath, staticItems)
    return new ConfigRepository(items)
}

const ConfigFactory = {
    create: createConfigRepository,
}

export function createConfig(basePath: string, staticItems: ConfigItems = {}, loader?: ConfigLoader): ConfigRepository {
    return ConfigFactory.create(basePath, staticItems, loader)
}
