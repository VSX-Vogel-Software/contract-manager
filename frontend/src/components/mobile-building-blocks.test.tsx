import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { setViewportWidth } from '@/test/setup'
import { MobileCard, MobileCardList } from './MobileCard'
import { PdfPreview } from './PdfPreview'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

describe('MobileCard', () => {
  it('verlinkt die Karte und haelt Aktionen ausserhalb des Links', () => {
    render(
      <MemoryRouter>
        <MobileCardList data-testid="list">
          <MobileCard
            to="/contracts/7"
            title="Wartungsvertrag"
            badge={<span>Aktiv</span>}
            subtitle="Muster GmbH"
            meta="01.01.2026"
            amount="1.234,00 €"
            actions={<button>Bearbeiten</button>}
          />
        </MobileCardList>
      </MemoryRouter>
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/contracts/7')
    expect(link).toHaveTextContent('Wartungsvertrag')
    expect(link).toHaveTextContent('1.234,00 €')
    expect(link).not.toContainElement(screen.getByRole('button', { name: 'Bearbeiten' }))
    // nur unterhalb von md sichtbar
    expect(screen.getByTestId('list')).toHaveClass('md:hidden')
  })
})

describe('PdfPreview', () => {
  it('bettet auf dem Desktop ein iframe ein', () => {
    render(<PdfPreview src="blob:x" title="Rechnung" className="h-[600px]" />)
    expect(screen.getByTitle('Rechnung').tagName).toBe('IFRAME')
  })

  it('zeigt auf Touch-Geraeten einen Oeffnen-Link statt des iframes', () => {
    setViewportWidth(390)
    render(<PdfPreview src="blob:x" title="Rechnung" />)
    expect(screen.queryByTitle('Rechnung')).not.toBeInTheDocument()
    const [open, download] = screen.getAllByRole('link')
    expect(open).toHaveAttribute('href', 'blob:x')
    expect(open).toHaveAttribute('target', '_blank')
    expect(download).toHaveAttribute('download', 'Rechnung.pdf')
  })
})

describe('Tooltip auf Touch', () => {
  it('oeffnet per Antippen', async () => {
    setViewportWidth(390)
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Info</TooltipTrigger>
          <TooltipContent>Erklaerung zum KPI</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
    expect(screen.queryByText('Erklaerung zum KPI')).not.toBeInTheDocument()
    await user.click(screen.getByText('Info'))
    expect(await screen.findByText('Erklaerung zum KPI')).toBeInTheDocument()
  })
})
