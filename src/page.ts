import type { ApiResponse } from "./http/response.js"

export interface ListBody<T> {
  object: "list"
  data: T[]
  has_more: boolean
  next_cursor: string | null
}

/** One page of a cursor-paginated list. Iterate the page for its items, or `autoPaging()` for every page. */
export class Page<T> implements AsyncIterable<T>, Iterable<T> {
  constructor(
    readonly data: T[],
    readonly hasMore: boolean,
    readonly nextCursor: string | null,
    readonly lastResponse: ApiResponse,
    private readonly next: ((cursor: string) => Promise<Page<T>>) | null,
  ) {}

  static fromBody<T>(
    body: unknown,
    response: ApiResponse,
    next: ((cursor: string) => Promise<Page<T>>) | null,
  ): Page<T> {
    const list = (body ?? {}) as Partial<ListBody<T>>
    const data = Array.isArray(list.data) ? list.data : []
    return new Page<T>(
      data,
      list.has_more === true,
      typeof list.next_cursor === "string" ? list.next_cursor : null,
      response,
      next,
    )
  }

  get length(): number {
    return this.data.length
  }

  [Symbol.iterator](): Iterator<T> {
    return this.data[Symbol.iterator]()
  }

  async nextPage(): Promise<Page<T> | null> {
    if (!this.hasMore || this.nextCursor === null || this.next === null) return null
    return this.next(this.nextCursor)
  }

  /** Every item on this page and all following pages. */
  async *autoPaging(): AsyncGenerator<T, void, undefined> {
    for (const item of this.data) yield item
    let page = await this.nextPage()
    while (page !== null) {
      for (const item of page.data) yield item
      page = await page.nextPage()
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.autoPaging()
  }

  toJSON(): ListBody<T> {
    return { object: "list", data: this.data, has_more: this.hasMore, next_cursor: this.nextCursor }
  }
}
