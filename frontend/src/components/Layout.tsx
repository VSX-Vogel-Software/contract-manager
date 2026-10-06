import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MessageSquare } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { MobileHeader, MobileNavDrawer, MobileSearch } from './MobileNav'
import { UpdateBanner } from './UpdateBanner'
import { ChatDrawer } from '@/features/assistant'
import { useAuth } from '@/lib/auth'
import { useIsDesktop } from '@/lib/useMediaQuery'

export function Layout() {
  const { t } = useTranslation()
  const [chatOpen, setChatOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { hasPermission } = useAuth()
  const canUseAssistant = hasPermission('assistant', 'use')
  // Seitenleiste und Schublade schliessen sich gegenseitig aus - nicht nur per
  // CSS, sonst laufen Tastaturkuerzel, Abfragen und Dialoge doppelt.
  const isDesktop = useIsDesktop()
  const location = useLocation()

  // Bei jedem Seitenwechsel Schublade und Suche schliessen
  useEffect(() => {
    setNavOpen(false)
    setSearchOpen(false)
  }, [location.pathname, location.search])

  return (
    <div className="flex h-dvh flex-col">
      <UpdateBanner />
      {!isDesktop && (
        <MobileHeader onOpenNav={() => setNavOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
      )}
      <div className="flex min-h-0 flex-1">
        {isDesktop && <Sidebar />}
        <main className="min-w-0 flex-1 overflow-auto overscroll-contain bg-gray-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))] lg:p-6" data-testid="main">
          <Outlet />
          {/* Platz unter dem Inhalt: der schwebende Chat-Knopf verdeckt sonst am
              Seitenende Knoepfe rechts unten (z. B. Speichern im Mahnwesen) */}
          {canUseAssistant && <div className="h-16" aria-hidden data-testid="chat-toggle-spacer" />}
        </main>
      </div>

      {!isDesktop && (
        <>
          <MobileNavDrawer open={navOpen} onOpenChange={setNavOpen} />
          <MobileSearch open={searchOpen} onOpenChange={setSearchOpen} />
        </>
      )}

      {/* Chat toggle button — bottom right */}
      {canUseAssistant && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          aria-label={t('mobile.openChat')}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-blue-700 sm:bottom-6 sm:right-6"
          data-testid="chat-toggle"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      {canUseAssistant && (
        <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
      )}
    </div>
  )
}
