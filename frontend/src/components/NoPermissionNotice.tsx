import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Erklaert eine leere Flaeche, statt sie leer zu lassen.
 *
 * Bewusst in der Flaeche statt als Meldung am Bildrand: Der Benutzer soll auch
 * dann noch verstehen, warum hier nichts steht, wenn eine kurze Einblendung
 * laengst verschwunden waere.
 */
export function NoPermissionNotice({ description }: { description?: string }) {
  const { t } = useTranslation()

  return (
    <div
      data-testid="no-permission-notice"
      className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-white px-6 py-12 text-center"
    >
      <Lock className="mb-3 h-8 w-8 text-gray-400" />
      <p className="text-sm font-medium text-gray-900">{t('common.noPermission')}</p>
      <p className="mt-1 max-w-md text-sm text-gray-500">
        {description ?? t('common.noPermissionHint')}
      </p>
    </div>
  )
}
