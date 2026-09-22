import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { pushToast, dismissToast, subscribeToToasts, getToasts, resetToasts } from './toastStore'

describe('toastStore', () => {
  beforeEach(() => {
    resetToasts()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a pushed toast and notifies subscribers', () => {
    const seen: number[] = []
    const unsubscribe = subscribeToToasts((toasts) => seen.push(toasts.length))

    pushToast({ title: 'Fehler', description: 'Etwas ging schief' })

    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0]).toMatchObject({ title: 'Fehler', description: 'Etwas ging schief' })
    expect(seen).toEqual([1])
    unsubscribe()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToToasts(listener)
    unsubscribe()

    pushToast({ title: 'Fehler' })

    expect(listener).not.toHaveBeenCalled()
  })

  it('removes a toast on dismiss', () => {
    pushToast({ title: 'Fehler' })
    const id = getToasts()[0].id

    dismissToast(id)

    expect(getToasts()).toHaveLength(0)
  })

  it('removes a toast automatically after its duration', () => {
    pushToast({ title: 'Fehler', durationMs: 5000 })
    expect(getToasts()).toHaveLength(1)

    vi.advanceTimersByTime(5000)

    expect(getToasts()).toHaveLength(0)
  })

  it('keeps a toast with durationMs 0 until it is dismissed', () => {
    pushToast({ title: 'Bleibt stehen', durationMs: 0 })

    vi.advanceTimersByTime(600000)

    expect(getToasts()).toHaveLength(1)
  })

  it('lets a confirmation disappear sooner than an error', () => {
    // Ein Fehler will gelesen werden, eine Bestaetigung nur wahrgenommen.
    pushToast({ title: 'Gespeichert', variant: 'success' })
    pushToast({ title: 'Fehler', variant: 'error' })

    vi.advanceTimersByTime(4000)

    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0].variant).toBe('error')
  })

  it('keeps an explicit duration even for a confirmation', () => {
    pushToast({ title: 'Gespeichert', variant: 'success', durationMs: 20000 })

    vi.advanceTimersByTime(10000)

    expect(getToasts()).toHaveLength(1)
  })

  it('collapses an identical message instead of stacking it', () => {
    // Ein fehlschlagender Request wird oft mehrfach ausgeloest (Retry, mehrere
    // Queries auf einer Seite). Derselbe Fehler soll den Bildschirm nicht fluten.
    pushToast({ title: 'Fehler', description: 'Serverfehler' })
    pushToast({ title: 'Fehler', description: 'Serverfehler' })

    expect(getToasts()).toHaveLength(1)
  })

  it('keeps at most four messages at once', () => {
    // Bei gestopptem Server klickt man sich sonst einen vollen Bildschirm.
    for (const n of [1, 2, 3, 4, 5]) {
      pushToast({ title: 'Fehler', description: `Grund ${n}` })
    }

    expect(getToasts()).toHaveLength(4)
  })

  it('drops the oldest message, never the newest', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      pushToast({ title: 'Fehler', description: `Grund ${n}` })
    }

    const descriptions = getToasts().map((t) => t.description)
    expect(descriptions).toContain('Grund 5')
    expect(descriptions).not.toContain('Grund 1')
  })

  it('forgets the timer of a dropped message', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      pushToast({ title: 'Fehler', description: `Grund ${n}` })
    }

    // Waere der Zeitgeber der verdraengten Meldung noch aktiv, wuerde er
    // spaeter ins Leere laufen und die Liste erneut anfassen.
    vi.advanceTimersByTime(12000)

    expect(getToasts()).toHaveLength(0)
  })

  it('keeps distinct messages side by side', () => {
    pushToast({ title: 'Fehler', description: 'Erster' })
    pushToast({ title: 'Fehler', description: 'Zweiter' })

    expect(getToasts()).toHaveLength(2)
  })
})
