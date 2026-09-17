// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (...args: any[]) => void;

export class Emitter<Events extends { [K in keyof Events]: AnyHandler }> {
  private handlers = new Map<keyof Events, Set<AnyHandler>>();

  on<E extends keyof Events>(event: E, handler: Events[E]): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) handler(...args);
  }

  clear(): void {
    this.handlers.clear();
  }
}
