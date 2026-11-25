/**
 * A weighted draw. `odds(chances, outOf)` is Pennant's `Lottery`: wins `chances` in `outOf`.
 * `pick()` draws one of several values by weight.
 *
 * `draw()` is random; `draw(seed)` hashes the seed, so the same seed always draws the same value.
 */
export default class Lottery {
    protected constructor(protected entries: [value: unknown, weight: number][]) {}

    /**
     * Win `chances` in `outOf`, e.g. `Lottery.odds(1, 10)` for a 10% rollout.
     */
    static odds(chances: number, outOf: number): Lottery {
        return new Lottery([
            [true, chances],
            [false, outOf - chances],
        ])
    }

    /**
     * Pick one value: equally from a list (`["a", "b", "c"]`), or by weight from a map (`{ a: 2, b: 1, c: 1 }`).
     *
     * @throws Error when there are no values, a weight is negative or not finite, or the weights sum to zero.
     */
    static pick(values: string[] | Record<string, number>): Lottery {
        const entries: [string, number][] = Array.isArray(values)
            ? values.map((value) => [value, 1])
            : Object.entries(values)
        if (!entries.length || entries.some(([, weight]) => !Number.isFinite(weight) || weight < 0)) {
            throw new Error("Lottery.pick() needs at least one value and finite, non-negative weights.")
        }
        if (!entries.some(([, weight]) => weight > 0)) {
            throw new Error("Lottery.pick() weights must not all be zero.")
        }
        return new Lottery(entries)
    }

    /**
     * Draw a value, at random or from a hash of `seed`.
     */
    draw(seed?: string): unknown {
        const roll = seed === undefined ? Math.random() : this.hash(seed)
        const target = roll * this.entries.reduce((total, [, weight]) => total + weight, 0)
        let sum = 0
        for (const [value, weight] of this.entries) {
            sum += weight
            if (target < sum) return value
        }
        // Only reached by degenerate odds such as `odds(0, 0)`, which lose.
        return this.entries[this.entries.length - 1][0]
    }

    /**
     * A uniform number in [0, 1) from the seed: FNV-1a 32-bit with the murmur3 finalizer.
     */
    protected hash(seed: string): number {
        // ponytail: not cryptographic, so groups are guessable; tests check even, independent splits on 10k ids.
        let hash = 0x811c9dc5
        for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193)
        // Raw FNV-1a's low bits barely mix (bit 0 is the input's parity), so avalanche before scaling.
        hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
        hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
        return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000
    }
}
