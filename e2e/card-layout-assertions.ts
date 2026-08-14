import { expect, type Locator } from '@playwright/test'

export async function expectValidCardGeometry(cards: Locator) {
  const problems = await cards.evaluateAll((cardElements) => {
    const issues: string[] = []

    cardElements.forEach((card, cardIndex) => {
      const cardBounds = card.getBoundingClientRect()
      const cardCenter = {
        x: cardBounds.left + cardBounds.width / 2,
        y: cardBounds.top + cardBounds.height / 2,
      }
      const cardRadius = cardBounds.width / 2
      const buttons = Array.from(
        card.querySelectorAll<HTMLButtonElement>('button[data-symbol-id]'),
      )
      const fontSizes = buttons.map((button) =>
        Number.parseFloat(getComputedStyle(button).fontSize),
      )

      if (Math.max(...fontSizes) < 55) {
        issues.push(`card ${cardIndex} does not contain a large symbol`)
      }

      if (Math.max(...fontSizes) - Math.min(...fontSizes) < 25) {
        issues.push(`card ${cardIndex} does not vary symbol sizes`)
      }

      const symbols = buttons.map((button) => {
        const bounds = button.getBoundingClientRect()
        const glyph = button.firstElementChild
        const styles = getComputedStyle(button)
        const radius = Math.max(bounds.width, bounds.height) / 2
        const center = {
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        }

        if (Math.min(bounds.width, bounds.height) < 47.5) {
          issues.push(`card ${cardIndex} has a target below 48px`)
        }

        if (
          Math.hypot(center.x - cardCenter.x, center.y - cardCenter.y) +
            radius >
          cardRadius - 1
        ) {
          issues.push(`card ${cardIndex} has a target outside its edge`)
        }

        if (styles.overflow !== 'visible') {
          issues.push(`card ${cardIndex} clips a symbol button`)
        }

        if (
          styles.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
          styles.backgroundColor !== 'transparent'
        ) {
          issues.push(`card ${cardIndex} has a persistent symbol background`)
        }

        if (styles.boxShadow !== 'none') {
          issues.push(`card ${cardIndex} has a persistent symbol shadow`)
        }

        if (Number.parseFloat(styles.borderTopWidth) !== 0) {
          issues.push(`card ${cardIndex} has a persistent symbol border`)
        }

        if (glyph instanceof HTMLElement) {
          const glyphBounds = glyph.getBoundingClientRect()
          const glyphCenter = {
            x: glyphBounds.left + glyphBounds.width / 2,
            y: glyphBounds.top + glyphBounds.height / 2,
          }
          const glyphStyles = getComputedStyle(glyph)
          const transform = new DOMMatrixReadOnly(glyphStyles.transform)
          const halfWidth = glyph.offsetWidth / 2
          const halfHeight = glyph.offsetHeight / 2
          const corners = [
            [-halfWidth, -halfHeight],
            [halfWidth, -halfHeight],
            [halfWidth, halfHeight],
            [-halfWidth, halfHeight],
          ]

          for (const [x = 0, y = 0] of corners) {
            const transformedX = transform.a * x + transform.c * y
            const transformedY = transform.b * x + transform.d * y
            const distanceFromCardCenter = Math.hypot(
              glyphCenter.x + transformedX - cardCenter.x,
              glyphCenter.y + transformedY - cardCenter.y,
            )

            if (distanceFromCardCenter > cardRadius + 1) {
              issues.push(
                `card ${cardIndex} template ${card.getAttribute('data-layout-template')} slot ${button.dataset.layoutSlot} symbol ${button.dataset.symbolId} has a glyph corner outside its edge`,
              )
              break
            }
          }
        }

        return { center, radius }
      })

      symbols.forEach((symbol, symbolIndex) => {
        for (let otherIndex = 0; otherIndex < symbolIndex; otherIndex += 1) {
          const otherSymbol = symbols[otherIndex]

          if (
            otherSymbol &&
            Math.hypot(
              symbol.center.x - otherSymbol.center.x,
              symbol.center.y - otherSymbol.center.y,
            ) <
              symbol.radius + otherSymbol.radius - 1
          ) {
            issues.push(`card ${cardIndex} has overlapping targets`)
          }
        }
      })
    })

    return issues
  })

  expect(problems).toEqual([])
}

export async function expectStableSymbolHover(symbol: Locator) {
  const beforeHover = await documentBounds(symbol)

  await symbol.hover()

  expect(await documentBounds(symbol)).toEqual(beforeHover)
}

function documentBounds(symbol: Locator) {
  return symbol.evaluate((element) => {
    const bounds = element.getBoundingClientRect()

    return {
      height: bounds.height,
      width: bounds.width,
      x: bounds.x + window.scrollX,
      y: bounds.y + window.scrollY,
    }
  })
}
