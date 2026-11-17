// Firestore can keep retrying after a mobile connection drops. Timing out the
// caller does not cancel a write; its later server acknowledgement is reconciled
// by the normal listener. Local pending rows must remain until that happens.
export function withProgressDeadline<T>(operation: Promise<T>, milliseconds = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('El servidor todavía no confirmó el respaldo. Tus lecturas siguen guardadas en este dispositivo.')), milliseconds);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}
