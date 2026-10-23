/** An error the handler skips reporting entirely while `ignore()` returns true. Rendering is unaffected. */
export interface Ignorable {
    ignore(): boolean
}
