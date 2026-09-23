import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmailSendStatus } from './EmailSendStatus'

/**
 * Der Versand laeuft asynchron — scheitert er, gibt es keinen Request mehr, dem
 * man einen Toast zeigen koennte. Diese Anzeige ist der Ersatz, und sie muss
 * genau dann erscheinen, wenn ein Grund vorliegt: sonst sieht ein gescheiterter
 * Versand aus wie ein nie angestossener.
 */
describe('EmailSendStatus', () => {
  it('zeigt Grund und Zeitpunkt bei einem Fehlschlag', () => {
    render(
      <EmailSendStatus
        emailError="AADSTS7000222: client secret expired"
        emailLastAttemptAt="2026-09-23T10:15:00Z"
      />
    )

    expect(screen.getByTestId('email-send-error')).toBeInTheDocument()
    expect(screen.getByText(/AADSTS7000222/)).toBeInTheDocument()
  })

  it('rendert nichts, wenn kein Fehler vorliegt', () => {
    const { container } = render(<EmailSendStatus emailError="" emailLastAttemptAt={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('rendert nichts, wenn noch nie versendet wurde', () => {
    const { container } = render(<EmailSendStatus />)

    expect(container).toBeEmptyDOMElement()
  })

  it('kommt ohne Zeitpunkt aus', () => {
    render(<EmailSendStatus emailError="boom" />)

    expect(screen.getByTestId('email-send-error')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})
