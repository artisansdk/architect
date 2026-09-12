export type { ConsoleApplicationOptions } from "./application"
export { default as ConsoleApplication } from "./application"
export type { CommandContext } from "./command"
export { default as Command, ExitCode } from "./command"
export type { default as ArgumentDefinition } from "./contracts/argument"
export type { default as CommandDefinition } from "./contracts/command"
export type { default as ConsoleDriver } from "./contracts/console-driver"
export type { default as OptionDefinition } from "./contracts/option"
export type { default as ParsedInput } from "./contracts/parsed-input"
export type {
    DiscoveredPackage,
    PackageManifest,
    PublishEntry,
} from "./discovery"
export {
    discoverPackages,
    manifestPath,
    readManifest,
    writeManifest,
} from "./discovery"
export type { ArgsConsoleDriverOptions } from "./drivers/args"
export { default as ArgsConsoleDriver } from "./drivers/args"
export { default as Input } from "./input"
export type { default as OutputWriter } from "./output/contract"
export { Buffered as BufferedOutputWriter } from "./output/drivers/buffer"
export { default as Output } from "./output/service"
export type { PublishOptions, PublishResult } from "./publishing"
export { collectPublishTargets, publish } from "./publishing"
export type { CommandSource } from "./registry"
export { default as CommandRegistry } from "./registry"
export type { ParsedSignature } from "./signature-parser"
export { default as SignatureParser } from "./signature-parser"
