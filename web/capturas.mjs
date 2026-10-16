import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright-core'

const projectDirectory = path.dirname(fileURLToPath(import.meta.url))
const outputDirectory = path.resolve(projectDirectory, '..', 'capturas')
const applicationUrl = process.env.APP_URL ?? 'http://127.0.0.1:5173/'
const questions = [
  {
    name: '01-comparacion',
    question:
      'Quiero un portátil para ofimática, estudiar y videollamadas. Compara las gamas baja, media y alta. Dame una valoración general puntuando cada ordenador.',
    answerMustContain: ['6,8/10', '8,7/10', '8,1/10'],
  },
  {
    name: '02-precios',
    question: '¿Qué precio tiene cada uno? ¿Merece la pena pagar la diferencia?',
    answerMustContain: ['449', '849', '1.699'],
  },
  {
    name: '03-canales-de-compra',
    question: '¿Dónde puedo comprarlos?',
    answerMustContain: ['Nova Store', 'Atlas Store', 'Orbit Store'],
  },
]
const unavailableQuestion =
  'Me quedo con el Atlas Equilibrio 14. ¿Cuál es su fecha de fabricación?'

async function captureConversation(page, messageIndex, screenshotPath) {
  await page.evaluate((index) => {
    document.querySelector('#evidence-capture')?.remove()
    const prompt = document.querySelectorAll('.user-message')[index]
    const answer = document.querySelectorAll('.answer-card')[index]
    if (!prompt || !answer) {
      throw new Error(`No se encontró la pregunta o respuesta ${index + 1}.`)
    }

    const panel = document.createElement('section')
    panel.id = 'evidence-capture'
    panel.style.cssText =
      'position:fixed;z-index:2147483647;left:20px;top:20px;width:1326px;max-width:calc(100vw - 40px);padding:24px 32px;background:#fff;border:1px solid #d8e1e2;border-radius:14px;box-shadow:0 12px 36px #1f414a18;box-sizing:border-box;font-family:Segoe UI,Arial,sans-serif;color:#172b35;'

    const header = document.createElement('header')
    header.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;padding-bottom:13px;border-bottom:1px solid #e0e7e8;'
    const brand = document.createElement('strong')
    brand.textContent = 'umbral · conversación documentada'
    brand.style.cssText = 'font-size:16px;letter-spacing:-.4px;'
    const tag = document.createElement('span')
    tag.textContent = 'RESPUESTA BASADA EN FUENTES'
    tag.style.cssText =
      'padding:5px 8px;border:1px solid #cee4d6;border-radius:5px;background:#eaf5ee;color:#326449;font-size:9px;letter-spacing:.08em;'
    header.append(brand, tag)
    panel.append(header, prompt.cloneNode(true), answer.cloneNode(true))
    document.body.append(panel)
  }, messageIndex)

  try {
    await page.locator('#evidence-capture').screenshot({
      path: screenshotPath,
      animations: 'disabled',
    })
  } finally {
    await page.locator('#evidence-capture').evaluate((element) => element.remove())
  }
}

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
})

try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    deviceScaleFactor: 1,
  })
  page.setDefaultTimeout(60_000)

  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  const initialResponse = await page.goto(applicationUrl, {
    waitUntil: 'networkidle',
  })
  if (!initialResponse?.ok()) {
    throw new Error(
      `La aplicación no respondió correctamente en ${applicationUrl} (${initialResponse?.status() ?? 'sin respuesta'}).`,
    )
  }
  await page.locator('.nav-count').waitFor()
  await page.getByRole('button', { name: /01 Quiero un portátil/ }).waitFor()

  const results = []

  for (const [index, item] of questions.entries()) {
    if (index === 0) {
      await page.locator('.suggestion').first().click()
    } else {
      await page.locator('#question-input').fill(item.question)
      await page.locator('.send-button').click()
    }

    const answerCard = page.locator('.answer-card').nth(index)
    await answerCard.waitFor()
    await answerCard.locator('.source-card').first().waitFor()
    await page.waitForFunction(
      () => document.querySelector('.loading-answer') === null,
    )
    const answer = (await answerCard.locator('.answer-text').innerText()).trim()
    const citations = await answerCard.locator('.source-card').evaluateAll((cards) =>
      cards.map((card) => ({
        id: card.querySelector('.source-id')?.textContent?.trim() ?? '',
        title: card.querySelector('.source-info strong')?.textContent?.trim() ?? '',
        section: card.querySelector('.source-info small')?.textContent?.trim() ?? '',
        excerpt: card.querySelector('blockquote')?.textContent?.trim() ?? '',
      })),
    )

    for (const expected of item.answerMustContain) {
      if (!answer.includes(expected)) {
        throw new Error(
          `La respuesta a "${item.question}" no incluye el dato esperado "${expected}". Respuesta: ${answer}`,
        )
      }
    }
    if (citations.length === 0 || citations.some((citation) => !citation.excerpt)) {
      throw new Error(`La respuesta ${item.name} no muestra fragmentos de fuente.`)
    }

    const screenshotPath = path.join(outputDirectory, `${item.name}.png`)
    await captureConversation(page, index, screenshotPath)
    results.push({
      screenshot: path.relative(path.resolve(projectDirectory, '..'), screenshotPath),
      question: item.question,
      answer,
      citations,
    })
    console.log(`CAPTURA ${item.name}: ${screenshotPath}`)
    console.log(`RESPUESTA: ${answer}`)
    console.log(`FUENTES: ${citations.map((citation) => `${citation.id} ${citation.section}`).join('; ')}`)
  }

  await page.locator('#question-input').fill(unavailableQuestion)
  await page.locator('.send-button').click()
  const unavailableCard = page.locator('.answer-card').nth(questions.length)
  await unavailableCard.waitFor()
  await unavailableCard.getByRole('heading', { name: 'No consta en los datos.' }).waitFor()
  await unavailableCard.locator('.source-card').first().waitFor()
  await page.waitForFunction(
    () => document.querySelector('.loading-answer') === null,
  )
  const unavailableCitations = await unavailableCard
    .locator('.source-card')
    .evaluateAll((cards) =>
      cards.map((card) => ({
        id: card.querySelector('.source-id')?.textContent?.trim() ?? '',
        title: card.querySelector('.source-info strong')?.textContent?.trim() ?? '',
        section: card.querySelector('.source-info small')?.textContent?.trim() ?? '',
        excerpt: card.querySelector('blockquote')?.textContent?.trim() ?? '',
      })),
    )
  if (
    !unavailableCitations.some(
      (citation) =>
        citation.id.includes('A01') &&
        citation.excerpt.includes('Fecha de fabricación: no indicada'),
    )
  ) {
    throw new Error('La abstención no muestra la fuente que indica que la fecha no consta.')
  }

  const unavailableScreenshot = path.join(outputDirectory, '04-no-consta.png')
  await captureConversation(page, questions.length, unavailableScreenshot)
  results.push({
    screenshot: path.relative(
      path.resolve(projectDirectory, '..'),
      unavailableScreenshot,
    ),
    question: unavailableQuestion,
    answer: await unavailableCard.locator('.unknown-notice').innerText(),
    citations: unavailableCitations,
  })
  console.log(`CAPTURA 04-no-consta: ${unavailableScreenshot}`)
  console.log(`RESPUESTA: ${results.at(-1).answer.replace(/\s+/g, ' ')}`)
  console.log(
    `FUENTES: ${unavailableCitations.map((citation) => `${citation.id} ${citation.section}`).join('; ')}`,
  )

  await page.locator('.nav-link').nth(1).click()
  await page.getByRole('heading', { name: 'Detrás de cada respuesta.' }).waitFor()
  await page.locator('.document-card').first().waitFor()
  const documentCount = await page.locator('.document-card').count()
  if (documentCount !== 6) {
    throw new Error(`La biblioteca debería mostrar seis documentos, pero muestra ${documentCount}.`)
  }
  const libraryScreenshot = path.join(outputDirectory, '05-documentos.png')
  await page.screenshot({ path: libraryScreenshot, fullPage: false })
  results.push({
    screenshot: path.relative(
      path.resolve(projectDirectory, '..'),
      libraryScreenshot,
    ),
    title: 'Biblioteca de fuentes',
    documentCount,
    documents: await page.locator('.document-card h2').allInnerTexts(),
  })
  console.log(`CAPTURA 05-documentos: ${libraryScreenshot} (${documentCount} documentos)`)

  if (errors.length > 0) {
    throw new Error(`La aplicación registró errores JavaScript: ${errors.join('; ')}`)
  }
  console.log(`RESULTADOS_JSON=${JSON.stringify(results)}`)
} finally {
  await browser.close()
}
