/**
 * Fehler, die als Nutzdaten zurueckkommen.
 *
 * Der Grossteil der Mutationen liefert `OperationResult`, `DeleteResult` oder
 * einen der spezialisierten `*Result`-Typen — also eine technisch erfolgreiche
 * Antwort mit `success: false` darin. Der errorLink sieht die nie, weil auf
 * GraphQL-Ebene nichts schiefging. Dieselbe Regel wie dort: was niemand
 * behandelt, landet im Toast; wer es inline anzeigt, setzt
 * `context: { suppressErrorToast: true }`.
 */
import i18n from 'i18next'
import { pushToast } from './toastStore'

interface HandleMutationResultParams {
  data?: Record<string, unknown> | null
  operation?: { operationName?: string; getContext?: () => Record<string, unknown> }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Sammelt die Fehlergruende aller fehlgeschlagenen Nutzdaten-Felder.
 * Ein Feld ohne `success`-Flag wird ignoriert — Mutationen, die direkt die
 * Entitaet zurueckgeben, sagen ueber Erfolg nichts aus.
 */
export function collectResultErrors(data: unknown): string[] {
  if (!isRecord(data)) return []

  const reasons: string[] = []
  for (const payload of Object.values(data)) {
    if (!isRecord(payload)) continue
    if (payload.success !== false) continue

    const list = payload.errors
    if (Array.isArray(list) && list.length > 0) {
      reasons.push(...list.filter((e): e is string => typeof e === 'string'))
      continue
    }

    reasons.push(typeof payload.error === 'string' ? payload.error : '')
  }
  return reasons
}

export function handleMutationResult({ data, operation }: HandleMutationResultParams): void {
  const context = operation?.getContext?.() ?? {}
  if (context.suppressErrorToast) return

  const reasons = collectResultErrors(data).filter((r) => r !== '')
  const failed = collectResultErrors(data).length > 0
  if (!failed) return

  pushToast({
    title: i18n.t('common.error'),
    description: reasons.length > 0 ? reasons.join(' · ') : undefined,
    variant: 'error',
  })
}
