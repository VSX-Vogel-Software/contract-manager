// Routen fuer die Mobil-Suite. Detail-IDs stammen aus `seed_demo_data`
// (feste Reihenfolge, random.Random(42)); nach `--reset` per Umgebungsvariable
// ueberschreibbar.
const env = (name: string, fallback: string) => process.env[name] ?? fallback

export interface MobileRoute {
  name: string
  path: string
}

export const routes: MobileRoute[] = [
  { name: 'dashboard', path: '/' },
  { name: 'todos', path: '/todos' },
  { name: 'customers', path: '/customers' },
  { name: 'customer-detail', path: `/customers/${env('E2E_CUSTOMER_ID', '2')}` },
  { name: 'products', path: '/products' },
  { name: 'contracts', path: '/contracts' },
  { name: 'contract-detail', path: `/contracts/${env('E2E_CONTRACT_ID', '2')}` },
  { name: 'contract-edit', path: `/contracts/${env('E2E_CONTRACT_ID', '2')}/edit` },
  { name: 'contract-new', path: '/contracts/new' },
  { name: 'contract-import', path: '/contracts/import' },
  { name: 'projects', path: '/projects' },
  { name: 'invoices', path: '/invoices' },
  { name: 'invoice-detail', path: `/invoices/${env('E2E_INVOICE_ID', '2')}` },
  { name: 'invoice-export', path: '/invoices/export' },
  { name: 'imported-invoice', path: `/invoices/${env('E2E_IMPORTED_INVOICE_ID', '1')}?type=imported` },
  {
    name: 'order-confirmation',
    path: `/contracts/${env('E2E_OC_CONTRACT_ID', '4')}/order-confirmation/${env('E2E_OC_ID', '1')}`,
  },
  { name: 'attachment', path: `/attachments/${env('E2E_ATTACHMENT_ID', '1')}` },
  { name: 'offers', path: '/offers' },
  { name: 'offer-detail', path: `/offers/${env('E2E_OFFER_ID', '1')}` },
  { name: 'incoming-invoices', path: '/incoming-invoices' },
  { name: 'banking', path: '/banking' },
  { name: 'banking-cost-center-report', path: '/banking/cost-center-report' },
  { name: 'forecasts', path: '/forecasts' },
  { name: 'forecasts-liquidity', path: '/forecasts?tab=liquidity' },
  { name: 'department-analysis', path: '/department-analysis' },
  { name: 'audit-log', path: '/audit-log' },
  { name: 'about', path: '/about' },
  // Ergebnisseite der globalen Suche (Supportvertrag: elf Vertraege im Demo-Bestand)
  { name: 'search', path: '/search?q=Supportvertrag' },
  { name: 'settings-user', path: '/settings' },
  { name: 'settings-general', path: '/settings/general' },
  { name: 'settings-integrations', path: '/settings/integrations' },
  { name: 'settings-team', path: '/settings/team' },
  { name: 'settings-roles', path: '/settings/team/roles' },
  { name: 'settings-documents', path: '/settings/documents' },
  { name: 'settings-template', path: '/settings/documents/template' },
  { name: 'settings-numbering', path: '/settings/numbering' },
  { name: 'settings-email-templates', path: '/settings/email-templates' },
  { name: 'settings-accounting', path: '/settings/accounting' },
  { name: 'settings-dunning', path: '/settings/accounting/dunning' },
  { name: 'settings-banking', path: '/settings/banking' },
]

// Gegenpartei-ID ist eine UUID und aendert sich mit jedem Reset - nur wenn gesetzt.
if (process.env.E2E_COUNTERPARTY_ID) {
  routes.push({ name: 'counterparty-detail', path: `/banking/counterparty/${process.env.E2E_COUNTERPARTY_ID}` })
}

// Kennzahl-Detailseiten vom Dashboard
for (const metric of ['new_arr', 'back_to_base_arr', 'new_development', 'new_deal_count']) {
  routes.push({ name: `new-business-${metric}`, path: `/dashboard/new-business/${metric}` })
}

// Oeffentliche Seiten (ohne Anmeldung). Token-Seiten mit ungueltigem Token
// zeigen ihre Fehlerseite - gefahrlos, die Pruefung ist eine lesende Abfrage.
export const publicRoutes: MobileRoute[] = [
  { name: 'login', path: '/login/local' },
  { name: 'forgot-password', path: '/forgot-password' },
  { name: 'signup', path: '/signup' },
  { name: 'reset-password-invalid', path: '/reset-password/invalid-token' },
  { name: 'invite-invalid', path: '/invite/invalid-token' },
  // ohne ?token - mit Token wuerde verifySignup feuern
  { name: 'verify-signup', path: '/verify-signup' },
]

// Angemeldet, aber ausserhalb des App-Rahmens (kein <main>). Auf setup-2fa
// nichts anklicken: "Authenticator App"/"Email Code" schreiben sofort.
export const bareRoutes: MobileRoute[] = [{ name: 'setup-2fa', path: '/setup-2fa' }]
