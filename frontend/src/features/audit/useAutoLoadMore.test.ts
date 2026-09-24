import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useAutoLoadMore, AUTO_LOAD_MAX_ROUNDS } from './useAutoLoadMore'

/** Steuert von aussen, ob das Listenende im Blick ist. */
let sichtbarMelden: ((sichtbar: boolean) => void) | null = null

class TestObserver {
  constructor(private rueckruf: IntersectionObserverCallback) {
    sichtbarMelden = (sichtbar) =>
      this.rueckruf(
        [{ isIntersecting: sichtbar } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      )
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return []
  }
  root = null
  rootMargin = ''
  thresholds = []
}

function endeInSicht(sichtbar = true) {
  act(() => {
    sichtbarMelden?.(sichtbar)
  })
}

describe('useAutoLoadMore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', TestObserver)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    sichtbarMelden = null
  })

  function aufbauen(enabled = true, onLoadMore = vi.fn()) {
    const ergebnis = renderHook((props: { enabled: boolean }) =>
      useAutoLoadMore({ enabled: props.enabled, onLoadMore, delayMs: 2000 })
    , { initialProps: { enabled } })
    // Das Listenende haengt im echten Einsatz am DOM; hier genuegt ein
    // Element, damit der Beobachter aufgesetzt wird.
    act(() => {
      ergebnis.result.current.sentinelRef(document.createElement('div'))
    })
    return { ...ergebnis, onLoadMore }
  }

  it('laedt nach der Wartezeit von selbst nach, sobald das Ende im Blick ist', () => {
    const { result, onLoadMore } = aufbauen()

    endeInSicht()
    expect(result.current.status).toBe('armed')
    expect(onLoadMore).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(2000))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('laedt nichts, solange das Ende ausser Sicht ist', () => {
    const { result, onLoadMore } = aufbauen()

    act(() => vi.advanceTimersByTime(10000))
    expect(onLoadMore).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('bricht die Wartezeit ab, wenn hochgescrollt wird', () => {
    const { onLoadMore } = aufbauen()

    endeInSicht()
    act(() => vi.advanceTimersByTime(1500))
    endeInSicht(false)
    act(() => vi.advanceTimersByTime(5000))

    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('haelt auf Wunsch an und laedt dann nichts mehr', () => {
    const { result, onLoadMore } = aufbauen()

    endeInSicht()
    act(() => result.current.pause())

    expect(result.current.status).toBe('paused')
    act(() => vi.advanceTimersByTime(10000))
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('nimmt die Automatik wieder auf', () => {
    const { result, onLoadMore } = aufbauen()

    endeInSicht()
    act(() => result.current.pause())
    act(() => result.current.resume())

    expect(result.current.status).toBe('armed')
    act(() => vi.advanceTimersByTime(2000))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('stoppt nach der Rundengrenze von selbst', () => {
    const { result, onLoadMore } = aufbauen()

    endeInSicht()
    for (let i = 0; i < AUTO_LOAD_MAX_ROUNDS + 3; i++) {
      act(() => vi.advanceTimersByTime(2000))
    }

    expect(onLoadMore).toHaveBeenCalledTimes(AUTO_LOAD_MAX_ROUNDS)
    expect(result.current.status).toBe('paused')
  })

  it('zaehlt nach dem Wiederaufnehmen erneut bis zur Grenze', () => {
    const { result, onLoadMore } = aufbauen()

    endeInSicht()
    for (let i = 0; i < AUTO_LOAD_MAX_ROUNDS; i++) {
      act(() => vi.advanceTimersByTime(2000))
    }
    expect(result.current.status).toBe('paused')

    act(() => result.current.resume())
    act(() => vi.advanceTimersByTime(2000))

    expect(onLoadMore).toHaveBeenCalledTimes(AUTO_LOAD_MAX_ROUNDS + 1)
  })

  it('laedt nichts, wenn nichts mehr da ist', () => {
    const { result, onLoadMore } = aufbauen(false)

    endeInSicht()
    act(() => vi.advanceTimersByTime(10000))

    expect(onLoadMore).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })
})
