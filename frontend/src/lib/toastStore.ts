/**
 * Toast-Speicher ausserhalb von React.
 *
 * Bewusst von der Komponente getrennt: Fehler entstehen auch dort, wo es keinen
 * React-Kontext gibt — im Apollo-Link, in einer Promise-Rejection, in einem
 * Event-Handler. Die koennen hier alle hineinschreiben; die Komponente
 * abonniert nur.
 */

export type ToastVariant = 'error' | 'success' | 'info'

export interface ToastInput {
  title: string
  description?: string
  variant?: ToastVariant
  /**
   * 0 = bleibt stehen, bis der Benutzer schliesst. Ohne Angabe: 12 Sekunden,
   * bei Bestaetigungen 4 - ein Fehler will gelesen werden, eine Bestaetigung
   * nur wahrgenommen.
   */
  durationMs?: number
}

export interface Toast extends ToastInput {
  id: string
  variant: ToastVariant
}

const DEFAULT_DURATION_MS = 12000
const DEFAULT_SUCCESS_DURATION_MS = 4000

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
const listeners = new Set<Listener>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let counter = 0

function emit() {
  const snapshot = [...toasts]
  listeners.forEach((listener) => listener(snapshot))
}

export function getToasts(): Toast[] {
  return toasts
}

export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function pushToast(input: ToastInput): string {
  // Derselbe Fehler kann mehrfach eintreffen (Retry, mehrere Queries pro Seite).
  // Dann den bestehenden Toast stehen lassen, statt zu stapeln.
  const duplicate = toasts.find(
    (t) => t.title === input.title && t.description === input.description
  )
  if (duplicate) return duplicate.id

  const id = `toast-${++counter}`
  const toast: Toast = { ...input, id, variant: input.variant ?? 'error' }
  toasts = [...toasts, toast]

  const duration =
    input.durationMs ??
    (toast.variant === 'success' ? DEFAULT_SUCCESS_DURATION_MS : DEFAULT_DURATION_MS)
  if (duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), duration)
    )
  }

  emit()
  return id
}

export function dismissToast(id: string) {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** Nur fuer Tests. */
export function resetToasts() {
  timers.forEach((timer) => clearTimeout(timer))
  timers.clear()
  toasts = []
  counter = 0
  listeners.clear()
}
