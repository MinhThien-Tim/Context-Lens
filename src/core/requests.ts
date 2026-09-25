import { checkAbort, EngineError } from './errors';

interface Flight<T> { controller: AbortController; promise: Promise<T>; users: number }
/** Each subscriber owns its cancellation; the work stops when the final subscriber leaves. */
export class SharedRequests<T> {
  private flights = new Map<string, Flight<T>>();
  has(key: string): boolean { return this.flights.has(key); }
  run(key: string, work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    checkAbort(signal);
    let flight = this.flights.get(key);
    if (!flight) {
      const controller = new AbortController();
      flight = { controller, users: 0, promise: Promise.resolve().then(() => work(controller.signal)) };
      this.flights.set(key, flight);
      const current = flight;
      void flight.promise.finally(() => { if (this.flights.get(key) === current) this.flights.delete(key); }).catch(() => {});
    }
    const current = flight;
    current.users++;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return false;
        done = true; signal?.removeEventListener('abort', abort);
        if (--current.users === 0) {
          current.controller.abort();
          if (this.flights.get(key) === current) this.flights.delete(key);
        }
        return true;
      };
      const abort = () => { if (finish()) reject(new EngineError('ABORTED')); };
      signal?.addEventListener('abort', abort, { once: true });
      current.promise.then(value => { if (finish()) resolve(value); }, error => { if (finish()) reject(error); });
    });
  }
}
