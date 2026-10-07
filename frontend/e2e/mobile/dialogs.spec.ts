import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { DESKTOP_MIN_WIDTH, expectNoOverflow, screenshot, settle } from './layout-helpers'

// Durchlauf ueber alle gefahrlos erreichbaren Dialoge, Sheets und Popover.
// Jeder Fall: oeffnen, Foto, Lage im Viewport, kein Ueberlauf, Footer
// erreichbar, Schliessen-X gross genug - und dann OHNE Speichern per Escape
// bzw. X schliessen. Nie Absenden/Bestaetigen/Loeschen klicken; welche Knoepfe
// gefaehrlich sind, steht in der Dialog-Bestandsaufnahme.
//
// IDs kommen aus den Demo-Daten (seed_demo_data). Wer gegen andere Daten
// laeuft, setzt sie per Umgebungsvariable.

const env = (name: string, fallback: string) => process.env[name] ?? fallback
const ids = {
  draftContract: env('E2E_DLG_DRAFT_CONTRACT', '3'),
  activeContract: env('E2E_DLG_ACTIVE_CONTRACT', '4'),
  todoContract: env('E2E_DLG_TODO_CONTRACT', '5'),
  cancelledContract: env('E2E_DLG_CANCELLED_CONTRACT', '12'),
  customer: env('E2E_DLG_CUSTOMER', '6'),
  customerSearch: env('E2E_DLG_CUSTOMER_SEARCH', 'an'),
  counterparty: env('E2E_DLG_COUNTERPARTY', '2d1a2bd0-2fc7-474b-98ce-f6dd7838119f'),
  incomingInvoice: env('E2E_DLG_INCOMING_INVOICE', '3829d726-5198-44c4-809d-71b2cc1f6530'),
  // Nicht ID 1 - das ist das Fixture der Mahnungs-Spec
  dunInvoice: env('E2E_DLG_DUN_INVOICE', '9'),
  voidInvoice: env('E2E_DLG_VOID_INVOICE', '5'),
  offer: env('E2E_DLG_OFFER', '1'),
  offerWithPdf: env('E2E_DLG_OFFER_WITH_PDF', '11'),
  importedNoCustomer: env('E2E_DLG_IMPORTED_NO_CUSTOMER', '1'),
  importedNoContract: env('E2E_DLG_IMPORTED_NO_CONTRACT', '2'),
  // Monatsknopf mit finalisiertem Fehlzeitenbericht (en-US, laufendes Jahr ohne Jahreszahl)
  absenceMonth: env('E2E_DLG_ABSENCE_MONTH', 'Aug'),
}

const MD = 768
const isTouch = (testInfo: TestInfo) => testInfo.project.name !== 'desktop'

type Kind = 'dialog' | 'sheet' | 'popover'

interface DialogCase {
  /** Kurzname fuer Testname und Foto (dlg-<name>) */
  name: string
  path: string
  kind?: Kind
  /** Grund zum Ueberspringen fuer dieses Format, sonst null */
  skip?: (page: Page, testInfo: TestInfo) => string | null
  /** Vor dem Laden der Seite (localStorage, Netz-Mocks) */
  before?: (page: Page) => Promise<void>
  /** Oeffnet den Dialog und liefert sein Element */
  open: (page: Page) => Promise<Locator>
  /** Letzter Aktionsknopf; Vorgabe: letzter sichtbarer Knopf ausser dem X */
  footer?: (dlg: Locator) => Locator
  /** Schliessen-X; Vorgabe: Radix-X mit sr-only-Text */
  closeButton?: (dlg: Locator, page: Page) => Locator
  /** Zusaetzliche Ansicht im offenen Dialog, z. B. eine Combobox aufklappen */
  extra?: (page: Page, dlg: Locator, testInfo: TestInfo) => Promise<void>
}

/** Der oberste offene Radix-Dialog, ohne Popover-Inhalte (die haben auch role=dialog). */
function topDialog(page: Page): Locator {
  return page.locator('[role="dialog"][data-state="open"]:not([data-radix-popper-content-wrapper] > *)').last()
}

/** Der zuletzt geoeffnete Popover-Inhalt. */
function topPopover(page: Page): Locator {
  return page.locator('[data-radix-popper-content-wrapper]').last()
}

async function visibleFirst(page: Page, selector: string): Promise<Locator> {
  const loc = page.locator(selector).locator('visible=true').first()
  await expect(loc).toBeVisible({ timeout: 30_000 })
  return loc
}

/** Wie in paket-b: wartet zusaetzlich auf Ueberschrift und das Ende der Ladeanzeigen. */
async function ready(page: Page) {
  await expect(page.locator('main')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('main h1, main h2').first()).toBeVisible({ timeout: 60_000 })
  await settle(page)
  await expect(page.getByText(/^(Loading|Laden)\.\.\.$/)).toHaveCount(0, { timeout: 30_000 })
}

/** Endliche Animationen (Einblenden, Einfahren) abwarten, dann Ladekreisel im Dialog. */
async function waitForAnimations(el: Locator) {
  await el.evaluate((node) =>
    Promise.all(
      node
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined))
    )
  )
  await el
    .locator('.animate-spin')
    .first()
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {})
  await el.page().waitForTimeout(250)
}

async function expectInViewport(page: Page, el: Locator, label: string) {
  const box = await el.boundingBox()
  expect(box, `${label}: keine BoundingBox`).not.toBeNull()
  const vp = page.viewportSize()!
  const msg = `${label}: ${JSON.stringify(box)} im Viewport ${vp.width}x${vp.height}`
  expect(box!.x, msg).toBeGreaterThanOrEqual(-1)
  expect(box!.y, msg).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width, msg).toBeLessThanOrEqual(vp.width + 1)
  expect(box!.y + box!.height, msg).toBeLessThanOrEqual(vp.height + 1)
}

/**
 * Scrollt alle scrollbaren Bereiche im Dialog ganz nach unten. Meldet
 * Elemente, deren Inhalt hoeher ist als sie selbst, die aber nicht scrollen
 * (Inhalt waere abgeschnitten).
 */
async function scrollDialogToEnd(dlg: Locator): Promise<string[]> {
  return dlg.evaluate((root) => {
    const clipped: string[] = []
    const all = [root, ...Array.from(root.querySelectorAll('*'))] as HTMLElement[]
    for (const el of all) {
      if (el.scrollHeight <= el.clientHeight + 1) continue
      const cs = getComputedStyle(el)
      if (/(auto|scroll)/.test(cs.overflowY)) {
        el.scrollTop = el.scrollHeight
      } else if (cs.overflowY === 'hidden' && el.clientHeight > 40 && cs.display !== 'inline') {
        // Kleine Elemente mit overflow-hidden (truncate, Badges) sind Absicht
        const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 5).join('.')
        clipped.push(`${el.tagName.toLowerCase()}.${cls} (${el.scrollHeight}>${el.clientHeight})`)
      }
    }
    return clipped
  })
}

/**
 * Sucht Elemente, die seitlich aus dem Dialog ragen und dort vom Dialog
 * abgeschnitten werden (gequetschte Spalten). Eigene waagerechte
 * Scroll-Container (Tabellen) sind erlaubt.
 */
async function findHorizontallyClipped(dlg: Locator): Promise<string[]> {
  return dlg.evaluate((root) => {
    const rr = root.getBoundingClientRect()
    const inScroller = (el: Element) => {
      for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(a).overflowX)) return true
      }
      return false
    }
    const hits = new Set<Element>()
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect()
      if (r.width <= 1 || r.height <= 1) continue
      if (r.right <= rr.right + 1 && r.left >= rr.left - 1) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.position === 'fixed') continue
      if (inScroller(el)) continue
      hits.add(el)
    }
    return Array.from(hits)
      .filter((el) => !(el.parentElement && hits.has(el.parentElement)))
      .slice(0, 10)
      .map((el) => {
        const r = el.getBoundingClientRect()
        const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 4).join('.')
        const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)
        return `${el.tagName.toLowerCase()}.${cls} [${Math.round(r.left)}..${Math.round(r.right)}] Dialog [${Math.round(rr.left)}..${Math.round(rr.right)}] "${text}"`
      })
  })
}

const defaultFooter = (dlg: Locator) =>
  dlg.locator('xpath=.//button[not(span[contains(@class,"sr-only")])][not(@aria-label="Close")]').locator('visible=true').last()

/** Reine Info-Dialoge ohne Knopf: dann muss das letzte Textelement erreichbar sein. */
const lastContent = (dlg: Locator) =>
  dlg.locator('xpath=(.//*[not(*)][normalize-space()][not(contains(@class,"sr-only"))][not(ancestor-or-self::button)])[last()]')

// Das Radix-X ist direktes Kind des Dialogs und traegt einen sr-only-Text
const defaultClose = (dlg: Locator) => dlg.locator('xpath=./button[span[contains(@class,"sr-only")]]').first()

async function runCase(page: Page, testInfo: TestInfo, c: DialogCase) {
  const kind = c.kind ?? 'dialog'
  page.on('dialog', (d) => d.dismiss())
  if (c.before) await c.before(page)
  await page.goto(c.path)
  await ready(page)

  const dlg = await c.open(page)
  await expect(dlg).toBeVisible({ timeout: 30_000 })
  await waitForAnimations(dlg)
  await screenshot(page, testInfo, `dlg-${c.name}`)

  await expectInViewport(page, dlg, c.name)
  await expectNoOverflow(page)

  if (kind !== 'popover') {
    // Schliessen-X auf Touch mindestens 40x40
    const close = (c.closeButton ?? defaultClose)(dlg, page)
    await expect(close, 'Schliessen-X fehlt').toBeVisible()
    if (isTouch(testInfo)) {
      const box = (await close.boundingBox())!
      expect(box.width, `X-Breite ${box.width}`).toBeGreaterThanOrEqual(40)
      expect(box.height, `X-Hoehe ${box.height}`).toBeGreaterThanOrEqual(40)
    }

    if (c.extra) await c.extra(page, dlg, testInfo)

    const sideways = await findHorizontallyClipped(dlg)
    expect(sideways, `Inhalt ragt seitlich aus dem Dialog:\n  ${sideways.join('\n  ')}`).toEqual([])

    // Ganz nach unten scrollen; der letzte Aktionsknopf muss sichtbar werden
    const clipped = await scrollDialogToEnd(dlg)
    expect(clipped, `Inhalt abgeschnitten, nicht scrollbar:\n  ${clipped.join('\n  ')}`).toEqual([])
    let footer = (c.footer ?? defaultFooter)(dlg)
    if (!c.footer && (await footer.count()) === 0) footer = lastContent(dlg)
    await expect(footer, 'kein Aktionsknopf gefunden').toHaveCount(1)
    await expect(footer, 'Footer-Knopf nach dem Scrollen nicht sichtbar').toBeInViewport({ ratio: 0.9 })
    if ((await dlg.evaluate((el) => el.scrollHeight > el.clientHeight + 1))) {
      await screenshot(page, testInfo, `dlg-${c.name}-end`)
    }
  }

  // Ohne Speichern schliessen: Escape, notfalls X
  await page.keyboard.press('Escape')
  const closed = await expect(dlg)
    .toBeHidden({ timeout: 2_000 })
    .then(() => true, () => false)
  if (!closed && kind !== 'popover') {
    await (c.closeButton ?? defaultClose)(dlg, page).click()
  }
  await expect(dlg).toBeHidden()
}

/** Klappt im offenen Dialog eine Combobox auf, fotografiert und schliesst nur das Popover. */
function openInnerPopover(trigger: (dlg: Locator) => Locator, name: string) {
  return async (page: Page, dlg: Locator, testInfo: TestInfo) => {
    await trigger(dlg).click()
    const pop = topPopover(page)
    await expect(pop).toBeVisible()
    await waitForAnimations(pop)
    await screenshot(page, testInfo, `dlg-${name}-popover`)
    await expectInViewport(page, pop, `${name}-popover`)
    await expectNoOverflow(page)
    // Escape schliesst nur das Popover, der Dialog bleibt offen
    await page.keyboard.press('Escape')
    await expect(pop).toBeHidden()
    await expect(dlg).toBeVisible()
  }
}

const onlyBelowDesktop = (page: Page) =>
  page.viewportSize()!.width >= DESKTOP_MIN_WIDTH ? 'nur mit Kopfleiste (< 1024 px)' : null

/** Stift am ersten eigenen Kommentar - im Kommentarblock, nicht der Muelleimer daneben. */
const commentPencil = (page: Page) =>
  page
    .getByRole('button', { name: 'Add Comment' })
    .first()
    .locator('xpath=../..')
    .locator('button:has(svg.lucide-pencil)')
    .first()

/**
 * Bearbeiten geht nur am eigenen, neuesten Kommentar der letzten 24 h - die
 * Demo-Kommentare altern heraus. Fehlt der Stift, einen Kommentar per API
 * anlegen und neu laden; die uebrigen Formate finden ihn dann vor (hoechstens
 * einer je Tag und Datensatz).
 */
async function ensureEditableComment(page: Page, kind: 'contract' | 'customer', id: string): Promise<Locator> {
  await expect(page.getByRole('button', { name: 'Add Comment' }).first()).toBeVisible()
  if ((await commentPencil(page).count()) === 0) {
    const field = kind === 'contract' ? 'addContractComment' : 'addCustomerComment'
    const arg = kind === 'contract' ? 'contractId' : 'customerId'
    const ok = await page.evaluate(
      async ({ field, arg, id }) => {
        const res = await fetch('/graphql', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${localStorage.getItem('auth_token') ?? ''}`,
          },
          body: JSON.stringify({
            query: `mutation($id: ID!, $text: String!) { ${field}(${arg}: $id, text: $text) { success error } }`,
            variables: { id, text: 'E2E: bearbeitbarer Kommentar fuer den Dialogtest' },
          }),
        })
        const body = await res.json()
        return body?.data?.[field]?.success === true
      },
      { field, arg, id },
    )
    expect(ok, `${field} fuer ${id}`).toBe(true)
    await page.reload()
    await settle(page)
  }
  return commentPencil(page)
}

/**
 * Klick auf einen Zeilenknopf ganz rechts in einer waagerecht scrollenden
 * Tabelle. Playwright scrollt das Ziel sonst in die Mitte - dort liegt auf
 * dem Telefon die fixierte erste Spalte darueber. Ein Mensch wischt bis
 * zum Ende; das tun wir auch.
 */
async function clickRowAction(target: Locator) {
  await target.evaluate((el) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(a).overflowX) && a.scrollWidth > a.clientWidth) {
        a.scrollLeft = a.scrollWidth
        break
      }
    }
  })
  await target.click()
}

const contractItemsTab = async (page: Page) => {
  await page.getByTestId('contract-tab-items').click()
}

const cases: DialogCase[] = [
  // ---- App-Rahmen ----
  {
    name: 'nav-drawer',
    path: '/',
    kind: 'sheet',
    skip: onlyBelowDesktop,
    open: async (page) => {
      await page.getByTestId('mobile-menu-button').click()
      await expect(page.getByTestId('nav-drawer')).toBeVisible()
      return topDialog(page)
    },
  },
  {
    name: 'mobile-search',
    path: '/',
    kind: 'sheet',
    skip: onlyBelowDesktop,
    open: async (page) => {
      await page.getByTestId('mobile-search-button').click()
      return page.getByTestId('mobile-search')
    },
    closeButton: (dlg) => dlg.getByRole('button', { name: /^(Close|Schließen)$/ }),
    // Kein Footer - der Schliessen-Knopf sitzt oben neben dem Suchfeld
    footer: (dlg) => dlg.getByRole('button', { name: /^(Close|Schließen)$/ }),
  },
  {
    name: 'chat-drawer',
    path: '/',
    kind: 'sheet',
    open: async (page) => {
      await page.getByTestId('chat-toggle').click()
      return page.getByTestId('chat-drawer')
    },
    closeButton: (dlg) => dlg.getByTestId('chat-close'),
    // Nie chat-send; letzter Knopf ist der (leere, gesperrte) Senden-Knopf
    footer: (dlg) => dlg.locator('textarea'),
  },
  {
    name: 'sign-out',
    path: '/',
    // Ohne das SSO-Flag meldet der Klick sofort ab
    before: (page) => page.addInitScript(() => localStorage.setItem('sso_session', '1')),
    open: async (page) => {
      if (page.viewportSize()!.width < DESKTOP_MIN_WIDTH) {
        await page.getByTestId('mobile-menu-button').click()
        await expect(page.getByTestId('nav-drawer')).toBeVisible()
      }
      const btn = await visibleFirst(page, '[data-testid="sign-out"]')
      await expect.poll(() => page.evaluate(() => localStorage.getItem('sso_session'))).toBe('1')
      await btn.click()
      return page.getByTestId('sign-out-dialog')
    },
  },
  {
    name: 'feedback',
    path: '/',
    // Ohne Feedback-Token im Backend ist der Knopf unsichtbar - Flag mocken
    before: (page) =>
      page.route('**/graphql', async (route) => {
        const body = route.request().postDataJSON() as { operationName?: string } | null
        if (body?.operationName === 'FeedbackEnabled') {
          await route.fulfill({ json: { data: { feedbackEnabled: true } } })
        } else {
          await route.fallback()
        }
      }),
    open: async (page) => {
      if (page.viewportSize()!.width < DESKTOP_MIN_WIDTH) {
        await page.getByTestId('mobile-menu-button').click()
        await expect(page.getByTestId('nav-drawer')).toBeVisible()
      }
      const btn = page.getByRole('button', { name: /Send Feedback|Feedback senden/ }).locator('visible=true').first()
      await btn.click()
      return topDialog(page)
    },
  },
  {
    name: 'dashboard-info',
    path: '/',
    open: async (page) => {
      await page.getByRole('button', { name: 'Show info' }).first().click()
      return topDialog(page)
    },
  },

  // ---- Banking ----
  {
    name: 'bank-account-add',
    path: '/banking',
    open: async (page) => {
      await page.getByRole('button', { name: 'Add Account' }).locator('visible=true').first().click()
      return topDialog(page)
    },
  },
  {
    name: 'bank-account-edit',
    path: '/banking',
    open: async (page) => {
      await (await visibleFirst(page, '[title="Edit Account"]')).click()
      return topDialog(page)
    },
  },
  {
    // "Delete" im Dialog loescht alle Umsaetze - nur Escape/X
    name: 'bank-account-delete',
    path: '/banking',
    open: async (page) => {
      await (await visibleFirst(page, '[title="Delete Account"]')).click()
      return topDialog(page)
    },
  },
  {
    name: 'bank-tx-counterparty',
    path: '/banking',
    kind: 'popover',
    // Eine Auswahl schreibt sofort - nur aufklappen
    open: async (page) => {
      await page.getByTestId('banking-tabs').getByRole('button', { name: /Transactions/ }).click()
      await settle(page)
      await (await visibleFirst(page, '[data-testid^="tx-edit-cp-"]')).click()
      return topPopover(page)
    },
  },
  {
    name: 'bank-tx-match',
    path: '/banking',
    kind: 'sheet',
    open: async (page) => {
      await page.getByTestId('banking-tabs').getByRole('button', { name: /Transactions/ }).click()
      await settle(page)
      await (await visibleFirst(page, '[title="Match"], [data-testid^="transaction-card-match-"]')).click()
      return topDialog(page)
    },
  },
  {
    name: 'counterparty-merge',
    path: `/banking/counterparty/${ids.counterparty}`,
    open: async (page) => {
      await (await visibleFirst(page, '[title="Merge Counterparty"]')).click()
      return topDialog(page)
    },
    extra: openInnerPopover((dlg) => dlg.getByRole('combobox').first(), 'counterparty-merge'),
  },
  {
    // Dialog und Kunden-Popover oeffnen zusammen; ein Klick auf einen Kunden verknuepft sofort
    name: 'counterparty-link',
    path: `/banking/counterparty/${ids.counterparty}`,
    open: async (page) => {
      await (await visibleFirst(page, '[title="Link to Customer"]')).click()
      const dlg = topDialog(page)
      await expect(dlg).toBeVisible()
      const pop = topPopover(page)
      if (await pop.isVisible()) {
        await page.keyboard.press('Escape')
      }
      return dlg
    },
  },
  {
    name: 'counterparty-tx-match',
    path: `/banking/counterparty/${ids.counterparty}`,
    kind: 'sheet',
    open: async (page) => {
      await page.getByRole('button', { name: /Bank Transactions/ }).first().click()
      await settle(page)
      await (await visibleFirst(page, '[title="Match"], [data-testid^="transaction-card-match-"]')).click()
      return topDialog(page)
    },
  },

  // ---- Vertragsdetail ----
  {
    name: 'contract-create-offer',
    path: `/contracts/${ids.draftContract}`,
    open: async (page) => {
      await (await visibleFirst(page, '[data-testid="contract-create-offer"]')).click()
      return topDialog(page)
    },
  },
  {
    name: 'contract-mark-delivered',
    path: `/contracts/${ids.activeContract}`,
    open: async (page) => {
      await contractItemsTab(page)
      // Nicht "Revert to pending" - das ist confirm + Mutation
      await clickRowAction(page.locator('button[title="Mark as Delivered"]').first())
      return topDialog(page)
    },
  },
  {
    name: 'contract-price-increase',
    path: `/contracts/${ids.activeContract}`,
    open: async (page) => {
      await contractItemsTab(page)
      await page.getByRole('button', { name: 'Price Increase' }).first().click()
      return topDialog(page)
    },
  },
  {
    name: 'contract-add-item',
    path: `/contracts/${ids.activeContract}`,
    open: async (page) => {
      await contractItemsTab(page)
      await page.getByRole('button', { name: 'Add Item' }).first().click()
      return topDialog(page)
    },
    extra: openInnerPopover((dlg) => dlg.getByRole('combobox').filter({ hasText: 'Select product' }).first(), 'contract-add-item'),
  },
  {
    // Preisperioden-Knoepfe im Dialog schreiben sofort - nicht anfassen
    name: 'contract-edit-item',
    path: `/contracts/${ids.activeContract}`,
    open: async (page) => {
      await contractItemsTab(page)
      await clickRowAction(page.locator('main table tbody button:has(svg[class*="pen"])').first())
      return topDialog(page)
    },
    extra: openInnerPopover((dlg) => dlg.getByRole('combobox').first(), 'contract-edit-item'),
  },
  {
    name: 'contract-move-item',
    path: `/contracts/${ids.activeContract}`,
    open: async (page) => {
      await contractItemsTab(page)
      await clickRowAction(page.locator('button[title="Move to another contract"]').first())
      return topDialog(page)
    },
    extra: openInnerPopover((dlg) => dlg.getByRole('combobox').first(), 'contract-move-item'),
  },
  {
    // Nie "Send"
    name: 'contract-order-confirmation',
    path: `/contracts/${ids.activeContract}`,
    open: async (page) => {
      await page.getByRole('button', { name: 'Send Order Confirmation' }).locator('visible=true').first().click()
      return topDialog(page)
    },
  },
  {
    name: 'contract-comment-add',
    path: `/contracts/${ids.activeContract}`,
    open: async (page) => {
      await page.getByRole('button', { name: 'Add Comment' }).first().click()
      return topDialog(page)
    },
  },
  {
    // Stift am Admin-Kommentar, nicht der Muelleimer
    name: 'contract-comment-edit',
    path: `/contracts/${ids.activeContract}`,
    open: async (page) => {
      await (await ensureEditableComment(page, 'contract', ids.activeContract)).click()
      return topDialog(page)
    },
  },
  {
    name: 'contract-todo-add',
    path: `/contracts/${ids.activeContract}`,
    open: async (page) => {
      await page.getByRole('button', { name: 'Add Todo' }).first().click()
      return topDialog(page)
    },
  },
  {
    // Felder speichern sofort - nichts anfassen
    name: 'contract-todo-detail',
    path: `/contracts/${ids.todoContract}`,
    open: async (page) => {
      await page.getByTestId('contract-tab-todos').click()
      await (await visibleFirst(page, '[data-testid^="todo-edit-"]')).click()
      return topDialog(page)
    },
  },

  // ---- Vertragsformular ----
  {
    name: 'contract-new-customer',
    path: '/contracts/new',
    kind: 'popover',
    open: async (page) => {
      await page.getByRole('combobox').filter({ hasText: 'Select customer' }).first().click()
      return topPopover(page)
    },
  },
  {
    // Auswahl des Kunden setzt nur Formular-State. In der Gruppe KEIN Suchtext ("Create new" schreibt)
    name: 'contract-new-group',
    path: '/contracts/new',
    kind: 'popover',
    open: async (page) => {
      await page.getByRole('combobox').filter({ hasText: 'Select customer' }).first().click()
      const pop = topPopover(page)
      await pop.getByRole('option').first().click()
      await expect(pop).toBeHidden()
      await page.getByRole('combobox').filter({ hasText: 'No group' }).first().click()
      return topPopover(page)
    },
  },
  {
    // "Activate" im Dialog aktiviert sofort
    name: 'contract-activate',
    path: `/contracts/${ids.draftContract}/edit`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Activate', exact: true }).first().click()
      return topDialog(page)
    },
  },
  {
    // Nie merge-confirm-button
    name: 'contract-merge',
    path: `/contracts/${ids.draftContract}/edit`,
    open: async (page) => {
      await (await visibleFirst(page, '[data-testid="merge-contract-button"]')).click()
      return topDialog(page)
    },
    extra: openInnerPopover((dlg) => dlg.getByTestId('merge-target-selector'), 'contract-merge'),
  },
  {
    name: 'contract-delete',
    path: `/contracts/${ids.draftContract}/edit`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Delete', exact: true }).first().click()
      return topDialog(page)
    },
  },
  {
    name: 'contract-change-customer',
    path: `/contracts/${ids.draftContract}/edit`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Change', exact: true }).first().click()
      const dlg = topDialog(page)
      await expect(dlg).toBeVisible()
      // Suchergebnisse zeigen, damit die Liste im Foto ist
      await dlg.locator('input').first().fill(ids.customerSearch)
      await expect(dlg.locator('.space-y-2 > button').first()).toBeVisible({ timeout: 15_000 })
      return dlg
    },
  },
  {
    // Nicht "Change customer" - das ist die Mutation
    name: 'contract-confirm-customer',
    path: `/contracts/${ids.draftContract}/edit`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Change', exact: true }).first().click()
      const picker = topDialog(page)
      await picker.locator('input').first().fill(ids.customerSearch)
      const hit = picker.locator('.space-y-2 > button').first()
      await expect(hit).toBeVisible({ timeout: 15_000 })
      await hit.click()
      const dlg = topDialog(page)
      await expect(dlg).toContainText(/Confirm|Change customer/i)
      return dlg
    },
  },
  {
    // Bestaetigung erst im Dialog; schliessen nur per Escape/X
    name: 'contract-status-pause',
    path: `/contracts/${ids.activeContract}/edit`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Pause', exact: true }).first().click()
      return topDialog(page)
    },
  },
  {
    name: 'contract-status-reactivate',
    path: `/contracts/${ids.cancelledContract}/edit`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Reactivate', exact: true }).first().click()
      return topDialog(page)
    },
  },

  // ---- Kunde ----
  {
    name: 'customer-comment-add',
    path: `/customers/${ids.customer}`,
    open: async (page) => {
      await page.getByRole('button', { name: 'Add Comment' }).first().click()
      return topDialog(page)
    },
  },
  {
    name: 'customer-comment-edit',
    path: `/customers/${ids.customer}`,
    open: async (page) => {
      await (await ensureEditableComment(page, 'customer', ids.customer)).click()
      return topDialog(page)
    },
  },
  {
    // Eine Auswahl schreibt sofort - nur aufklappen
    name: 'customer-contract-group',
    path: `/customers/${ids.customer}`,
    kind: 'popover',
    open: async (page) => {
      const section = page.getByTestId('customer-contracts-section')
      if (!(await section.isVisible())) {
        await page.locator('main nav button, main [role=tablist] button').filter({ hasText: /^Contracts/ }).first().click()
      }
      await section.getByRole('button', { name: /No group/ }).locator('visible=true').first().click()
      return topPopover(page)
    },
  },
  {
    name: 'customer-todo-add',
    path: `/customers/${ids.customer}`,
    open: async (page) => {
      await page.locator('main nav button, main [role=tablist] button').filter({ hasText: /^Todos/ }).first().click()
      await page.getByTestId('customer-todos-section').getByRole('button', { name: 'Add Todo' }).first().click()
      return topDialog(page)
    },
  },
  {
    name: 'customer-todo-detail',
    path: `/customers/${ids.customer}`,
    open: async (page) => {
      await page.locator('main nav button, main [role=tablist] button').filter({ hasText: /^Todos/ }).first().click()
      await (await visibleFirst(page, '[data-testid="customer-todos-section"] [data-testid^="todo-edit-"]')).click()
      return topDialog(page)
    },
  },

  // ---- Eingangsrechnungen ----
  {
    // Eine Auswahl schreibt sofort - nur aufklappen
    name: 'incoming-counterparty',
    path: '/incoming-invoices',
    kind: 'popover',
    open: async (page) => {
      await (await visibleFirst(page, `[data-testid="incoming-invoice-edit-cp-${ids.incomingInvoice}"]`)).click()
      return topPopover(page)
    },
  },
  {
    // Kein Strg+Enter (bestaetigt die Rechnung)
    name: 'incoming-detail',
    path: `/incoming-invoices?id=${ids.incomingInvoice}`,
    kind: 'sheet',
    open: async (page) => topDialog(page),
    extra: openInnerPopover((dlg) => dlg.getByRole('combobox').first(), 'incoming-detail'),
  },

  // ---- Rechnungen ----
  {
    name: 'invoice-guide',
    path: '/invoices',
    skip: (page) => (page.viewportSize()!.width < MD ? 'Knopf nur ab 768 px' : null),
    open: async (page) => {
      await page.getByRole('button', { name: 'Invoice guide' }).first().click()
      return topDialog(page)
    },
  },
  {
    name: 'invoice-upload',
    path: '/invoices',
    open: async (page) => {
      await page.getByRole('button', { name: /Upload Invoice/ }).locator('visible=true').first().click()
      return topDialog(page)
    },
  },
  {
    name: 'invoice-import-csv',
    path: '/invoices',
    open: async (page) => {
      await page.getByRole('button', { name: /Import CSV/ }).locator('visible=true').first().click()
      return topDialog(page)
    },
  },
  {
    // Keine Treffer zuordnen
    name: 'invoice-payment-match',
    path: '/invoices',
    open: async (page) => {
      await (await visibleFirst(page, '[title="Match Payment"]')).click()
      return topDialog(page)
    },
  },
  {
    name: 'invoice-payment-view',
    path: '/invoices',
    open: async (page) => {
      await (await visibleFirst(page, '[title="View payment match"]')).click()
      return topDialog(page)
    },
  },
  {
    // Oeffnen baut nur einen Entwurf (createPaymentReminder legt nichts an). Nie "Send".
    name: 'invoice-reminder',
    path: '/invoices',
    open: async (page) => {
      const wanted = page.locator(`[data-testid="invoice-dun-${ids.dunInvoice}"]`).locator('visible=true').first()
      const trigger = (await wanted.isVisible())
        ? wanted
        : await visibleFirst(page, '[data-testid^="invoice-dun-"]:not([data-testid="invoice-dun-1"])')
      await trigger.click()
      return page.getByTestId('reminder-dialog')
    },
  },
  {
    // Nie invoice-send-email-trigger, nie "Generate PDF"
    name: 'invoice-void',
    path: `/invoices/${ids.voidInvoice}`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Void', exact: true }).first().click()
      return topDialog(page)
    },
  },
  {
    name: 'invoice-export-preview',
    path: '/invoices/export',
    open: async (page) => {
      await (await visibleFirst(page, '[data-testid^="invoice-preview-"]')).click()
      return topDialog(page)
    },
  },

  // ---- Importierte Rechnungen (Seed-Erweiterung) ----
  {
    // Ohne Kunde, nur customerName
    name: 'imported-link-customer',
    path: `/invoices/${ids.importedNoCustomer}?type=imported`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Link to customer' }).first().click()
      return topDialog(page)
    },
  },
  {
    name: 'imported-select-contract',
    path: `/invoices/${ids.importedNoContract}?type=imported`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Link Contract' }).first().click()
      return topDialog(page)
    },
  },
  {
    name: 'imported-match-payment',
    path: `/invoices/${ids.importedNoContract}?type=imported`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Match Payment' }).first().click()
      return topDialog(page)
    },
  },
  {
    name: 'imported-void',
    path: `/invoices/${ids.importedNoContract}?type=imported`,
    open: async (page) => {
      await (await visibleFirst(page, '[data-testid="void-imported-invoice"]')).click()
      return topDialog(page)
    },
  },
  {
    name: 'imported-credit-note',
    path: `/invoices/${ids.importedNoContract}?type=imported`,
    open: async (page) => {
      await (await visibleFirst(page, '[data-testid="link-as-credit-note"]')).click()
      return topDialog(page)
    },
  },
  {
    name: 'imported-delete',
    path: `/invoices/${ids.importedNoContract}?type=imported`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Delete', exact: true }).first().click()
      return topDialog(page)
    },
  },
  {
    // Muelleimer an einer importierten Zeile (generierte Zeilen haben keinen)
    name: 'invoice-list-imported-delete',
    path: '/invoices',
    open: async (page) => {
      await (await visibleFirst(page, 'main button:has(svg.lucide-trash-2)')).click()
      return topDialog(page)
    },
  },
  {
    name: 'invoice-list-link-customer',
    path: '/invoices',
    // In den Karten (< 768 px) gibt es den Knopf nicht - dort ueber das Rechnungsdetail
    skip: (page) => (page.viewportSize()!.width < MD ? 'nur in der Tabelle (ab 768 px)' : null),
    open: async (page) => {
      await (await visibleFirst(page, 'main [title="Link to customer"]')).click()
      return topDialog(page)
    },
  },
  {
    name: 'invoice-list-delete-batch',
    path: '/invoices',
    open: async (page) => {
      await (await visibleFirst(page, 'main button[title^="Delete batch"]')).click()
      return topDialog(page)
    },
  },
  {
    // NIE senden - echter Mailversand ueber Graph
    name: 'offer-send',
    path: `/offers/${ids.offerWithPdf}`,
    open: async (page) => {
      await page.locator('main').getByRole('button', { name: 'Send', exact: true }).first().click()
      return topDialog(page)
    },
  },
  {
    name: 'contract-comments-all',
    path: `/contracts/${ids.activeContract}`,
    open: async (page) => {
      await page.getByRole('button', { name: /^Show all/ }).first().click()
      return topDialog(page)
    },
  },

  // ---- Angebote, Projekte ----
  {
    // Nicht offer-recreate-confirm / offer-finalize / offer-clone
    name: 'offer-recreate',
    path: `/offers/${ids.offer}`,
    open: async (page) => {
      await (await visibleFirst(page, '[data-testid="offer-recreate"]')).click()
      return topDialog(page)
    },
  },
  {
    name: 'projects-columns',
    path: '/projects',
    kind: 'popover',
    skip: (page) => (page.viewportSize()!.width < MD ? 'Spaltenwahl nur in der Tabelle (ab 768 px)' : null),
    open: async (page) => {
      await page.getByTestId('projects-columns-toggle').click()
      return topPopover(page)
    },
  },
  {
    name: 'projects-mark-delivered',
    path: '/projects',
    open: async (page) => {
      await page.getByRole('button', { name: 'Mark as Delivered' }).locator('visible=true').first().click()
      return topDialog(page)
    },
  },

  // ---- Einstellungen ----
  {
    // Nicht api-key-generate-submit
    name: 'settings-api-key',
    path: '/settings/integrations/api',
    open: async (page) => {
      await page.getByTestId('api-key-generate-button').click()
      return topDialog(page)
    },
  },
  {
    // Nie api-key-revoke-confirm o. ae.
    name: 'settings-api-key-revoke',
    path: '/settings/integrations/api',
    open: async (page) => {
      await (await visibleFirst(page, '[data-testid^="api-key-revoke-"]')).click()
      return topDialog(page)
    },
  },
  {
    // Inbox-Zeile: Auge (E-Mails), Reagenzglas (Verbindung testen - NIE), Stift, Muelleimer
    name: 'settings-inbox-emails',
    path: '/settings/invoice-inboxes',
    open: async (page) => {
      await (await visibleFirst(page, 'main button[title="View emails"]')).click()
      return topDialog(page)
    },
  },
  {
    name: 'settings-inbox-edit',
    path: '/settings/invoice-inboxes',
    open: async (page) => {
      await (await visibleFirst(page, 'main button:has(svg.lucide-pencil)')).click()
      return topDialog(page)
    },
  },
  {
    name: 'settings-inbox-delete',
    path: '/settings/invoice-inboxes',
    open: async (page) => {
      await (await visibleFirst(page, 'main button:has(svg.lucide-trash-2)')).click()
      return topDialog(page)
    },
  },
  {
    name: 'settings-inbox-add',
    path: '/settings/invoice-inboxes',
    open: async (page) => {
      await page.getByRole('button', { name: 'Add Inbox' }).first().click()
      return topDialog(page)
    },
  },
  {
    // Keine Rollen-Badges in der Tabelle anklicken
    name: 'settings-invite',
    path: '/settings/team',
    open: async (page) => {
      await page.getByRole('button', { name: 'Invite User' }).locator('visible=true').first().click()
      return page.getByTestId('invite-dialog')
    },
  },
  {
    name: 'settings-role-edit',
    path: '/settings/team/roles',
    open: async (page) => {
      await (await visibleFirst(page, '[title="Edit Role"]')).click()
      return page.getByTestId('role-edit-dialog')
    },
  },
  {
    name: 'settings-role-create',
    path: '/settings/team/roles',
    open: async (page) => {
      await page.getByRole('button', { name: 'Create Role' }).first().click()
      return page.getByTestId('role-create-dialog')
    },
  },

  // ---- Todos ----
  {
    // todo-card-move-to-* verschiebt sofort - nur aufklappen
    name: 'todos-move-menu',
    path: '/todos',
    kind: 'popover',
    skip: (_page, testInfo) => (isTouch(testInfo) ? null : 'Verschieben-Knopf nur auf Touch'),
    open: async (page) => {
      await (await visibleFirst(page, '[data-testid^="todo-card-move-"]:not([data-testid^="todo-card-move-to-"]):not([data-testid^="todo-card-move-menu-"])')).click()
      return topPopover(page)
    },
  },
  {
    // Nicht todo-card-checkbox-*
    name: 'todos-detail',
    path: '/todos',
    open: async (page) => {
      await (await visibleFirst(page, '[data-testid^="todo-card-edit-"]')).click()
      return topDialog(page)
    },
  },
]

test.describe.configure({ timeout: 120_000 })

test.describe('Dialoge', () => {
  for (const c of cases) {
    test(c.name, async ({ page }, testInfo) => {
      const reason = c.skip?.(page, testInfo)
      test.skip(!!reason, reason ?? '')
      await runCase(page, testInfo, c)
    })
  }

  // Nur mit einem Versions-Build (VITE_BUILD_VERSION) und neuerer latestVersion erreichbar
  test.skip('changelog', () => {})

  // Braucht Seed-Erweiterung: Abteilungen (sonst zeigt /department-analysis keinen Absences-Tab).
  // Dann: Tab "Absences", Monat ids.absenceMonth, Knopf "Send" -> Dialog nur oeffnen, NIE senden.
  test.fixme('absence-report-send', () => {})
  // Time Tracking ist im Seed nicht konfiguriert (Link Project, Add Auto-link Rule)
  test.fixme('time-tracking-link-project', () => {})
  test.fixme('time-tracking-add-rule', () => {})
})
