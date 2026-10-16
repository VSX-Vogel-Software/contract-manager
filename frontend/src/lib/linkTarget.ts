import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Sprungziele: Ein Element mit `id` ist per `#<id>` verlinkbar. Beim Oeffnen
 * eines solchen Links rollt die Seite das Element in die Mitte und hebt es
 * kurz hervor. Die Daten kommen meist erst nach dem ersten Rendern (Abfrage,
 * nachgeladener Tab) - deshalb wird eine Weile auf das Element gewartet.
 */

export const LINK_TARGET_WAIT_MS = 10_000
const FLASH_CLASS = 'link-target-flash'

/** Kennung fuer ein Sprungziel, z.B. `linkTargetId('comment', 12)` -> `comment-12`. */
export function linkTargetId(kind: string, id: string | number): string {
  return `${kind}-${id}`
}

/** Sprungziel aus der aktuellen Adresse, ohne `#`. */
export function currentLinkTarget(hash: string): string | null {
  if (!hash || hash.length < 2) return null
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return null
  }
}

/**
 * Absolute Adresse der aktuellen Ansicht (oder von `path`, z.B.
 * `/contracts/4?tab=todos`), optional mit Sprungziel.
 */
export function buildLinkUrl(targetId?: string, path?: string): string {
  const { origin, pathname, search } = window.location
  return `${origin}${path ?? pathname + search}${targetId ? `#${encodeURIComponent(targetId)}` : ''}`
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function revealElement(el: HTMLElement) {
  el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  // Neu starten, falls das Element schon leuchtet (zweimal derselbe Link)
  el.classList.remove(FLASH_CLASS)
  void el.offsetWidth
  el.classList.add(FLASH_CLASS)
  el.addEventListener('animationend', () => el.classList.remove(FLASH_CLASS), { once: true })
  // Laedt darueber noch etwas nach (zweite Abfrage, Bilder), rutscht das Ziel
  // aus dem Bild - dann einmal nachrollen.
  setTimeout(() => {
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView({ block: 'center' })
  }, 700)
}

function findTarget(id: string): HTMLElement | null {
  // Listen rendern mobil Karten und darueber die Tabelle - beide koennen die
  // id tragen, sichtbar ist nur eine. Unsichtbar (inaktiver Tab, eingeklappt,
  // falsche Breite): weiter warten.
  const candidates = document.querySelectorAll<HTMLElement>(`[id="${CSS.escape(id)}"]`)
  for (const el of candidates) {
    if (el.getClientRects().length > 0) return el
  }
  return null
}

/**
 * Einmal im Layout einhaengen: reagiert auf jeden Seitenwechsel mit `#...`.
 */
export function useLinkTarget() {
  const location = useLocation()

  useEffect(() => {
    const id = currentLinkTarget(location.hash)
    if (!id) return

    let frame = 0
    let observer: MutationObserver | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const stop = () => {
      observer?.disconnect()
      observer = null
      if (timer) clearTimeout(timer)
      cancelAnimationFrame(frame)
    }

    const attempt = () => {
      const el = findTarget(id)
      if (!el) return false
      stop()
      // Einen Frame warten, bis das Layout um das Element herum steht
      frame = requestAnimationFrame(() => revealElement(el))
      return true
    }

    if (attempt()) return stop

    observer = new MutationObserver(() => {
      attempt()
    })
    // Dialoge haengen am body, nicht in <main> - daher ganzer Baum
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id', 'class', 'hidden', 'data-state'],
    })
    timer = setTimeout(stop, LINK_TARGET_WAIT_MS)
    return stop
    // location.key: derselbe Link nochmal angeklickt -> erneut zeigen
  }, [location.key, location.hash])
}
