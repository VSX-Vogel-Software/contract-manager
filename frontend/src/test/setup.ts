import '@testing-library/jest-dom'
import { afterEach } from 'vitest'

// jsdom kennt die Pointer-Capture-API nicht. Radix-Primitives rufen sie bei
// Pointer-Events auf (Toast-Wischgeste, Select, Slider) und werfen sonst
// mitten im Test. Minimal-Stubs, damit der Fehler nicht die Suite verrauscht.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}

// jsdom kennt kein matchMedia. Standard ist ein Desktop mit Maus (1280 px);
// Tests fuer die Mobilansicht setzen die Breite per setViewportWidth().
const viewport = { width: 1280, touch: false }

function evaluateQuery(query: string): boolean {
  return query.split(/\s+and\s+/).every((part) => {
    const min = part.match(/min-width:\s*(\d+)px/)
    if (min) return viewport.width >= Number(min[1])
    const max = part.match(/max-width:\s*(\d+)px/)
    if (max) return viewport.width <= Number(max[1])
    if (/hover:\s*none/.test(part) || /pointer:\s*coarse/.test(part)) return viewport.touch
    return false
  })
}

const listeners = new Set<() => void>()

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    get matches() {
      return evaluateQuery(query)
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    addListener: (cb: () => void) => listeners.add(cb),
    removeListener: (cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => false,
  }),
})

/** Simuliert ein anderes Geraet; benachrichtigt alle useMediaQuery-Abonnenten. */
export function setViewportWidth(width: number, touch = width < 1024) {
  viewport.width = width
  viewport.touch = touch
  listeners.forEach((cb) => cb())
}

// Nach jedem Test zurueck auf Desktop
afterEach(() => setViewportWidth(1280, false))
