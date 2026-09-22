import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'
import { dismissToast, getToasts, subscribeToToasts, type Toast as ToastData } from '@/lib/toastStore'

/**
 * Zeigt an, was sonst nur im Log stuende. Gefuettert wird der Speicher von
 * ueberall her, auch ausserhalb von React (siehe lib/apolloErrors.ts).
 */
export function Toaster() {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState<ToastData[]>(getToasts())

  useEffect(() => subscribeToToasts(setToasts), [])

  return (
    <ToastProvider duration={Infinity}>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          variant={toast.variant}
          data-testid={`toast-${toast.variant}`}
          onOpenChange={(open) => {
            if (!open) dismissToast(toast.id)
          }}
        >
          <div className="flex-1">
            <ToastTitle data-testid="toast-title">{toast.title}</ToastTitle>
            {toast.description && (
              <ToastDescription data-testid="toast-description">
                {toast.description}
              </ToastDescription>
            )}
          </div>
          <ToastClose aria-label={t('common.close')} data-testid="toast-close" />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
