import ConfigRepository from "../config/repository"

export default abstract class Manager<TDriver, TFactory = TDriver> {
    protected drivers: Record<string, TDriver>
    protected customCreators: Record<string, (config: ConfigRepository) => TDriver>
    protected active: string
    protected config: ConfigRepository

    constructor(
        drivers: Record<string, TDriver>,
        active = "default",
        config: ConfigRepository = new ConfigRepository({}),
    ) {
        this.drivers = { ...drivers }
        this.customCreators = {}
        this.config = config
        this.active = active in drivers ? active : this.defaultDriverName()
    }

    extend(name: string, factory: (config: ConfigRepository) => TFactory): this {
        this.customCreators[name] = (cfg) => this.createDriver(factory(cfg), cfg)
        return this
    }

    use(name: string): this {
        this.active = this.resolve(name) ? name : this.active
        return this
    }

    /**
     * The name of the active driver.
     */
    getDefaultDriver(): string {
        return this.active
    }

    protected abstract createDriver(raw: TFactory, config: ConfigRepository): TDriver

    protected defaultDriverName(): string {
        return Object.keys(this.drivers)[0] ?? "default"
    }

    protected driverType(): string {
        return "Driver"
    }

    protected resolve(name: string): TDriver {
        if (name in this.drivers) {
            return this.drivers[name]
        }

        if (name in this.customCreators) {
            const driver = this.customCreators[name](this.config)
            this.drivers[name] = driver
            return driver
        }

        throw new Error(`${this.driverType()} [${name}] is not defined.`)
    }
}
