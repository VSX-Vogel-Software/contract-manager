import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Menu, Search, X } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { GlobalSearch, Sidebar } from './Sidebar'

/** Tippziele im App-Rahmen: mindestens 44 px (Apple HIG / WCAG 2.5.5). */
const iconButton =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'

interface MobileHeaderProps {
  onOpenNav: () => void
  onOpenSearch: () => void
}

/** Kopfleiste unterhalb von `lg`: Menue, Name, Suche. */
export function MobileHeader({ onOpenNav, onOpenSearch }: MobileHeaderProps) {
  const { t } = useTranslation()
  return (
    <header
      className="flex shrink-0 items-center gap-1 border-b bg-white pt-safe pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]"
      data-testid="mobile-header"
    >
      <button
        type="button"
        onClick={onOpenNav}
        className={iconButton}
        aria-label={t('mobile.openMenu')}
        data-testid="mobile-menu-button"
      >
        <Menu className="h-6 w-6" />
      </button>
      <Link to="/" className="flex min-w-0 flex-1 items-center gap-2 py-2">
        <img src="/vsx-logo.png" alt="" className="h-7 shrink-0" />
        <span className="truncate text-base font-semibold text-gray-900">Contract Manager</span>
      </Link>
      <button
        type="button"
        onClick={onOpenSearch}
        className={iconButton}
        aria-label={t('mobile.search')}
        data-testid="mobile-search-button"
      >
        <Search className="h-5 w-5" />
      </button>
    </header>
  )
}

interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Ausfahrbare Navigation mit demselben Inhalt wie die Seitenleiste. */
export function MobileNavDrawer({ open, onOpenChange }: DrawerProps) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[85vw] max-w-xs flex-col gap-0 p-0 sm:max-w-xs"
        aria-describedby={undefined}
      >
        <SheetTitle className="sr-only">{t('mobile.navigation')}</SheetTitle>
        <Sidebar variant="drawer" onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}

/** Vollbild-Suche fuer Telefon und Tablet. */
export function MobileSearch({ open, onOpenChange }: DrawerProps) {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col bg-white pt-safe pb-safe pl-safe pr-safe sm:inset-x-auto sm:left-1/2 sm:top-4 sm:bottom-auto sm:h-[min(36rem,calc(100dvh-2rem))] sm:w-[32rem] sm:-translate-x-1/2 sm:rounded-lg sm:shadow-xl"
          aria-describedby={undefined}
          data-testid="mobile-search"
        >
          <DialogPrimitive.Title className="sr-only">{t('mobile.search')}</DialogPrimitive.Title>
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <GlobalSearch
              variant="inline"
              autoFocus
              onNavigate={() => onOpenChange(false)}
              trailing={
                <DialogPrimitive.Close className={iconButton} aria-label={t('common.close')}>
                  <X className="h-5 w-5" />
                </DialogPrimitive.Close>
              }
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
