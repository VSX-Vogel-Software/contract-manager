import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Die Sperre "laedt gerade neu" lebt im Modul - je Test frisch laden
async function loadBoundary() {
  vi.resetModules()
  return (await import('./ChunkErrorBoundary')).ChunkErrorBoundary
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function Broken({ message }: { message: string }): JSX.Element {
  throw new Error(message)
}

const originalLocation = window.location
let reload: ReturnType<typeof vi.fn>

beforeEach(() => {
  reload = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, reload },
  })
  sessionStorage.clear()
  // React meldet gefangene Fehler zusaetzlich auf der Konsole
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  vi.restoreAllMocks()
})

describe('ChunkErrorBoundary', () => {
  it('laedt bei einem Chunk-Ladefehler einmal neu', async () => {
    const ChunkErrorBoundary = await loadBoundary()
    render(
      <ChunkErrorBoundary>
        <Broken message="Failed to fetch dynamically imported module: /assets/Old-abc.js" />
      </ChunkErrorBoundary>
    )
    expect(reload).toHaveBeenCalledTimes(1)
    // waehrend des Neuladens kein Fehlerhinweis
    expect(screen.queryByTestId('chunk-error')).toBeNull()
  })

  it('zeigt einen Hinweis, wenn gerade erst neu geladen wurde', async () => {
    const ChunkErrorBoundary = await loadBoundary()
    sessionStorage.setItem('chunkReloadAt', String(Date.now()))
    render(
      <ChunkErrorBoundary>
        <Broken message="Failed to fetch dynamically imported module: /assets/Old-abc.js" />
      </ChunkErrorBoundary>
    )
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByTestId('chunk-error')).toHaveTextContent('updateBanner.chunkError')
  })

  it('reicht andere Fehler weiter', async () => {
    const ChunkErrorBoundary = await loadBoundary()
    expect(() =>
      render(
        <ChunkErrorBoundary>
          <Broken message="kaputt" />
        </ChunkErrorBoundary>
      )
    ).toThrow('kaputt')
    expect(reload).not.toHaveBeenCalled()
  })
})
