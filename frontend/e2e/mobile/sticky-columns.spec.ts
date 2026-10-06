import { test, expect } from '@playwright/test'
import { routes } from './routes'
import { screenshot, settle } from './layout-helpers'

test.describe.configure({ timeout: 90_000 })

/**
 * Tabellen mit fixierter Bezeichner-Spalte (index.css: table-sticky-first /
 * table-sticky-first-two). Fuer jede Tabelle, die im aktuellen Format
 * tatsaechlich waagerecht scrollt: nach rechts scrollen und pruefen, dass die
 * Spalte am linken Rand stehen bleibt, deckend ist und nicht mehr als 60 %
 * der Breite belegt.
 */
for (const route of routes) {
  test(`fixierte Spalte: ${route.name}`, async ({ page }, testInfo) => {
    await page.goto(route.path)
    await settle(page)

    const results = await page.evaluate(async () => {
      const out: { table: string; drift: number; bg: string; ratio: number }[] = []
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>('main table.table-sticky-first, main table.table-sticky-first-two'))
      for (const [index, table] of tables.entries()) {
        if (table.offsetParent === null) continue
        let c = table.parentElement
        while (c && c.tagName !== 'MAIN' && getComputedStyle(c).overflowX === 'visible') c = c.parentElement
        if (!c || c.tagName === 'MAIN' || c.scrollWidth <= c.clientWidth + 1) continue
        const two = table.classList.contains('table-sticky-first-two')
        const cell = table.querySelector<HTMLElement>(`tbody > tr > td:nth-child(${two ? 2 : 1})`)
        if (!cell) continue
        const expectedLeft = c.getBoundingClientRect().left + (two ? (table.querySelector<HTMLElement>('tbody > tr > td:first-child')?.getBoundingClientRect().width ?? 0) : 0)
        c.scrollLeft = Math.min(240, c.scrollWidth - c.clientWidth)
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        const r = cell.getBoundingClientRect()
        out.push({
          table: `#${index} ` + (table.closest('[data-testid]')?.getAttribute('data-testid') ?? '') + ' ' + (table.querySelector('thead th:nth-child(' + (two ? 2 : 1) + ')')?.textContent ?? '').trim().slice(0, 30),
          drift: Math.round(r.left - expectedLeft),
          bg: getComputedStyle(cell).backgroundColor,
          ratio: r.width / c.clientWidth,
        })
      }
      return out
    })

    test.skip(results.length === 0, 'keine scrollende Tabelle mit fixierter Spalte in diesem Format')
    await screenshot(page, testInfo, `sticky-${route.name}`)
    for (const r of results) {
      expect(Math.abs(r.drift), `${r.table}: Spalte wandert mit`).toBeLessThanOrEqual(2)
      expect(r.bg, `${r.table}: Spalte ist durchsichtig`).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
      expect(r.ratio, `${r.table}: Spalte belegt ${Math.round(r.ratio * 100)} %`).toBeLessThanOrEqual(0.6)
    }
  })
}
