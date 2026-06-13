export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private error: unknown = null;
  private isClosed = false;

  push(value: T): void {
    if (this.isClosed) {
      return;
    }

    const waiter = this.waiters.shift();

    if (waiter) {
      waiter.resolve({ value, done: false });
      return;
    }

    this.values.push(value);
  }

  close(): void {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ value: undefined, done: true });
    }
  }

  fail(error: unknown): void {
    if (this.isClosed) {
      return;
    }

    this.error = error;
    this.isClosed = true;

    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.next()
    };
  }

  private async next(): Promise<IteratorResult<T>> {
    if (this.values.length > 0) {
      return {
        value: this.values.shift() as T,
        done: false
      };
    }

    if (this.error) {
      throw this.error;
    }

    if (this.isClosed) {
      return {
        value: undefined,
        done: true
      };
    }

    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }
}
