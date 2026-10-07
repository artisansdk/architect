/** An error that knows how to render itself, replacing the handler's default rethrow. */
export interface Renderable {
    render(): unknown
}
