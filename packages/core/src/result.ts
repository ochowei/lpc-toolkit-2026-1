/**
 * A standard Result type representation for functional error handling.
 * Avoids throwing exceptions for expected failures.
 *
 * @template T - The success value type.
 * @template E - The error value type.
 *
 * @example
 * ```ts
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return err('Division by zero');
 *   return ok(a / b);
 * }
 * ```
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Creates a successful result containing the provided value.
 *
 * @template T - The type of the success value.
 * @param value - The value to wrap in a successful Result.
 * @returns An ok Result object.
 *
 * @example
 * ```ts
 * const successResult = ok(42);
 * console.log(successResult.ok); // true
 * console.log(successResult.value); // 42
 * ```
 */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/**
 * Creates a failed result containing the provided error.
 *
 * @template E - The type of the error value.
 * @param error - The error to wrap in a failed Result.
 * @returns An error Result object.
 *
 * @example
 * ```ts
 * const failureResult = err('Something went wrong');
 * console.log(failureResult.ok); // false
 * console.log(failureResult.error); // 'Something went wrong'
 * ```
 */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/**
 * Type guard that checks if a Result is successful (ok).
 *
 * @template T - The type of the success value.
 * @template E - The type of the error value.
 * @param r - The Result object to inspect.
 * @returns True if the Result is successful, false otherwise.
 */
export const isOk = <T, E>(
  r: Result<T, E>,
): r is { readonly ok: true; readonly value: T } => r.ok;

/**
 * Type guard that checks if a Result is a failure (error).
 *
 * @template T - The type of the success value.
 * @template E - The type of the error value.
 * @param r - The Result object to inspect.
 * @returns True if the Result has failed, false otherwise.
 */
export const isErr = <T, E>(
  r: Result<T, E>,
): r is { readonly ok: false; readonly error: E } => !r.ok;

/**
 * Unwraps a Result, returning the value if successful, or the provided fallback value if it failed.
 *
 * @template T - The type of the success value.
 * @template E - The type of the error value.
 * @param r - The Result object to unwrap.
 * @param fallback - The default value to return if the Result is an error.
 * @returns The success value or the fallback value.
 *
 * @example
 * ```ts
 * const success = ok(10);
 * const failure = err('error');
 *
 * console.log(unwrapOr(success, 0)); // 10
 * console.log(unwrapOr(failure, 0)); // 0
 * ```
 */
export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T =>
  r.ok ? r.value : fallback;
