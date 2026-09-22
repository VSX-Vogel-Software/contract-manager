/**
 * Das Vier-Quadrate-Zeichen von Microsoft.
 *
 * Lucide fuehrt bewusst keine Markenlogos, und Microsofts Gestaltungsraster
 * fuer "Sign in with Microsoft" verlangt genau dieses Zeichen in den
 * Originalfarben neben der Beschriftung. Deshalb inline statt als Symbolsatz.
 */
export function MicrosoftLogo({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 21 21"
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}
