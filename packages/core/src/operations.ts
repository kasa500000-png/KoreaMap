import { KitError, type KitErrorCode } from './base.js';
import type {
  CancellationSignal,
  OperationContext,
  OperationOptions,
  Scheduler,
} from './contracts.js';

/** No raw provider exception, URL, token or response body is copied into a public error. */
export function normalizeError(error: unknown): KitError {
  return error instanceof KitError ? error : new KitError('UNAVAILABLE', 'OPERATION_FAILED');
}
export type LocationErrorCode = Extract<
  KitErrorCode,
  'PERMISSION_DENIED' | 'UNAVAILABLE' | 'ABORTED' | 'TIMEOUT'
>;
export class LocationError extends KitError {
  constructor(public override readonly code: LocationErrorCode) {
    super(code, 'LOCATION_FAILED');
    this.name = 'LocationError';
  }
}
/** Cancellation is idempotent and isolates subscriber exceptions. */
export function createCancellationSource(): {
  readonly signal: CancellationSignal;
  cancel(): void;
} {
  let aborted = false;
  const listeners = new Set<() => void>();
  const signal: CancellationSignal = {
    get aborted() {
      return aborted;
    },
    subscribe(listener) {
      if (aborted) {
        listener();
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    signal,
    cancel() {
      if (aborted) return;
      aborted = true;
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          /* Other listeners must still run. */
        }
      }
      listeners.clear();
    },
  };
}
/** Default deadline 10s. Cancellation stops waiting and signals the adapter; never implies rollback. */
export function runOperation<T>(
  operation: (context: OperationContext) => T | Promise<T>,
  options: OperationOptions = {},
  scheduler: Scheduler,
): Promise<T> {
  const timeout = options.timeoutMs ?? 10000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 2147483647)
    return Promise.reject(new KitError('INVALID_ARGUMENT', 'INVALID_TIMEOUT'));
  if (options.signal?.aborted) return Promise.reject(new KitError('ABORTED', 'OPERATION_ABORTED'));
  return new Promise<T>((resolve, reject) => {
    const source = createCancellationSource();
    let settled = false;
    let off = () => {};
    let clear = () => {};
    function finish(error?: KitError, value?: T) {
      if (settled) return;
      settled = true;
      off();
      clear();
      if (error) {
        reject(error);
        source.cancel();
      } else resolve(value as T);
    }
    try {
      off =
        options.signal?.subscribe(() => finish(new KitError('ABORTED', 'OPERATION_ABORTED'))) ??
        off;
      if (settled) {
        off();
        return;
      }
      clear = scheduler.schedule(
        () => finish(new KitError('TIMEOUT', 'OPERATION_TIMEOUT')),
        timeout,
      );
      if (settled) {
        clear();
        return;
      }
      Promise.resolve(operation({ signal: source.signal })).then(
        (value) => finish(undefined, value),
        (error: unknown) => finish(normalizeError(error)),
      );
    } catch (error) {
      finish(normalizeError(error));
    }
  });
}
