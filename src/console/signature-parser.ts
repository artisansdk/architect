import type ArgumentDefinition from "./contracts/argument"
import type OptionDefinition from "./contracts/option"

export interface ParsedSignature {
    name: string
    arguments: ArgumentDefinition[]
    options: OptionDefinition[]
}

const TOKEN_PATTERN = /\{\s*(.*?)\s*\}/g

/**
 * Parses command signatures into a driver-agnostic shape.
 *
 * ```
 * {name}            required argument
 * {name?}           optional argument
 * {name=default}    argument with default (implies optional)
 * {name*}           variadic argument (at least one)
 * {name?*}          variadic argument (may be empty)
 * {--force}         boolean option
 * {--package=}      value option
 * {--queue=default} value option with default
 * {--tag=*}         repeatable value option
 * {--f|force}       option with a short alias
 * {name : The description}     trailing ` : ` sets the description
 * ```
 */
export default class SignatureParser {
    parse(signature: string): ParsedSignature {
        const name = this.extractName(signature)
        const args: ArgumentDefinition[] = []
        const options: OptionDefinition[] = []

        for (const token of this.extractTokens(signature)) {
            if (token.startsWith("--")) {
                options.push(this.parseOption(token))
            } else {
                args.push(this.parseArgument(token))
            }
        }

        return { name, arguments: args, options }
    }

    protected extractName(signature: string): string {
        const brace = signature.indexOf("{")
        const name = (brace === -1 ? signature : signature.slice(0, brace)).trim()

        if (!name) {
            throw new Error(`The command signature [${signature}] is missing a command name.`)
        }

        return name
    }

    protected extractTokens(signature: string): string[] {
        const tokens: string[] = []

        for (const match of signature.matchAll(TOKEN_PATTERN)) {
            const token = match[1].trim()
            if (token) {
                tokens.push(token)
            }
        }

        return tokens
    }

    protected splitDescription(token: string): [string, string] {
        const index = token.indexOf(":")
        if (index === -1) {
            return [token.trim(), ""]
        }

        return [token.slice(0, index).trim(), token.slice(index + 1).trim()]
    }

    protected parseArgument(token: string): ArgumentDefinition {
        const [body, description] = this.splitDescription(token)

        let name = body
        let required = true
        let array = false
        let defaultValue: string | undefined

        if (name.includes("=")) {
            const [head, tail] = this.splitOnce(name, "=")
            name = head
            required = false
            defaultValue = tail
        }

        if (name.endsWith("*")) {
            name = name.slice(0, -1)
            array = true
        }

        if (name.endsWith("?")) {
            name = name.slice(0, -1)
            required = false
        }

        return {
            name,
            description,
            required,
            array,
            default: array ? (defaultValue === undefined ? [] : [defaultValue]) : defaultValue,
        }
    }

    protected parseOption(token: string): OptionDefinition {
        const [body, description] = this.splitDescription(token)

        let name = body.slice(2)
        let shortcut: string | undefined
        let acceptsValue = false
        let array = false
        let defaultValue: string | string[] | boolean = false

        if (name.includes("|")) {
            const [alias, rest] = this.splitOnce(name, "|")
            shortcut = alias.replace(/^-+/, "")
            name = rest
        }

        if (name.includes("=")) {
            const [head, tail] = this.splitOnce(name, "=")
            name = head
            acceptsValue = true

            if (tail === "*") {
                array = true
                defaultValue = []
            } else if (tail === "") {
                defaultValue = undefined as unknown as boolean
            } else {
                defaultValue = tail
            }
        }

        return { name, description, shortcut, acceptsValue, array, default: defaultValue }
    }

    protected splitOnce(value: string, separator: string): [string, string] {
        const index = value.indexOf(separator)
        return [value.slice(0, index), value.slice(index + separator.length)]
    }
}
