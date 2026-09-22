// Rendert das Favicon in Originalgroesse, damit man beurteilen kann, ob es
// bei 16 px noch lesbar ist. Kein Test - Hilfsskript.
//   docker compose exec frontend node e2e/favicon-preview.mjs
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/favicon.svg', 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 8 })

for (const size of [16, 32, 64]) {
  await page.setContent(
    `<body style="margin:0;background:#e5e7eb">
       <div style="width:${size}px;height:${size}px">${svg}</div>
     </body>`
  )
  await page.locator('div').screenshot({ path: `/tmp/favicon-${size}.png` })
  console.log(`geschrieben: /tmp/favicon-${size}.png (${size}px, 8-fach vergroessert)`)
}

await browser.close()
