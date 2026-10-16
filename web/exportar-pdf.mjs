import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright-core'

const webDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(webDirectory, '..')
const htmlPath = path.join(projectDirectory, 'entregable.html')
const pdfPath = path.join(projectDirectory, 'entregable.pdf')

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
})

try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    deviceScaleFactor: 1,
  })
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' })
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      [...document.images].map(async (image) => {
        if (!image.complete) {
          await new Promise((resolve, reject) => {
            image.addEventListener('load', resolve, { once: true })
            image.addEventListener('error', reject, { once: true })
          })
        }
        if (image.naturalWidth === 0) {
          throw new Error(`No se pudo cargar la imagen: ${image.src}`)
        }
      }),
    )
  })
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
  })

  const pdf = (await readFile(pdfPath)).toString('latin1')
  const pageCount = [...pdf.matchAll(/\/Type\s*\/Page\b/g)].length
  if (pageCount === 0) {
    throw new Error('No se pudo determinar el número de páginas del PDF generado.')
  }
  console.log(`PDF: ${pdfPath}`)
  console.log(`PÁGINAS A4: ${pageCount}`)
} finally {
  await browser.close()
}
