import { describe, expect, test } from "bun:test"
import { Collection } from "@/support/collection"

describe("Collection", () => {
    test("lazy() defers transformations and supports repeated iteration", () => {
        const visited: number[] = []
        const source = new Collection([1, 2, 3])
        const lazy = source.lazy().map((value) => {
            visited.push(value)
            return value * 2
        })

        expect(visited).toEqual([])
        expect(lazy.first()).toBe(2)
        expect(visited).toEqual([1])
        expect(lazy.collect().all()).toEqual([2, 4, 6])
        expect(source.all()).toEqual([1, 2, 3])
        expect(new Collection<number>().lazy().all()).toEqual([])
    })

    // ── Existing tests ─────────────────────────────────────────────────────────

    test("make() constructs from array or null", () => {
        expect(Collection.make([1, 2, 3]).all()).toEqual([1, 2, 3])
        expect(Collection.make(null).all()).toEqual([])
        expect(Collection.make().all()).toEqual([])
    })

    test("count / isEmpty / isNotEmpty", () => {
        const c = new Collection([1, 2, 3])
        expect(c.count()).toBe(3)
        expect(c.isEmpty()).toBe(false)
        expect(c.isNotEmpty()).toBe(true)
        expect(new Collection().isEmpty()).toBe(true)
    })

    test("first and last", () => {
        const c = new Collection([1, 2, 3])
        expect(c.first()).toBe(1)
        expect(c.last()).toBe(3)
        expect(c.first((n) => n > 1)).toBe(2)
        expect(c.last((n) => n < 3)).toBe(2)
        expect(new Collection().first()).toBeNull()
        expect(new Collection().last()).toBeNull()
    })

    test("map / filter / reject", () => {
        const c = new Collection([1, 2, 3, 4])
        expect(c.map((n) => n * 2).all()).toEqual([2, 4, 6, 8])
        expect(c.filter((n) => n % 2 === 0).all()).toEqual([2, 4])
        expect(c.reject((n) => n % 2 === 0).all()).toEqual([1, 3])
    })

    test("reduce", () => {
        expect(new Collection([1, 2, 3, 4]).reduce((sum, n) => sum + n, 0)).toBe(10)
    })

    test("each visits every item and returns this", () => {
        const seen: number[] = []
        const c = new Collection([1, 2, 3])
        const result = c.each((n) => seen.push(n))
        expect(seen).toEqual([1, 2, 3])
        expect(result).toBe(c)
    })

    test("pluck extracts a property", () => {
        const c = new Collection([{ name: "a" }, { name: "b" }])
        expect(c.pluck("name").all()).toEqual(["a", "b"])
    })

    test("contains", () => {
        const c = new Collection([1, 2, 3])
        expect(c.contains(2)).toBe(true)
        expect(c.contains(5)).toBe(false)
        expect(c.contains((n) => n > 2)).toBe(true)
        expect(c.contains((n) => n > 10)).toBe(false)
    })

    test("unique", () => {
        expect(new Collection([1, 2, 1, 3]).unique().all()).toEqual([1, 2, 3])
        const c = new Collection([{ v: 1 }, { v: 2 }, { v: 1 }])
        expect(c.unique("v").count()).toBe(2)
        expect(c.unique((i) => i.v).count()).toBe(2)
    })

    test("sortBy ascending and descending", () => {
        const c = new Collection([{ n: 3 }, { n: 1 }, { n: 2 }])
        expect(c.sortBy("n").pluck("n").all()).toEqual([1, 2, 3])
        expect(c.sortBy("n", "desc").pluck("n").all()).toEqual([3, 2, 1])
    })

    test("groupBy", () => {
        const c = new Collection([
            { type: "a", v: 1 },
            { type: "b", v: 2 },
            { type: "a", v: 3 },
        ])
        const groups = c.groupBy("type")
        expect(groups.a.count()).toBe(2)
        expect(groups.b.count()).toBe(1)
    })

    test("chunk", () => {
        const chunks = new Collection([1, 2, 3, 4, 5]).chunk(2)
        expect(chunks.count()).toBe(3)
        expect(chunks.first()?.all()).toEqual([1, 2])
        expect(chunks.last()?.all()).toEqual([5])
    })

    test("flatten", () => {
        expect(
            new Collection([
                [1, 2],
                [3, 4],
            ])
                .flatten()
                .all(),
        ).toEqual([1, 2, 3, 4])
        expect(new Collection([[1, [2]], [3]]).flatten(1).all()).toEqual([1, [2], 3])
    })

    test("take and skip", () => {
        const c = new Collection([1, 2, 3, 4, 5])
        expect(c.take(3).all()).toEqual([1, 2, 3])
        expect(c.take(-2).all()).toEqual([4, 5])
        expect(c.skip(2).all()).toEqual([3, 4, 5])
    })

    test("concat", () => {
        const a = new Collection([1, 2])
        expect(a.concat([3, 4]).all()).toEqual([1, 2, 3, 4])
        expect(a.concat(new Collection([5])).all()).toEqual([1, 2, 5])
    })

    test("push and prepend mutate", () => {
        const c = new Collection([2])
        c.push(3).prepend(1)
        expect(c.all()).toEqual([1, 2, 3])
    })

    test("constructor copies input — mutations don't leak", () => {
        const src = [1, 2, 3]
        const c = new Collection(src)
        src.push(4)
        expect(c.count()).toBe(3)
    })

    // ── Static constructors ────────────────────────────────────────────────────

    test("fromJson wraps parsed JSON", () => {
        expect(Collection.fromJson("[1,2,3]").all()).toEqual([1, 2, 3])
        expect(Collection.fromJson('{"a":1}').all()).toEqual([{ a: 1 }])
    })

    test("range creates inclusive range", () => {
        expect(Collection.range(1, 5).all()).toEqual([1, 2, 3, 4, 5])
        expect(Collection.range(3, 3).all()).toEqual([3])
    })

    test("times invokes callback 1..n", () => {
        expect(Collection.times(4, (n) => n * n).all()).toEqual([1, 4, 9, 16])
    })

    test("wrap handles scalar, array, Collection, null", () => {
        expect(Collection.wrap(5).all()).toEqual([5])
        expect(Collection.wrap([1, 2]).all()).toEqual([1, 2])
        expect(Collection.wrap(new Collection([7])).all()).toEqual([7])
        expect(Collection.wrap(null).all()).toEqual([])
        expect(Collection.wrap(undefined).all()).toEqual([])
    })

    test("unwrap returns array or scalar", () => {
        expect(Collection.unwrap([1, 2])).toEqual([1, 2])
        expect(Collection.unwrap(new Collection([3, 4]))).toEqual([3, 4])
        expect(Collection.unwrap(42)).toBe(42)
    })

    // ── avg / average / some ───────────────────────────────────────────────────

    test("avg and average", () => {
        expect(new Collection([1, 2, 3, 4]).avg()).toBe(2.5)
        expect(new Collection([1, 2, 3, 4]).average()).toBe(2.5)
        expect(new Collection<number>([]).avg()).toBe(0)
        const c = new Collection([{ v: 10 }, { v: 20 }])
        expect(c.avg("v")).toBe(15)
        expect(c.avg((i) => i.v)).toBe(15)
    })

    test("some is an alias for contains-with-callback", () => {
        const c = new Collection([1, 2, 3])
        expect(c.some((n) => n > 2)).toBe(true)
        expect(c.some((n) => n > 10)).toBe(false)
    })

    // ── Navigation ────────────────────────────────────────────────────────────

    test("after returns item after match", () => {
        const c = new Collection([10, 20, 30, 40])
        expect(c.after(20)).toBe(30)
        expect(c.after(40)).toBeNull()
        expect(c.after((n) => n === 10)).toBe(20)
    })

    test("before returns item before match", () => {
        const c = new Collection([10, 20, 30])
        expect(c.before(20)).toBe(10)
        expect(c.before(10)).toBeNull()
        expect(c.before((n) => n === 30)).toBe(20)
    })

    // ── Stats ─────────────────────────────────────────────────────────────────

    test("countBy groups and counts", () => {
        const result = new Collection(["a", "b", "a", "c", "b", "b"]).countBy()
        expect(result).toEqual({ a: 2, b: 3, c: 1 })
        const c = new Collection([{ type: "x" }, { type: "y" }, { type: "x" }])
        expect(c.countBy((i) => i.type)).toEqual({ x: 2, y: 1 })
    })

    test("sum", () => {
        expect(new Collection([1, 2, 3]).sum()).toBe(6)
        expect(new Collection([{ v: 5 }, { v: 10 }]).sum("v")).toBe(15)
        expect(new Collection([{ v: 5 }, { v: 10 }]).sum((i) => i.v * 2)).toBe(30)
    })

    test("min and max", () => {
        const nums = new Collection([3, 1, 4, 1, 5, 9])
        expect(nums.min()).toBe(1)
        expect(nums.max()).toBe(9)
        expect(new Collection<number>([]).min()).toBeNull()
        const objs = new Collection([{ n: 5 }, { n: 1 }, { n: 3 }])
        expect(objs.min("n")).toEqual({ n: 1 })
        expect(objs.max("n")).toEqual({ n: 5 })
    })

    test("median", () => {
        expect(new Collection([3, 1, 2]).median()).toBe(2)
        expect(new Collection([1, 2, 3, 4]).median()).toBe(2.5)
        expect(new Collection<number>([]).median()).toBeNull()
    })

    test("mode", () => {
        expect(new Collection([1, 2, 2, 3]).mode()).toEqual([2, 2])
        expect(new Collection([1, 1, 2, 2]).mode()).toEqual([1, 1, 2, 2])
        expect(new Collection<number>([]).mode()).toEqual([])
    })

    test("percentage", () => {
        const c = new Collection([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        expect(c.percentage((n) => n % 2 === 0)).toBe(50)
        expect(c.percentage((n) => n <= 3)).toBe(30)
    })

    // ── Searching ─────────────────────────────────────────────────────────────

    test("firstOrFail throws if not found", () => {
        expect(() => new Collection<number>([]).firstOrFail()).toThrow("Item not found.")
        expect(new Collection([1, 2, 3]).firstOrFail((n) => n > 1)).toBe(2)
    })

    test("firstWhere with operators", () => {
        const c = new Collection([{ n: 1 }, { n: 2 }, { n: 3 }])
        expect(c.firstWhere("n", 2)).toEqual({ n: 2 })
        expect(c.firstWhere("n", ">", 1)).toEqual({ n: 2 })
        expect(c.firstWhere("n", "===", 3)).toEqual({ n: 3 })
        expect(c.firstWhere("n", ">=", 10)).toBeNull()
    })

    test("search returns index or false", () => {
        const c = new Collection([10, 20, 30])
        expect(c.search(20)).toBe(1)
        expect(c.search(99)).toBe(false)
        expect(c.search((n) => n === 30)).toBe(2)
    })

    test("sole throws on 0 or >1 matches", () => {
        const c = new Collection([{ n: 1 }, { n: 2 }, { n: 2 }])
        expect(c.sole((i) => i.n === 1)).toEqual({ n: 1 })
        expect(() => c.sole((i) => i.n === 2)).toThrow("Multiple items match")
        expect(() => c.sole((i) => i.n === 9)).toThrow("No items match")
    })

    test("value returns key from first item", () => {
        const c = new Collection([{ x: 42 }, { x: 99 }])
        expect(c.value("x")).toBe(42)
        expect(new Collection<{ x: number }>([]).value("x")).toBeNull()
    })

    // ── Transforming ──────────────────────────────────────────────────────────

    test("collect returns a new Collection of same items", () => {
        const c = new Collection([1, 2, 3])
        const c2 = c.collect()
        expect(c2.all()).toEqual([1, 2, 3])
        expect(c2).not.toBe(c)
    })

    test("flatMap maps then flattens one level", () => {
        const c = new Collection([1, 2, 3])
        expect(c.flatMap((n) => [n, n * 10]).all()).toEqual([1, 10, 2, 20, 3, 30])
    })

    test("mapSpread spreads array items into callback", () => {
        const c = new Collection([
            [1, 2],
            [3, 4],
        ])
        expect(c.mapSpread((a, b) => (a as number) + (b as number)).all()).toEqual([3, 7])
    })

    test("mapToGroups groups by returned key", () => {
        const c = new Collection([1, 2, 3, 4])
        const groups = c.mapToGroups((n) => [n % 2 === 0 ? "even" : "odd", n] as ["even" | "odd", number])
        expect(groups.odd.all()).toEqual([1, 3])
        expect(groups.even.all()).toEqual([2, 4])
    })

    test("mapWithKeys creates a keyed object", () => {
        const c = new Collection([
            { id: "a", v: 1 },
            { id: "b", v: 2 },
        ])
        expect(c.mapWithKeys((item) => [item.id, item.v])).toEqual({ a: 1, b: 2 })
    })

    test("transform mutates in-place", () => {
        const c = new Collection([1, 2, 3])
        const ref = c
        c.transform((n) => n * 2)
        expect(c.all()).toEqual([2, 4, 6])
        expect(c).toBe(ref)
    })

    test("undot expands dot-notation keys", () => {
        const c = new Collection([{ "a.b": 1, "a.c": 2 }])
        expect(c.undot().all()).toEqual([{ a: { b: 1, c: 2 } }])
    })

    test("dot flattens nested objects to dot notation", () => {
        const c = new Collection([{ a: { b: 1, c: 2 } }])
        expect(c.dot().all()).toEqual([{ "a.b": 1, "a.c": 2 }])
    })

    // ── Set operations ────────────────────────────────────────────────────────

    test("diff returns items in this but not other", () => {
        const c = new Collection([1, 2, 3, 4])
        expect(c.diff([2, 4]).all()).toEqual([1, 3])
        expect(c.diff(new Collection([1, 3])).all()).toEqual([2, 4])
    })

    test("intersect returns items present in both", () => {
        expect(new Collection([1, 2, 3]).intersect([2, 3, 4]).all()).toEqual([2, 3])
    })

    test("union merges without duplicates by index", () => {
        const a = new Collection([1, 2, 3])
        expect(a.union([10, 20, 30, 40]).all()).toEqual([1, 2, 3, 40])
    })

    // ── Key/object operations ─────────────────────────────────────────────────

    test("except removes specified keys from each object", () => {
        const c = new Collection([{ a: 1, b: 2, c: 3 }])
        expect(c.except(["b", "c"]).all()).toEqual([{ a: 1 }])
    })

    test("only keeps only specified keys", () => {
        const c = new Collection([{ a: 1, b: 2, c: 3 }])
        expect(c.only(["a", "b"]).all()).toEqual([{ a: 1, b: 2 }])
    })

    test("select is alias for only", () => {
        const c = new Collection([{ a: 1, b: 2, c: 3 }])
        expect(c.select(["a"]).all()).toEqual([{ a: 1 }])
    })

    test("forget removes item by index (mutating)", () => {
        const c = new Collection([10, 20, 30])
        c.forget(1)
        expect(c.all()).toEqual([10, 30])
    })

    test("pull removes and returns item at index (mutating)", () => {
        const c = new Collection([10, 20, 30])
        const item = c.pull(1)
        expect(item).toBe(20)
        expect(c.all()).toEqual([10, 30])
        expect(c.pull(99)).toBeNull()
    })

    test("put sets item at index (mutating)", () => {
        const c = new Collection([10, 20, 30])
        c.put(1, 99)
        expect(c.all()).toEqual([10, 99, 30])
    })

    test("keyBy returns keyed record", () => {
        const c = new Collection([
            { id: "a", v: 1 },
            { id: "b", v: 2 },
        ])
        expect(c.keyBy("id")).toEqual({ a: { id: "a", v: 1 }, b: { id: "b", v: 2 } })
        expect(c.keyBy((item) => item.id.toUpperCase())).toEqual({
            A: { id: "a", v: 1 },
            B: { id: "b", v: 2 },
        })
    })

    // ── Stack/queue ───────────────────────────────────────────────────────────

    test("pop removes and returns last item", () => {
        const c = new Collection([1, 2, 3])
        expect(c.pop()).toBe(3)
        expect(c.all()).toEqual([1, 2])
    })

    test("pop with count returns Collection of removed items", () => {
        const c = new Collection([1, 2, 3, 4, 5])
        const removed = c.pop(2) as Collection<number>
        expect(removed.all()).toEqual([4, 5])
        expect(c.all()).toEqual([1, 2, 3])
    })

    test("shift removes and returns first item", () => {
        const c = new Collection([1, 2, 3])
        expect(c.shift()).toBe(1)
        expect(c.all()).toEqual([2, 3])
    })

    test("shift with count returns Collection of removed items", () => {
        const c = new Collection([1, 2, 3, 4])
        const removed = c.shift(2) as Collection<number>
        expect(removed.all()).toEqual([1, 2])
        expect(c.all()).toEqual([3, 4])
    })

    test("splice removes and returns items, mutates original", () => {
        const c = new Collection([1, 2, 3, 4, 5])
        const removed = c.splice(2, 2, [10, 11])
        expect(removed.all()).toEqual([3, 4])
        expect(c.all()).toEqual([1, 2, 10, 11, 5])
    })

    // ── Pagination / windowing ────────────────────────────────────────────────

    test("forPage returns page slice", () => {
        const c = new Collection([1, 2, 3, 4, 5, 6, 7])
        expect(c.forPage(1, 3).all()).toEqual([1, 2, 3])
        expect(c.forPage(2, 3).all()).toEqual([4, 5, 6])
        expect(c.forPage(3, 3).all()).toEqual([7])
    })

    test("nth returns every nth item", () => {
        expect(new Collection([1, 2, 3, 4, 5, 6]).nth(2).all()).toEqual([1, 3, 5])
        expect(new Collection([1, 2, 3, 4, 5, 6]).nth(2, 1).all()).toEqual([2, 4, 6])
    })

    test("pad pads to size (positive = right, negative = left)", () => {
        expect(new Collection([1, 2, 3]).pad(5, 0).all()).toEqual([1, 2, 3, 0, 0])
        expect(new Collection([1, 2, 3]).pad(-5, 0).all()).toEqual([0, 0, 1, 2, 3])
        expect(new Collection([1, 2, 3]).pad(2, 0).all()).toEqual([1, 2, 3])
    })

    test("slice with offset and length", () => {
        const c = new Collection([1, 2, 3, 4, 5])
        expect(c.slice(2).all()).toEqual([3, 4, 5])
        expect(c.slice(1, 3).all()).toEqual([2, 3, 4])
    })

    test("sliding creates overlapping windows", () => {
        const windows = new Collection([1, 2, 3, 4]).sliding(2)
        expect(windows.count()).toBe(3)
        expect(windows.first()?.all()).toEqual([1, 2])
        expect(windows.last()?.all()).toEqual([3, 4])
    })

    test("split distributes items into n groups", () => {
        const groups = new Collection([1, 2, 3, 4, 5]).split(3)
        expect(groups.count()).toBe(3)
    })

    test("splitIn fills groups completely", () => {
        const groups = new Collection([1, 2, 3, 4, 5]).splitIn(3)
        expect(groups.count()).toBe(3)
    })

    // ── Conditional / tap ─────────────────────────────────────────────────────

    test("pipe passes collection to callback", () => {
        const result = new Collection([1, 2, 3]).pipe((c) => c.sum())
        expect(result).toBe(6)
    })

    test("tap does not break chain", () => {
        let tapped: number[] = []
        const result = new Collection([1, 2, 3])
            .tap((c) => {
                tapped = c.all()
            })
            .map((n) => n * 2)
        expect(tapped).toEqual([1, 2, 3])
        expect(result.all()).toEqual([2, 4, 6])
    })

    test("when / unless conditionals", () => {
        const c = new Collection([1, 2, 3])
        let ran = false
        c.when(true, () => {
            ran = true
        })
        expect(ran).toBe(true)

        let fallback = false
        c.when(
            false,
            () => {},
            () => {
                fallback = true
            },
        )
        expect(fallback).toBe(true)

        let unlessRan = false
        c.unless(false, () => {
            unlessRan = true
        })
        expect(unlessRan).toBe(true)
    })

    test("whenEmpty / whenNotEmpty", () => {
        let emptyRan = false
        let notEmptyRan = false
        new Collection<number>([]).whenEmpty(() => {
            emptyRan = true
        })
        new Collection([1]).whenNotEmpty(() => {
            notEmptyRan = true
        })
        expect(emptyRan).toBe(true)
        expect(notEmptyRan).toBe(true)
    })

    test("unlessEmpty / unlessNotEmpty are aliases", () => {
        let a = false
        let b = false
        new Collection([1]).unlessEmpty(() => {
            a = true
        })
        new Collection<number>([]).unlessNotEmpty(() => {
            b = true
        })
        expect(a).toBe(true)
        expect(b).toBe(true)
    })

    test("pipeThrough chains multiple transformers", () => {
        const result = new Collection([1, 2, 3]).pipeThrough([
            (c) => c.map((n) => n * 2),
            (c) => c.filter((n) => n > 2),
        ])
        expect(result.all()).toEqual([4, 6])
    })

    // ── Chunking / grouping ───────────────────────────────────────────────────

    test("chunkWhile groups consecutive runs", () => {
        const chunks = new Collection([1, 1, 2, 2, 3]).chunkWhile((v, _i, chunk) => v === chunk.last())
        expect(chunks.count()).toBe(3)
        expect(chunks.first()?.all()).toEqual([1, 1])
    })

    test("crossJoin produces cartesian product", () => {
        const result = new Collection([1, 2]).crossJoin(["a", "b"])
        expect(result.all()).toEqual([
            [1, "a"],
            [1, "b"],
            [2, "a"],
            [2, "b"],
        ])
    })

    test("eachSpread spreads array items into callback", () => {
        const result: number[] = []
        new Collection([
            [1, 2],
            [3, 4],
        ]).eachSpread((a, b) => result.push((a as number) + (b as number)))
        expect(result).toEqual([3, 7])
    })

    test("duplicates returns repeated items", () => {
        expect(new Collection([1, 2, 1, 3, 2]).duplicates().all()).toEqual([1, 2])
        const c = new Collection([{ v: 1 }, { v: 2 }, { v: 1 }])
        expect(c.duplicates("v").count()).toBe(1)
    })

    test("multiply repeats items n times", () => {
        expect(new Collection([1, 2]).multiply(3).all()).toEqual([1, 2, 1, 2, 1, 2])
    })

    test("zip interleaves with other arrays", () => {
        const result = new Collection([1, 2, 3]).zip(["a", "b", "c"])
        expect(result.all()).toEqual([
            [1, "a"],
            [2, "b"],
            [3, "c"],
        ])
    })

    // ── Sorting ───────────────────────────────────────────────────────────────

    test("sort with no comparator sorts primitives", () => {
        expect(new Collection([3, 1, 2]).sort().all()).toEqual([1, 2, 3])
        expect(new Collection(["c", "a", "b"]).sort().all()).toEqual(["a", "b", "c"])
    })

    test("sortByDesc sorts descending", () => {
        const c = new Collection([{ n: 1 }, { n: 3 }, { n: 2 }])
        expect(c.sortByDesc("n").pluck("n").all()).toEqual([3, 2, 1])
    })

    test("sortDesc sorts primitives descending", () => {
        expect(new Collection([1, 3, 2]).sortDesc().all()).toEqual([3, 2, 1])
    })

    test("reverse reverses the collection", () => {
        expect(new Collection([1, 2, 3]).reverse().all()).toEqual([3, 2, 1])
    })

    // ── Stringification ───────────────────────────────────────────────────────

    test("implode joins items", () => {
        expect(new Collection(["a", "b", "c"]).implode(", ")).toBe("a, b, c")
        const c = new Collection([{ name: "Alice" }, { name: "Bob" }])
        expect(c.implode("name", ", ")).toBe("Alice, Bob")
    })

    test("join with optional final glue", () => {
        expect(new Collection(["a", "b", "c"]).join(", ")).toBe("a, b, c")
        expect(new Collection(["a", "b", "c"]).join(", ", " and ")).toBe("a, b and c")
        expect(new Collection(["a"]).join(", ", " and ")).toBe("a")
    })

    test("toJson and toPrettyJson", () => {
        const c = new Collection([1, 2, 3])
        expect(c.toJson()).toBe("[1,2,3]")
        expect(c.toPrettyJson()).toBe(JSON.stringify([1, 2, 3], null, 2))
    })

    // ── Filtering ─────────────────────────────────────────────────────────────

    test("doesntContain is the inverse of contains", () => {
        const c = new Collection([1, 2, 3])
        expect(c.doesntContain(5)).toBe(true)
        expect(c.doesntContain(2)).toBe(false)
        expect(c.doesntContain((n) => n > 10)).toBe(true)
    })

    test("every returns true only when all pass", () => {
        expect(new Collection([2, 4, 6]).every((n) => n % 2 === 0)).toBe(true)
        expect(new Collection([2, 3, 6]).every((n) => n % 2 === 0)).toBe(false)
    })

    test("skipUntil skips items until match", () => {
        expect(new Collection([1, 2, 3, 4]).skipUntil(3).all()).toEqual([3, 4])
        expect(new Collection([1, 2, 3, 4]).skipUntil((n) => n > 2).all()).toEqual([3, 4])
    })

    test("skipWhile skips while condition holds", () => {
        expect(new Collection([1, 2, 3, 4]).skipWhile((n) => n < 3).all()).toEqual([3, 4])
    })

    test("takeUntil takes items until match", () => {
        expect(new Collection([1, 2, 3, 4]).takeUntil(3).all()).toEqual([1, 2])
        expect(new Collection([1, 2, 3, 4]).takeUntil((n) => n >= 3).all()).toEqual([1, 2])
    })

    test("takeWhile takes while condition holds", () => {
        expect(new Collection([1, 2, 3, 4]).takeWhile((n) => n < 3).all()).toEqual([1, 2])
    })

    // ── where-family ──────────────────────────────────────────────────────────

    test("where with various operators", () => {
        const c = new Collection([{ n: 1 }, { n: 2 }, { n: 3 }])
        expect(c.where("n", 2).pluck("n").all()).toEqual([2])
        expect(c.where("n", ">", 1).pluck("n").all()).toEqual([2, 3])
        expect(c.where("n", ">=", 2).pluck("n").all()).toEqual([2, 3])
        expect(c.where("n", "<", 2).pluck("n").all()).toEqual([1])
        expect(c.where("n", "!=", 2).pluck("n").all()).toEqual([1, 3])
        expect(c.where("n", "<>", 2).pluck("n").all()).toEqual([1, 3])
        expect(c.where("n", "!==", 2).pluck("n").all()).toEqual([1, 3])
        expect(c.where("n", "===", 2).pluck("n").all()).toEqual([2])
    })

    test("whereStrict uses strict equality", () => {
        const c = new Collection([{ n: 1 }, { n: 2 }])
        expect(c.whereStrict("n", 1).count()).toBe(1)
        expect(c.whereStrict("n", "1").count()).toBe(0)
    })

    test("whereBetween and whereNotBetween", () => {
        const c = new Collection([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }])
        expect(c.whereBetween("n", [2, 3]).pluck("n").all()).toEqual([2, 3])
        expect(c.whereNotBetween("n", [2, 3]).pluck("n").all()).toEqual([1, 4])
    })

    test("whereIn and whereNotIn", () => {
        const c = new Collection([{ n: 1 }, { n: 2 }, { n: 3 }])
        expect(c.whereIn("n", [1, 3]).pluck("n").all()).toEqual([1, 3])
        expect(c.whereNotIn("n", [1, 3]).pluck("n").all()).toEqual([2])
    })

    test("whereInStrict and whereNotInStrict use strict comparison", () => {
        const c = new Collection([{ n: 1 }, { n: 2 }])
        expect(c.whereInStrict("n", [1]).count()).toBe(1)
        expect(c.whereInStrict("n", ["1"]).count()).toBe(0)
        expect(c.whereNotInStrict("n", [1]).pluck("n").all()).toEqual([2])
    })

    test("whereNull and whereNotNull", () => {
        const c = new Collection([{ v: 1 }, { v: null }, { v: undefined }, { v: 0 }])
        expect(c.whereNull("v").count()).toBe(2)
        expect(c.whereNotNull("v").count()).toBe(2)
    })

    test("whereInstanceOf filters by constructor", () => {
        class Foo {}
        class Bar {}
        const c = new Collection([new Foo(), new Bar(), new Foo()])
        expect(c.whereInstanceOf(Foo).count()).toBe(2)
        expect(c.whereInstanceOf(Bar).count()).toBe(1)
    })

    // ── Merge/replace ─────────────────────────────────────────────────────────

    test("merge appends items", () => {
        expect(new Collection([1, 2]).merge([3, 4]).all()).toEqual([1, 2, 3, 4])
        expect(new Collection([1]).merge(new Collection([2])).all()).toEqual([1, 2])
    })

    test("replace replaces by index, appends extras", () => {
        expect(new Collection([1, 2, 3]).replace([10, 20]).all()).toEqual([10, 20, 3])
        expect(new Collection([1, 2]).replace([10, 20, 30]).all()).toEqual([10, 20, 30])
    })

    test("toArray() is an alias for all()", () => {
        expect(new Collection([1, 2, 3]).toArray()).toEqual([1, 2, 3])
    })

    test("pipeInto() passes the collection to a class constructor", () => {
        class Wrapper<T> {
            constructor(public col: Collection<T>) {}
            doubled(): number[] {
                return (this.col.all() as number[]).map((n) => n * 2)
            }
        }
        const result = new Collection([1, 2, 3]).pipeInto(Wrapper)
        expect(result.doubled()).toEqual([2, 4, 6])
    })

    test("sortKeys() returns a new collection with same items", () => {
        const result = new Collection([3, 1, 2]).sortKeys()
        expect(result.all()).toEqual([3, 1, 2])
    })

    // ── _compareOp branch coverage ────────────────────────────────────────────

    test('where "=" is a loose-equality alias for "=="', () => {
        const c = new Collection([{ n: 1 }, { n: "1" }, { n: 2 }])
        expect(c.where("n", "=", 1).count()).toBe(2)
    })

    test('where "<=" operator', () => {
        const c = new Collection([{ n: 1 }, { n: 2 }, { n: 3 }])
        expect(c.where("n", "<=", 2).pluck("n").all()).toEqual([1, 2])
    })

    test("where with unknown operator matches nothing (default case)", () => {
        const c = new Collection([{ n: 1 }, { n: 2 }])
        expect(c.where("n", "??" as string, 1).count()).toBe(0)
    })

    // ── search strict mode ────────────────────────────────────────────────────

    test("search strict mode uses === not ==", () => {
        const c = new Collection([1, 2, "2", 3])
        expect(c.search(2, true)).toBe(1)
        expect(c.search("2", true)).toBe(2)
        expect(c.search(99, true)).toBe(false)
    })

    // ── sortBy comparator equal-value branch ──────────────────────────────────

    test("sortBy equal values hit the return-0 branch in the comparator", () => {
        const c = new Collection([{ n: 2 }, { n: 1 }, { n: 1 }])
        expect(c.sortBy("n").pluck("n").all()).toEqual([1, 1, 2])
        expect(c.sortBy("n", "desc").pluck("n").all()).toEqual([2, 1, 1])
    })

    // ── dot / undot edge cases ────────────────────────────────────────────────

    test("dot preserves array-valued properties as leaves", () => {
        const c = new Collection([{ meta: { tags: ["a", "b"], active: true } }])
        expect(c.dot().all()).toEqual([{ "meta.tags": ["a", "b"], "meta.active": true }])
    })

    test("undot reuses existing intermediate objects when multiple paths share a prefix", () => {
        const c = new Collection([{ "a.b.c": 1, "a.b.d": 2 }])
        expect(c.undot().all()).toEqual([{ a: { b: { c: 1, d: 2 } } }])
    })
})
