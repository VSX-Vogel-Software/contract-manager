/**
 * Bestaetigungen fuer Aktionen, die nichts Sichtbares hinterlassen.
 *
 * Regel (siehe openspec/changes/error-feedback-consistency/design.md):
 * Sichtbare Zustandsaenderung -> keine Bestaetigung, der Zustand ist die
 * Bestaetigung. Keine sichtbare Wirkung -> gruene Meldung.
 */
import i18n from 'i18next'

import { collectResultErrors } from './resultErrors'
import { pushToast } from './toastStore'

export function notifySaved(): void {
  pushToast({ title: i18n.t('common.saved'), variant: 'success' })
}

/**
 * Fuer `onCompleted`: bestaetigt nur, wenn die Nutzdaten keinen Fehlschlag
 * melden. `onCompleted` feuert auch bei `success: false` — ohne diese Pruefung
 * stuenden Bestaetigung und Fehlermeldung gleichzeitig auf dem Schirm.
 */
export function notifySavedIfSuccessful(data: unknown): void {
  if (collectResultErrors(data).length > 0) return
  notifySaved()
}
