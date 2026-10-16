import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useUrlTab } from './useUrlTab'

const store: Record<string, string> = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v }),
    removeItem: vi.fn((k: string) => { delete store[k] }),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  },
})

const TABS = ['items', 'invoices', 'todos'] as const

function setup(url: string, options?: Parameters<typeof useUrlTab>[3]) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  )
  return renderHook(
    () => {
      const [tab, setTab] = useUrlTab('tab', TABS, 'items', options)
      const loc = useLocation()
      return { tab, setTab, url: `${loc.pathname}${loc.search}${loc.hash}` }
    },
    { wrapper },
  )
}

describe('useUrlTab', () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k])
  })

  it('liest den Tab aus der Adresse', () => {
    const { result } = setup('/contracts/1?tab=invoices')
    expect(result.current.tab).toBe('invoices')
  })

  it('faellt bei unbekanntem Wert auf den Standard zurueck und laesst die Adresse stehen', () => {
    const { result } = setup('/contracts/1?tab=gibtsnicht')
    expect(result.current.tab).toBe('items')
    expect(result.current.url).toBe('/contracts/1?tab=gibtsnicht')
  })

  it('schreibt den Wechsel in die Adresse und laesst andere Parameter stehen', () => {
    const { result } = setup('/contracts/1?foo=1')
    act(() => result.current.setTab('todos'))
    expect(result.current.tab).toBe('todos')
    expect(result.current.url).toBe('/contracts/1?foo=1&tab=todos')
  })

  it('laesst den Standard-Tab ohne Speicher aus der Adresse weg', () => {
    const { result } = setup('/contracts/1?tab=todos')
    act(() => result.current.setTab('items'))
    expect(result.current.url).toBe('/contracts/1')
  })

  it('entfernt beim Wechsel abhaengige Unter-Tabs und das Sprungziel', () => {
    const { result } = setup('/x?tab=invoices&sub=absences#todo-3', { resets: ['sub'] })
    act(() => result.current.setTab('todos'))
    expect(result.current.url).toBe('/x?tab=todos')
  })

  it('uebernimmt alte #<tab>-Links', () => {
    const { result } = setup('/contracts/1#todos', { legacyHash: true })
    expect(result.current.tab).toBe('todos')
    expect(result.current.url).toBe('/contracts/1?tab=todos')
  })

  it('haelt ein echtes Sprungziel trotz legacyHash', () => {
    const { result } = setup('/contracts/1?tab=todos#todo-5', { legacyHash: true })
    expect(result.current.tab).toBe('todos')
    expect(result.current.url).toBe('/contracts/1?tab=todos#todo-5')
  })

  it('zeigt mit Speicher den gemerkten Tab und traegt ihn in die Adresse ein', () => {
    store['k'] = '"invoices"'
    const { result } = setup('/customers/2#comment-9', { storageKey: 'k' })
    expect(result.current.tab).toBe('invoices')
    // Sprungziel bleibt erhalten
    expect(result.current.url).toBe('/customers/2?tab=invoices#comment-9')
  })

  it('Adresse schlaegt Speicher, Wechsel wird gemerkt', () => {
    store['k'] = '"invoices"'
    const { result } = setup('/customers/2?tab=todos', { storageKey: 'k' })
    expect(result.current.tab).toBe('todos')
    act(() => result.current.setTab('items'))
    expect(store['k']).toBe('"items"')
    // mit Speicher steht auch der Standard in der Adresse
    expect(result.current.url).toBe('/customers/2?tab=items')
  })
})
