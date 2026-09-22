import { describe, it, expect, beforeEach, vi } from 'vitest'
import { notifySaved, notifySavedIfSuccessful } from './notify'
import { getToasts, resetToasts } from './toastStore'

vi.mock('i18next', () => ({
  default: { t: (key: string) => key },
}))

describe('notifySaved', () => {
  beforeEach(() => {
    resetToasts()
  })

  it('shows a confirmation', () => {
    notifySaved()

    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0].variant).toBe('success')
  })
})

describe('notifySavedIfSuccessful', () => {
  beforeEach(() => {
    resetToasts()
  })

  it('confirms when the payload reports success', () => {
    notifySavedIfSuccessful({ updatePreferences: { success: true, error: null } })

    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0].variant).toBe('success')
  })

  it('stays quiet on a failed payload, which the error toast already reports', () => {
    // Sonst stuenden gruen und rot gleichzeitig auf dem Schirm.
    notifySavedIfSuccessful({ updatePreferences: { success: false, error: 'Nope' } })

    expect(getToasts()).toHaveLength(0)
  })

  it('confirms for payloads that carry no success flag', () => {
    // Mutationen, die direkt die Entitaet zurueckgeben, melden keinen Fehlschlag.
    notifySavedIfSuccessful({ createThing: { id: '1' } })

    expect(getToasts()).toHaveLength(1)
  })

  it('survives an empty response', () => {
    notifySavedIfSuccessful(undefined)

    expect(getToasts()).toHaveLength(1)
  })
})
