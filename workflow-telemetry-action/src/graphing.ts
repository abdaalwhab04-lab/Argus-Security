import { LineGraphOptions, StackedAreaGraphOptions } from './interfaces'

function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
}

function formatPlaceHolderImage(label: string, color: string): string {
  const hexColor = color.substring(0, 7).replace('#', '')
  const size = 14
  return `![${label}](https://placehold.co/${size}x${size}/${hexColor}/${hexColor})`
}

export async function getLineGraph(options: LineGraphOptions): Promise<string> {
  const payload = {
    options: {
      width: 1200,
      height: 350,
      xAxis: {
        label: 'Time'
      },
      yAxis: {
        label: options.label
      },
      timeTicks: {
        unit: 'auto'
      }
    },

    lines: [options.line]
  }

  const line = payload.lines[0]

  const chartContent = `\`\`\`mermaid
---
config:
  xyChart:
    width: ${payload.options.width}
    height: ${payload.options.height}
    xAxis:
      labelFontSize: 10
      showLabel: false
      showTick: true
  themeVariables:
    xyChart:
      plotColorPalette: '${line.color}'
---
xychart
  x-axis "${payload.options.xAxis.label}" [${line.points
    .map(point => formatTime(new Date(point.x)))
    .map(time => `"${time}"`)
    .join(', ')}]
  y-axis "${payload.options.yAxis.label}"
  line [${line.points.map(point => point.y).join(', ')}]
\`\`\``

  return chartContent.trim()
}

export async function getStackedAreaGraph(
  options: StackedAreaGraphOptions
): Promise<string> {
  const payload = {
    options: {
      width: 1200,
      height: 350,
      xAxis: {
        label: 'Time'
      },
      yAxis: {
        label: options.label
      },
      timeTicks: {
        unit: 'auto'
      }
    },
    areas: options.areas
  }

  const firstArea = payload.areas[0] // Assuming all areas have the same x values

  const stackedBars: number[][] = []

  for (const a of payload.areas) {
    // construct stacked bars by summing y values of current area and all previous areas
    const lastStackedBar =
      stackedBars.length > 0
        ? stackedBars[stackedBars.length - 1]
        : (new Array(a.points.length).fill(0) as number[])
    const currentStackedBar = a.points.map(
      (point, index) => point.y + lastStackedBar[index]
    )
    stackedBars.push(currentStackedBar)
  }

  const chartContent = `\`\`\`mermaid
---
config:
  xyChart:
    width: ${payload.options.width}
    height: ${payload.options.height}
    xAxis:
      labelFontSize: 10
      showLabel: false
      showTick: true
  themeVariables:
    xyChart:
      plotColorPalette: '${[...payload.areas]
        .reverse()
        .flatMap((area, i) => [
          area.color,
          `${area.color.substring(0, 7)}${((50 / payload.areas.length) * (i + 1) + 10 * (i + 1)).toFixed(0)}`
        ])
        .join(', ')}'
---
xychart
  x-axis "${payload.options.xAxis.label}" [${firstArea.points
    .map(point => formatTime(new Date(point.x)))
    .map(time => `"${time}"`)
    .join(', ')}]
  y-axis "${payload.options.yAxis.label}"
  ${[...stackedBars]
    .reverse()
    .flatMap(bar => [`line [${bar.join(', ')}]`, `bar [${bar.join(', ')}]`])
    .join('\n  ')}
\`\`\`
${payload.areas.map(area => `${formatPlaceHolderImage(area.label, area.color)} **${area.label}**`).join('\n')}
`

  return chartContent.trim()
}
