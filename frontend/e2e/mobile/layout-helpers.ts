import { expect, type Page, type TestInfo } from '@playwright/test'

/** Breite, ab der die feste Seitenleiste erscheint (Tailwind `lg`). */
export const DESKTOP_MIN_WIDTH = 1024

export interface OverflowReport {
  docScrollWidth: number
  mainOverflow: number
  viewportWidth: number
  offenders: string[]
}

/**
 * Sucht Elemente, die rechts oder links aus dem Viewport ragen, ohne in einem
 * eigenen Container mit overflow-x != visible zu liegen. `main`, `body` und
 * `html` zaehlen nicht als solcher Container - sonst waere alles freigesprochen.
 */
export async function measureOverflow(page: Page): Promise<OverflowReport> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const main = document.querySelector('main')

    const describe = (el: Element): string => {
      const parts: string[] = []
      let cur: Element | null = el
      for (let i = 0; cur && i < 4; i++) {
        let s = cur.tagName.toLowerCase()
        const testId = cur.getAttribute('data-testid')
        if (testId) {
          parts.unshift(`${s}[data-testid="${testId}"]`)
          break
        }
        if (cur.id) s += `#${cur.id}`
        const cls = (cur.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 4)
        if (cls.length) s += '.' + cls.join('.')
        parts.unshift(s)
        cur = cur.parentElement
      }
      const r = el.getBoundingClientRect()
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
      return `${parts.join(' > ')} [${Math.round(r.left)}..${Math.round(r.right)}] "${text}"`
    }

    const isClippedByAncestor = (el: Element): boolean => {
      let a = el.parentElement
      while (a && a !== document.body && a !== document.documentElement) {
        if (a.tagName === 'MAIN') return false
        if (getComputedStyle(a).overflowX !== 'visible') return true
        a = a.parentElement
      }
      return false
    }

    const offending = new Set<Element>()
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right <= vw + 1 && r.left >= -1) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue
      // sr-only und aehnliches
      if (r.width <= 1 && r.height <= 1) continue
      // Zugeklappte fixe Elemente komplett ausserhalb (Schubladen)
      if (cs.position === 'fixed' && (r.left >= vw || r.right <= 0)) continue
      if (isClippedByAncestor(el)) continue
      offending.add(el)
    }
    // Nur die aeussersten melden
    const offenders = Array.from(offending)
      .filter((el) => !(el.parentElement && offending.has(el.parentElement)))
      .map(describe)

    // Abgeschnittener Text: Element-Raender sehen harmlos aus, aber ein
    // Textstueck (lange E-Mail-Adresse) ragt ueber einen Vorfahren mit
    // overflow:hidden hinaus und ist nicht mehr lesbar. Gewolltes Kuerzen
    // (text-overflow: ellipsis / truncate) und Scroll-Container zaehlen nicht.
    const clippedText = new Set<Element>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim()
      const parent = node.parentElement
      if (!text || !parent || clippedText.has(parent)) continue
      const pcs = getComputedStyle(parent)
      if (pcs.visibility === 'hidden' || pcs.textOverflow === 'ellipsis') continue
      let clip: Element | null = parent
      while (clip && clip !== document.body) {
        const cs = getComputedStyle(clip)
        if (cs.overflowX !== 'visible') break
        clip = clip.parentElement
      }
      if (!clip || clip === document.body) continue
      const ccs = getComputedStyle(clip)
      // Scroll-Container: Inhalt ist erreichbar; ellipsis: gewollt gekuerzt
      if (ccs.overflowX === 'auto' || ccs.overflowX === 'scroll' || ccs.textOverflow === 'ellipsis') continue
      const cr = clip.getBoundingClientRect()
      if (cr.width <= 1 || cr.height <= 1) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const r of Array.from(range.getClientRects())) {
        if (r.width > 0 && r.bottom > cr.top && r.top < cr.bottom && r.right > cr.right + 1) {
          clippedText.add(parent)
          break
        }
      }
    }
    for (const el of clippedText) offenders.push(`abgeschnittener Text: ${describe(el)}`)

    return {
      docScrollWidth: document.documentElement.scrollWidth,
      mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
      viewportWidth: vw,
      offenders,
    }
  })
}

/**
 * Wartet, bis die Seite wirklich geladen ist. Ein Foto vom Ladebildschirm
 * waere wertlos, aber gruen - ein leerer Bildschirm laeuft nie ueber. Deshalb
 * schlaegt settle fehl, wenn der Inhalt nicht erscheint, statt still
 * weiterzumachen.
 */
export async function settle(page: Page, { requireMain = true } = {}) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  // Ladebildschirm der Anmeldepruefung (ProtectedRoute) hat noch kein <main>
  if (requireMain) {
    await expect(page.locator('main')).toBeVisible({ timeout: 45_000 })
  }
  await page
    .locator('main .animate-spin')
    .first()
    .waitFor({ state: 'hidden', timeout: 20_000 })
    .catch(() => {})
  // Manche Seiten zeigen statt eines Spinners nur einen Ladetext
  await expect(page.getByText(/^(Laden|Loading|Lädt|Wird geladen)\b/).first()).toBeHidden({ timeout: 30_000 })
  await page.waitForTimeout(300)
}

export async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  // Ausserhalb von test-results, das Playwright bei jedem Lauf leert
  const dir = process.env.E2E_SCREENS ?? 'mobile-screens'
  const file = `${dir}/${testInfo.project.name}/${name}.png`
  await page.screenshot({ path: file })
  await testInfo.attach(name, { path: file, contentType: 'image/png' })
}

export async function expectNoOverflow(page: Page) {
  const report = await measureOverflow(page)
  const summary = [
    `Viewport ${report.viewportWidth}px, Dokument ${report.docScrollWidth}px, main ueberlaeuft um ${report.mainOverflow}px`,
    ...report.offenders.slice(0, 15),
  ].join('\n  ')
  expect(
    report.docScrollWidth <= report.viewportWidth + 1 && report.mainOverflow <= 1 && report.offenders.length === 0,
    summary
  ).toBe(true)
}
