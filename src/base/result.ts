export type Result<T, E = Error> = Success<T> | Failure<E>;

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Failure<E> {
  readonly ok: false;
  readonly error: E;
}

export const Result = {
  ok<T>(value: T): Success<T> {
    return { ok: true, value };
  },

  err<E>(error: E): Failure<E> {
    return { ok: false, error };
  },

  isOk<T, E>(result: Result<T, E>): result is Success<T> {
    return result.ok;
  },

  isErr<T, E>(result: Result<T, E>): result is Failure<E> {
    return !result.ok;
  },

  map<T, E, U>(result: Result<T, E>, mapper: (value: T) => U): Result<U, E> {
    if (result.ok) {
      return Result.ok(mapper(result.value));
    }

    return result;
  },

  mapError<T, E, F>(
    result: Result<T, E>,
    mapper: (error: E) => F,
  ): Result<T, F> {
    if (!result.ok) {
      return Result.err(mapper(result.error));
    }

    return result;
  },

  unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
    return result.ok ? result.value : fallback;
  },
};

export const ok = Result.ok;
export const err = Result.err;
