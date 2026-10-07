import { useState, useRef, useEffect, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLazyQuery, useQuery, gql } from '@apollo/client'
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  TrendingUp,
  Settings,
  LogOut,
  FileUp,
  History,
  Search,
  Loader2,
  FileSignature,
  X,
  MessageSquarePlus,
  Landmark,
  ListTodo,
  Info,
  FolderKanban,
  PieChart,
  ArrowRight,
  Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { FeedbackModal } from './FeedbackModal'
import { SignOutDialog } from './SignOutDialog'
import { isSsoSession } from '@/lib/ssoSession'
import { matchesAllTokens, searchTokens } from '@/lib/searchFold'
import {
  GLOBAL_SEARCH,
  HighlightedText,
  SimilarHint,
  searchResultsUrl,
  searchTypeIcon,
  type GlobalSearchData,
} from './SearchResultParts'

const FEEDBACK_ENABLED = gql`
  query FeedbackEnabled {
    feedbackEnabled
  }
`

interface NavItem {
  to: string
  icon: typeof LayoutDashboard
  labelKey: string
  permission?: string  // "resource.action" format
  end?: boolean
}

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard', end: true },
  { to: '/todos', icon: ListTodo, labelKey: 'nav.todos' },
  { to: '/customers', icon: Users, labelKey: 'nav.customers' },
  { to: '/products', icon: Package, labelKey: 'nav.products' },
  { to: '/contracts', icon: FileText, labelKey: 'nav.contracts' },
  { to: '/projects', icon: FolderKanban, labelKey: 'nav.projects' },
  { to: '/invoices', icon: FileUp, labelKey: 'nav.invoices', permission: 'invoices.read' },
  { to: '/offers', icon: FileSignature, labelKey: 'nav.offers', permission: 'offers.read' },
  { to: '/incoming-invoices', icon: Inbox, labelKey: 'nav.incomingInvoices', permission: 'incoming_invoices.read' },
  { to: '/banking', icon: Landmark, labelKey: 'nav.banking', permission: 'banking.read' },
  { to: '/forecasts', icon: TrendingUp, labelKey: 'nav.forecasts' },
  { to: '/department-analysis', icon: PieChart, labelKey: 'nav.departmentAnalysis', permission: 'department_analysis.read' },
  { to: '/audit-log', icon: History, labelKey: 'nav.auditLog' },
  { to: '/about', icon: Info, labelKey: 'nav.about' },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings', end: true },
]

interface SearchablePage {
  labelKey: string
  keywords: string[]  // extra terms to match against (gefaltet verglichen)
  url: string
  permission?: string
}

const searchablePages: SearchablePage[] = [
  // Main pages
  { labelKey: 'nav.dashboard', keywords: ['dashboard', 'home', 'start'], url: '/' },
  { labelKey: 'nav.todos', keywords: ['todos', 'aufgaben', 'tasks', 'board'], url: '/todos' },
  { labelKey: 'nav.customers', keywords: ['customers', 'kunden'], url: '/customers' },
  { labelKey: 'nav.products', keywords: ['products', 'produkte'], url: '/products' },
  { labelKey: 'nav.contracts', keywords: ['contracts', 'verträge'], url: '/contracts' },
  { labelKey: 'nav.projects', keywords: ['projects', 'projekte'], url: '/projects' },
  { labelKey: 'nav.invoices', keywords: ['invoices', 'rechnungen'], url: '/invoices', permission: 'invoices.read' },
  { labelKey: 'nav.offers', keywords: ['offers', 'angebote'], url: '/offers', permission: 'offers.read' },
  { labelKey: 'nav.incomingInvoices', keywords: ['incoming invoices', 'eingangsrechnungen', 'lieferantenrechnungen', 'supplier invoices', 'bills'], url: '/incoming-invoices', permission: 'incoming_invoices.read' },
  { labelKey: 'nav.banking', keywords: ['banking', 'bankkonten', 'bank'], url: '/banking', permission: 'banking.read' },
  { labelKey: 'nav.forecasts', keywords: ['forecasts', 'vorschauen', 'prognose'], url: '/forecasts' },
  { labelKey: 'forecasts.liquidityTab', keywords: ['liquidity', 'liquidität', 'liquiditätsanalyse', 'cash flow', 'balance'], url: '/forecasts?tab=liquidity', permission: 'banking.read' },
  { labelKey: 'nav.departmentAnalysis', keywords: ['department', 'abteilung', 'analyse', 'analysis'], url: '/department-analysis', permission: 'department_analysis.read' },
  { labelKey: 'nav.auditLog', keywords: ['audit', 'auditlog', 'log', 'history'], url: '/audit-log' },
  { labelKey: 'nav.about', keywords: ['about', 'info', 'über', 'version', 'changelog', 'änderungen', 'lizenzen', 'licenses'], url: '/about' },
  { labelKey: 'search.resultsTitle', keywords: ['search', 'suche', 'suchergebnisse', 'search results', 'alle treffer'], url: '/search' },
  // Settings pages
  { labelKey: 'settings.tabs.user', keywords: ['user', 'benutzer', 'profile', 'profil', 'security', 'sicherheit', '2fa'], url: '/settings' },
  { labelKey: 'settings.tabs.general', keywords: ['general', 'allgemein', 'settings', 'einstellungen', 'contracts', 'tenant', 'organization', 'organisation', 'organisationsname'], url: '/settings/general', permission: 'settings.read' },
  { labelKey: 'settings.generalTabs.helpVideos', keywords: ['help videos', 'hilfevideos', 'video', 'tutorial'], url: '/settings/general/help-videos', permission: 'settings.read' },
  { labelKey: 'settings.generalTabs.performance', keywords: ['performance', 'leistung', 'cache'], url: '/settings/general/performance', permission: 'settings.read' },
  { labelKey: 'settings.generalTabs.security', keywords: ['security', 'sicherheit', '2fa enforce', 'two factor'], url: '/settings/general/security', permission: 'settings.read' },
  { labelKey: 'settings.reports.title', keywords: ['reports', 'berichte', 'automation', 'automatisch', 'absence', 'fehlzeiten', 'department'], url: '/settings/general/reports', permission: 'settings.read' },
  { labelKey: 'settings.tabs.integrations', keywords: ['integrations', 'integrationen', 'hubspot'], url: '/settings/integrations', permission: 'settings.read' },
  { labelKey: 'settings.integrationTabs.timeTracking', keywords: ['clockodo', 'time tracking', 'zeiterfassung'], url: '/settings/integrations/time-tracking', permission: 'settings.read' },
  { labelKey: 'settings.integrationTabs.email', keywords: ['email', 'm365', 'smtp', 'e-mail'], url: '/settings/integrations/email', permission: 'settings.read' },
  { labelKey: 'settings.integrationTabs.notifications', keywords: ['notifications', 'benachrichtigungen', 'slack', 'webhook'], url: '/settings/integrations/notifications', permission: 'settings.read' },
  { labelKey: 'settings.integrationTabs.api', keywords: ['api', 'mcp', 'token', 'api key'], url: '/settings/integrations/api', permission: 'settings.read' },
  { labelKey: 'settings.team.users', keywords: ['users', 'benutzer', 'team', 'mitarbeiter', 'invite', 'einladen'], url: '/settings/team', permission: 'users.read' },
  { labelKey: 'settings.team.roles', keywords: ['roles', 'rollen', 'permissions', 'berechtigungen', 'rbac'], url: '/settings/team/roles', permission: 'users.read' },
  { labelKey: 'invoices.companyData.title', keywords: ['company', 'firma', 'firmendaten', 'legal', 'address', 'adresse', 'ust', 'vat', 'steuernummer'], url: '/settings/documents', permission: 'invoices.settings' },
  { labelKey: 'invoices.template.title', keywords: ['invoice template', 'rechnungsvorlage', 'pdf', 'template', 'vorlage', 'logo'], url: '/settings/documents/template', permission: 'invoices.settings' },
  { labelKey: 'invoices.zugferd.title', keywords: ['zugferd', 'xrechnung', 'electronic', 'elektronisch', 'en16931'], url: '/settings/documents/zugferd', permission: 'invoices.settings' },
  { labelKey: 'settings.tabs.numbering', keywords: ['numbering', 'nummerierung', 'nummernkreis', 'invoice number', 'rechnungsnummer'], url: '/settings/numbering', permission: 'invoices.settings' },
  { labelKey: 'settings.numbering.creditNotes', keywords: ['credit note', 'gutschrift', 'storno', 'stornierung'], url: '/settings/numbering/storno', permission: 'invoices.settings' },
  { labelKey: 'settings.numbering.offers', keywords: ['offer number', 'angebotsnummer', 'offer numbering'], url: '/settings/numbering/offers', permission: 'invoices.settings' },
  { labelKey: 'settings.numbering.orderConfirmations', keywords: ['order confirmation number', 'ab nummer', 'auftragsbestätigung nummer'], url: '/settings/numbering/order-confirmations', permission: 'invoices.settings' },
  { labelKey: 'settings.tabs.emailTemplates', keywords: ['email template', 'e-mail vorlage', 'email vorlage', 'mail template', 'invoice email', 'rechnungs-email'], url: '/settings/email-templates', permission: 'invoices.settings' },
  { labelKey: 'settings.emailTemplates.orderConfirmation', keywords: ['order confirmation', 'auftragsbestätigung', 'ab email', 'order email'], url: '/settings/email-templates/order-confirmation', permission: 'invoices.settings' },
  { labelKey: 'search.pageDunningTemplate', keywords: ['dunning template', 'mahn-vorlage', 'mahnvorlage', 'mahnung email', 'mahnungen email', 'reminder template', 'payment reminder email', 'zahlungserinnerung email'], url: '/settings/email-templates/dunning', permission: 'reminders.settings' },
  { labelKey: 'settings.emailTemplates.bcc', keywords: ['bcc', 'blind copy', 'blindkopie', 'kopie', 'cc', 'copy recipient'], url: '/settings/email-templates/bcc', permission: 'settings.write' },
  { labelKey: 'settings.tabs.accounting', keywords: ['accounting', 'buchhaltung', 'revenue goals', 'umsatzziele'], url: '/settings/accounting', permission: 'settings.read' },
  { labelKey: 'settings.accountingTabs.revenueGoals', keywords: ['revenue goals', 'umsatzziele', 'ziele', 'goals'], url: '/settings/accounting', permission: 'settings.read' },
  { labelKey: 'settings.accountingTabs.costCenters', keywords: ['cost centers', 'kostenstellen', 'cost center', 'kostenstelle', 'split rules', 'aufteilungsregeln'], url: '/settings/accounting/cost-centers', permission: 'settings.read' },
  { labelKey: 'search.pageDunningSettings', keywords: ['dunning', 'mahnwesen', 'mahnung', 'mahnungen', 'payment reminder', 'zahlungserinnerung', 'verzug', 'interest', 'verzugszinsen', 'mahngebühr', 'reminder', 'dunning settings'], url: '/settings/accounting/dunning', permission: 'reminders.settings' },
  { labelKey: 'settings.tabs.banking', keywords: ['banking settings', 'bankeinstellungen', 'bank account', 'bankkonto', 'iban', 'fee tolerance'], url: '/settings/banking', permission: 'banking.read' },
  { labelKey: 'auth.signUp', keywords: ['signup', 'sign up', 'registrieren', 'register', 'anmelden'], url: '/signup' },
  { labelKey: 'auth.verifySuccess', keywords: ['verify', 'verifizieren', 'bestätigen', 'verification'], url: '/verify-signup' },
]

/**
 * Seiten passend zur Anfrage. Gefaltet wie die Datensuche: jedes Wort muss im
 * Seitennamen oder in den Stichworten vorkommen, Reihenfolge egal.
 */
export function searchPages(
  query: string,
  t: (key: string) => string,
  hasPermission: (resource: string, action: string) => boolean
): SearchablePage[] {
  const tokens = searchTokens(query)
  if (tokens.length === 0) return []
  return searchablePages.filter((page) => {
    if (page.permission) {
      const [resource, action] = page.permission.split('.')
      if (!hasPermission(resource, action)) return false
    }
    return matchesAllTokens([t(page.labelKey), ...page.keywords].join(' '), tokens)
  })
}

interface GlobalSearchProps {
  /**
   * `dropdown`: Ergebnisse schweben unter dem Feld (Desktop-Seitenleiste).
   * `inline`: Ergebnisse stehen im Fluss und fuellen den verfuegbaren Platz
   * (Navigationsschublade, Vollbild-Suche auf dem Telefon).
   */
  variant?: 'dropdown' | 'inline'
  autoFocus?: boolean
  /** Wird nach der Auswahl eines Treffers aufgerufen, z. B. zum Schliessen. */
  onNavigate?: () => void
  /** Steht rechts neben dem Eingabefeld (z. B. Schliessen-Knopf). */
  trailing?: React.ReactNode
}

export function GlobalSearch({ variant = 'dropdown', autoFocus = false, onNavigate, trailing }: GlobalSearchProps) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  // Anfrage, fuer die zuletzt gesucht wurde - weicht sie vom Feld ab, sind die
  // angezeigten Treffer veraltet
  const [searchedQuery, setSearchedQuery] = useState('')
  const [showResults, setShowResults] = useState(false)

  const [selectedIndex, setSelectedIndex] = useState(-1)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isDropdown = variant === 'dropdown'

  const [search, { data, previousData, loading }] = useLazyQuery<GlobalSearchData>(GLOBAL_SEARCH, {
    fetchPolicy: 'cache-and-network',
  })
  // Waehrend eine neue Anfrage laeuft, bleiben die alten Treffer (abgeblendet) stehen
  const shownData = data ?? previousData
  const trimmedQuery = searchQuery.trim()
  const isStale = trimmedQuery !== searchedQuery || (loading && !data)

  // Debounced search
  useEffect(() => {
    if (trimmedQuery.length < 2) {
      return
    }
    const timer = setTimeout(() => {
      setSearchedQuery(trimmedQuery)
      search({ variables: { query: trimmedQuery, limit: 10 } })
    }, 300)
    return () => clearTimeout(timer)
  }, [trimmedQuery, search])

  // Close on click outside
  useEffect(() => {
    if (!isDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isDropdown])

  // "/" keyboard shortcut to focus search (nur die Desktop-Suche)
  useEffect(() => {
    if (!isDropdown) return
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isDropdown])

  // Seitensuche im Browser, gleiche Faltung wie die Datensuche
  const filteredPages = useMemo(
    () => (trimmedQuery.length < 2 ? [] : searchPages(trimmedQuery, t, hasPermission).slice(0, 5)),
    [trimmedQuery, t, hasPermission]
  )

  const groups = useMemo(() => shownData?.globalSearch?.groups ?? [], [shownData])
  const showAllUrl = searchResultsUrl(trimmedQuery)

  // Flache Liste aller anwaehlbaren Zeilen fuer die Tastatur, in Anzeigereihenfolge
  const allResultUrls = useMemo(() => {
    const urls: string[] = []
    filteredPages.forEach((page) => urls.push(page.url))
    groups.forEach((group) => {
      group.items.forEach((item) => urls.push(item.url))
      if (group.hasMore) urls.push(searchResultsUrl(trimmedQuery, group.type))
    })
    if (groups.length > 0) urls.push(showAllUrl)
    return urls
  }, [filteredPages, groups, trimmedQuery, showAllUrl])

  // Reset selection when results change (Inhalt vergleichen, nicht die Array-Identitaet)
  const resultsKey = allResultUrls.join(' ')
  useEffect(() => {
    setSelectedIndex(-1)
  }, [resultsKey])

  const handleResultClick = (url: string) => {
    navigate(url)
    setSearchQuery('')
    setShowResults(false)
    setSelectedIndex(-1)
    onNavigate?.()
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (showResults && selectedIndex >= 0 && allResultUrls[selectedIndex]) {
        e.preventDefault()
        handleResultClick(allResultUrls[selectedIndex])
      } else if (trimmedQuery.length >= 2) {
        // Enter ohne markierten Treffer: alle Treffer auf der Ergebnisseite
        e.preventDefault()
        handleResultClick(showAllUrl)
      }
      return
    }
    if (e.key === 'Escape') {
      setShowResults(false)
      setSelectedIndex(-1)
      inputRef.current?.blur()
      return
    }
    if (!showResults || allResultUrls.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < allResultUrls.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allResultUrls.length - 1))
    }
  }

  const resultButtonClass = (idx: number) =>
    cn(
      'flex w-full items-start gap-3 px-3 text-left',
      isDropdown ? 'py-2' : 'py-3',
      idx === selectedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
    )

  const linkRowClass = (idx: number) =>
    cn(
      'flex w-full items-center gap-1 px-3 text-left text-xs font-medium text-blue-600',
      isDropdown ? 'py-2' : 'py-3',
      idx === selectedIndex ? 'bg-blue-50' : 'hover:bg-gray-50 hover:underline'
    )

  return (
    <div ref={searchRef} className={cn('relative', !isDropdown && 'flex min-h-0 flex-1 flex-col')}>
      <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          // Bewusst kein type="search": Chrome/Edge leeren das Feld sonst bei
          // Escape, bisher schloss Escape nur die Trefferliste
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoFocus={autoFocus}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setShowResults(true)
          }}
          onFocus={() => setShowResults(true)}
          onKeyDown={handleSearchKeyDown}
          placeholder={t('common.search')}
          data-testid="global-search-input"
          className={cn(
            'w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-8 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500',
            isDropdown ? 'py-2.5' : 'py-3'
          )}
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        ) : searchQuery ? (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setShowResults(false)
              inputRef.current?.focus()
            }}
            aria-label={t('mobile.clearSearch')}
            className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        ) : isDropdown ? (
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400 touch:hidden">/</kbd>
        ) : null}
      </div>
      {trailing}
      </div>

      {/* Search Results */}
      {showResults && trimmedQuery.length >= 2 && (() => {
        let flatIndex = 0
        return (
        <div
          data-testid="global-search-results"
          className={cn(
            'overflow-y-auto bg-white',
            isDropdown
              ? 'absolute left-0 top-full z-50 mt-1 max-h-80 w-[480px] max-w-[calc(100vw-2rem)] rounded-lg border shadow-lg'
              : 'mt-2 min-h-0 shrink overscroll-contain rounded-lg border'
          )}
        >
          {/* Pages (client-side) */}
          {filteredPages.length > 0 && (
            <div>
              <div className="sticky top-0 bg-gray-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t('search.pages', 'Pages')}
              </div>
              {filteredPages.map((page) => {
                const idx = flatIndex++
                return (
                  <button
                    key={page.url}
                    onClick={() => handleResultClick(page.url)}
                    className={resultButtonClass(idx)}
                  >
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div className="truncate text-sm font-medium text-gray-900">
                      <HighlightedText text={t(page.labelKey)} query={trimmedQuery} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          {/* Data results (API) - veraltete Treffer abgeblendet, bis die neuen da sind */}
          <div
            className={cn('transition-opacity', isStale && 'opacity-50')}
            data-testid="global-search-data"
            data-stale={isStale ? 'true' : undefined}
            aria-busy={isStale}
          >
          {groups.map((group) => {
            const Icon = searchTypeIcon(group.type)
            return (
            <div key={group.type} data-testid={`global-search-group-${group.type}`}>
              <div className="sticky top-0 bg-gray-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t(`search.${group.type}`, group.label)}
              </div>
              {group.items.map((item) => {
                const idx = flatIndex++
                return (
                  <button
                    key={`${group.type}-${item.id}`}
                    onClick={() => handleResultClick(item.url)}
                    className={resultButtonClass(idx)}
                    data-testid={`global-search-item-${group.type}-${item.id}`}
                    data-fuzzy={item.fuzzy ? 'true' : undefined}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className={cn('min-w-0 truncate text-sm', item.fuzzy ? 'text-gray-600' : 'font-medium text-gray-900')}>
                          <HighlightedText text={item.title} query={trimmedQuery} plain={item.fuzzy} />
                        </div>
                        {item.fuzzy && <SimilarHint />}
                      </div>
                      {item.subtitle && (
                        <div className="truncate text-xs text-gray-500">
                          <HighlightedText text={item.subtitle} query={trimmedQuery} plain={item.fuzzy} />
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
              {group.hasMore && (() => {
                const idx = flatIndex++
                return (
                  <button
                    type="button"
                    onClick={() => handleResultClick(searchResultsUrl(trimmedQuery, group.type))}
                    className={linkRowClass(idx)}
                    data-testid={`global-search-more-${group.type}`}
                  >
                    {t('search.moreResults', '+ more results...')}
                  </button>
                )
              })()}
            </div>
            )
          })}
          {groups.length > 0 && (() => {
            const idx = flatIndex++
            return (
              <button
                type="button"
                onClick={() => handleResultClick(showAllUrl)}
                className={cn(linkRowClass(idx), 'justify-center border-t')}
                data-testid="global-search-show-all"
              >
                {t('search.showAll')}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )
          })()}
          </div>
          {/* No results */}
          {filteredPages.length === 0 && groups.length === 0 && !loading && !isStale && (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              {t('search.noResults')}
            </div>
          )}
        </div>
        )
      })()}
    </div>
  )
}

interface SidebarProps {
  /**
   * `desktop`: feste Seitenleiste ab `lg`.
   * `drawer`: Inhalt der ausfahrbaren Navigation auf Telefon und Tablet.
   */
  variant?: 'desktop' | 'drawer'
  /** Wird nach einem Klick auf einen Menueeintrag aufgerufen. */
  onNavigate?: () => void
}

export function Sidebar({ variant = 'desktop', onNavigate }: SidebarProps) {
  const { t } = useTranslation()
  const { user, logout, hasPermission } = useAuth()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const isDrawer = variant === 'drawer'

  const { data: feedbackData } = useQuery(FEEDBACK_ENABLED)
  const feedbackEnabled = feedbackData?.feedbackEnabled ?? false

  const itemClass = isDrawer ? 'py-3' : 'py-2.5'

  return (
    <aside
      className={cn('flex flex-col bg-white', isDrawer ? 'h-full w-full pt-safe pb-safe' : 'w-64 border-r')}
      data-testid={isDrawer ? 'nav-drawer' : 'sidebar'}
    >
      <div className={cn('flex flex-col items-start gap-2 border-b py-4', isDrawer ? 'px-4 pr-14' : 'px-6')}>
        <img src="/vsx-logo.png" alt="VSX Vogel Software" className={isDrawer ? 'h-8' : 'h-10'} />
        <span className="text-lg font-semibold text-gray-900">Contract Manager</span>
      </div>
      {/* Search Bar - outside nav to avoid overflow clipping. In der Schublade
          uebernimmt die Kopfleiste die Suche. */}
      {!isDrawer && (
        <div className="relative px-4 pt-4 pb-1">
          <GlobalSearch />
        </div>
      )}
      <nav className={cn('flex-1 overflow-y-auto overscroll-contain space-y-1 px-4 pb-4', isDrawer && 'pt-3')}>
        {navItems
          .filter((item) => {
            if (!item.permission) return true
            const [resource, action] = item.permission.split('.')
            return hasPermission(resource, action)
          })
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                  itemClass,
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {t(item.labelKey)}
            </NavLink>
          ))}
      </nav>
      <div className="border-t p-4">
        <div className="mb-2 px-3">
          <p className="text-sm font-medium text-gray-900">{user?.firstName} {user?.lastName}</p>
          <p className="[overflow-wrap:anywhere] text-xs text-gray-500">{user?.email}</p>
          <p className="text-xs text-gray-400">{user?.companyName || user?.tenantName}</p>
        </div>
        {feedbackEnabled && (
          <button
            onClick={() => setFeedbackOpen(true)}
            className={cn('flex w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900', itemClass)}
          >
            <MessageSquarePlus className="h-5 w-5" />
            {t('feedback.menuItem')}
          </button>
        )}
        <button
          onClick={() => (isSsoSession() ? setSignOutOpen(true) : logout())}
          data-testid="sign-out"
          className={cn('flex w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900', itemClass)}
        >
          <LogOut className="h-5 w-5" />
          {t('auth.signOut')}
        </button>
      </div>

      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} onSignOutHere={logout} />
    </aside>
  )
}
