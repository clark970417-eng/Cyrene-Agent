export interface KeyedTaskQueue {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
}

interface QueueState {
  tail: Promise<void>;
  count: number;
}

export function createKeyedTaskQueue(maxTasksPerKey = 20): KeyedTaskQueue {
  const states = new Map<string, QueueState>();

  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const state = states.get(key) ?? { tail: Promise.resolve(), count: 0 };
      if (!states.has(key)) states.set(key, state);
      if (state.count >= maxTasksPerKey) {
        return Promise.reject(new Error(`channel_queue_full:${key}`));
      }

      state.count += 1;
      const result = state.tail.then(task).finally(() => {
        state.count -= 1;
        if (state.count === 0 && states.get(key) === state) states.delete(key);
      });
      state.tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}
