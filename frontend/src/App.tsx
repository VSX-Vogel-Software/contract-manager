import { lazy, Suspense, type ComponentType } from 'react'
import { Routes, Route, matchPath } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ChunkErrorBoundary, PageLoading } from './components/ChunkErrorBoundary'

/**
 * Seite per React.lazy laden - jede Route ist ein eigener Chunk, das
 * Startbundle enthaelt nur Rahmen (Layout, Anmeldung, Apollo). `preload`
 * startet den Download vorab, ohne zu rendern.
 */
function lazyPage<M extends Record<string, any>>(load: () => Promise<M>, name: keyof M) {
  const Page = lazy(() => load().then((m) => ({ default: m[name] as ComponentType<any> })))
  return Object.assign(Page, { preload: load })
}

const Login = lazyPage(() => import('./features/auth/Login'), 'Login')
const AcceptInvitation = lazyPage(() => import('./features/auth/AcceptInvitation'), 'AcceptInvitation')
const ResetPassword = lazyPage(() => import('./features/auth/ResetPassword'), 'ResetPassword')
const ForgotPassword = lazyPage(() => import('./features/auth/ForgotPassword'), 'ForgotPassword')
const TwoFactorSetup = lazyPage(() => import('./features/auth/TwoFactorSetup'), 'TwoFactorSetup')
const SignupPage = lazyPage(() => import('./features/auth/SignupPage'), 'SignupPage')
const VerifySignup = lazyPage(() => import('./features/auth/VerifySignup'), 'VerifySignup')
const Dashboard = lazyPage(() => import('./features/dashboard/Dashboard'), 'Dashboard')
const NewBusinessDetailPage = lazyPage(() => import('./features/dashboard/NewBusinessDetailPage'), 'NewBusinessDetailPage')
const CustomerList = lazyPage(() => import('./features/customers/CustomerList'), 'CustomerList')
const CustomerDetail = lazyPage(() => import('./features/customers/CustomerDetail'), 'CustomerDetail')
const ProductList = lazyPage(() => import('./features/products/ProductList'), 'ProductList')
const ContractList = lazyPage(() => import('./features/contracts/ContractList'), 'ContractList')
const ContractForm = lazyPage(() => import('./features/contracts/ContractForm'), 'ContractForm')
const ContractDetail = lazyPage(() => import('./features/contracts/ContractDetail'), 'ContractDetail')
const ForecastsPage = lazyPage(() => import('./features/forecasts/ForecastsPage'), 'ForecastsPage')
const SettingsLayout = lazyPage(() => import('./features/settings/SettingsLayout'), 'SettingsLayout')
const ContractImport = lazyPage(() => import('./features/contracts/import/ContractImport'), 'ContractImport')
const InvoiceExportPage = lazyPage(() => import('./features/invoices/InvoiceExportPage'), 'InvoiceExportPage')
const InvoiceDetail = lazyPage(() => import('./features/invoices/InvoiceDetail'), 'InvoiceDetail')
const InvoiceList = lazyPage(() => import('./features/invoices/InvoiceList'), 'InvoiceList')
const AuditLogPage = lazyPage(() => import('./features/audit/AuditLogPage'), 'AuditLogPage')
const BankingPage = lazyPage(() => import('./features/banking/BankingPage'), 'BankingPage')
const CostCenterReportPage = lazyPage(() => import('./features/banking/CostCenterReportPage'), 'CostCenterReportPage')
const CounterpartyDetailPage = lazyPage(() => import('./features/banking/CounterpartyDetailPage'), 'CounterpartyDetailPage')
const TodoBoard = lazyPage(() => import('./features/todos/TodoBoard'), 'TodoBoard')
const AboutPage = lazyPage(() => import('./features/about/AboutPage'), 'AboutPage')
const ProjectList = lazyPage(() => import('./features/projects/ProjectList'), 'ProjectList')
const OfferList = lazyPage(() => import('./features/offers/OfferList'), 'OfferList')
const OfferDetail = lazyPage(() => import('./features/offers/OfferDetail'), 'OfferDetail')
const DepartmentAnalysis = lazyPage(() => import('./features/contracts/DepartmentAnalysis'), 'DepartmentAnalysis')
const IncomingInvoicesPage = lazyPage(() => import('./features/incoming-invoices/IncomingInvoicesPage'), 'IncomingInvoicesPage')
const OrderConfirmationDetail = lazyPage(() => import('./features/contracts/OrderConfirmationDetail'), 'OrderConfirmationDetail')
const AttachmentPermalink = lazyPage(() => import('./features/contracts/AttachmentPermalink'), 'AttachmentPermalink')

type LazyPage = ReturnType<typeof lazyPage>

/** Seiten ohne Anmeldung (ohne Layout) */
const publicRoutes: Array<[string, LazyPage]> = [
  ['/login', Login],
  // Notweg: funktioniert unabhaengig von der Ausfallerkennung
  ['/login/local', Login],
  ['/invite/:token', AcceptInvitation],
  ['/reset-password/:token', ResetPassword],
  ['/forgot-password', ForgotPassword],
  ['/setup-2fa', TwoFactorSetup],
  ['/signup', SignupPage],
  ['/verify-signup', VerifySignup],
]

/** Seiten im Layout, Pfade relativ zu "/" ("" = Startseite) */
const appRoutes: Array<[string, LazyPage]> = [
  ['', Dashboard],
  ['dashboard/new-business/:metricType', NewBusinessDetailPage],
  ['customers', CustomerList],
  ['customers/:id', CustomerDetail],
  ['products', ProductList],
  ['contracts', ContractList],
  ['contracts/new', ContractForm],
  ['contracts/:id', ContractDetail],
  ['contracts/:id/edit', ContractForm],
  ['contracts/:id/order-confirmation/:abId', OrderConfirmationDetail],
  ['projects', ProjectList],
  ['forecasts', ForecastsPage],
  ['department-analysis', DepartmentAnalysis],
  ['settings/*', SettingsLayout],
  ['contracts/import', ContractImport],
  ['invoices/export', InvoiceExportPage],
  ['invoices/:id', InvoiceDetail],
  ['invoices', InvoiceList],
  ['offers/:id', OfferDetail],
  ['offers', OfferList],
  ['incoming-invoices', IncomingInvoicesPage],
  ['banking', BankingPage],
  ['banking/counterparty/:id', CounterpartyDetailPage],
  ['banking/cost-center-report', CostCenterReportPage],
  ['audit-log', AuditLogPage],
  ['todos', TodoBoard],
  ['attachments/:id', AttachmentPermalink],
  ['about', AboutPage],
]

/**
 * Chunk der Seite unter `pathname` schon beim Start anstossen - parallel zu
 * Anmeldung und Sprachdatei statt erst danach. Statische Segmente gehen vor
 * Parametern (wie im Router: "contracts/new" vor "contracts/:id").
 */
export function preloadRoute(pathname: string) {
  const candidates = [
    ...publicRoutes,
    ...appRoutes.map(([path, page]) => ['/' + path, page] as [string, LazyPage]),
  ].filter(([path]) => matchPath({ path, end: true }, pathname))
  candidates.sort(([a], [b]) => (a.match(/[:*]/g)?.length ?? 0) - (b.match(/[:*]/g)?.length ?? 0))
  candidates[0]?.[1].preload().catch(() => {
    // Fehler zeigt beim Rendern die ChunkErrorBoundary
  })
}

function App() {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          {publicRoutes.map(([path, Page]) => (
            <Route key={path} path={path} element={<Page />} />
          ))}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {appRoutes.map(([path, Page]) =>
              path === '' ? (
                <Route key="index" index element={<Page />} />
              ) : (
                <Route key={path} path={path} element={<Page />} />
              )
            )}
          </Route>
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  )
}

export default App
