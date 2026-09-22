import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Toaster } from './Toaster'
import { pushToast, getToasts, resetToasts } from '@/lib/toastStore'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('Toaster', () => {
  beforeEach(() => {
    resetToasts()
  })

  afterEach(() => {
    resetToasts()
  })

  it('shows nothing until something goes wrong', () => {
    render(<Toaster />)

    expect(screen.queryByTestId('toast-error')).not.toBeInTheDocument()
  })

  it('renders a pushed error with its reason', () => {
    render(<Toaster />)

    act(() => {
      pushToast({ title: 'Fehler', description: 'Failed to send email: 403 Forbidden' })
    })

    expect(screen.getByTestId('toast-error')).toBeInTheDocument()
    expect(screen.getByTestId('toast-title')).toHaveTextContent('Fehler')
    expect(screen.getByTestId('toast-description')).toHaveTextContent(
      'Failed to send email: 403 Forbidden'
    )
  })

  it('lets the user close it, which also clears the store', async () => {
    const user = userEvent.setup()
    render(<Toaster />)

    act(() => {
      pushToast({ title: 'Fehler', description: 'Serverfehler' })
    })

    await user.click(screen.getByTestId('toast-close'))

    expect(getToasts()).toHaveLength(0)
  })

  it('renders several distinct errors at once', () => {
    render(<Toaster />)

    act(() => {
      pushToast({ title: 'Fehler', description: 'Erster' })
      pushToast({ title: 'Fehler', description: 'Zweiter' })
    })

    expect(screen.getAllByTestId('toast-error')).toHaveLength(2)
  })
})
