/* eslint-disable no-console */
import { beforeAll, describe, expect, test } from 'vitest'
import { getLineGraph, getStackedAreaGraph } from '../src/graphing'
import { faker } from '@faker-js/faker'

const BLACK = '#000000'

const arrayRange = (start: number, stop: number, step = 1): number[] =>
  Array.from(
    { length: (stop - start) / step + 1 },
    (_, index) => start + index * step
  )

beforeAll(() => {
  faker.seed(123)
  faker.setDefaultRefDate(new Date('2024-01-01T00:00:00.000Z'))
})

describe('getLineGraph', () => {
  test('getLineGraph should return a graph response', async () => {
    const axisColor = BLACK

    const startingTimestamp = faker.date.recent().getTime()

    const range = arrayRange(1, 99)

    const networkReadX = range.map(n => ({
      x: n * 1000 + startingTimestamp,
      y: faker.number.int({ min: 1, max: 100 })
    }))

    const result = await getLineGraph({
      label: 'Network I/O Read (MB)',
      axisColor,
      line: {
        label: 'Read',
        color: '#be4d25',
        points: networkReadX
      }
    })

    expect(result.length).toBeGreaterThan(100) // Not empty
    expect(result.length).toBeLessThan(65000) // 65k

    expect(result).toMatchSnapshot()
  })
})

describe('getStackedAreaGraph', () => {
  test('getStackedAreaGraph should return a graph response', async () => {
    const axisColor = BLACK

    const startingTimestamp = faker.date.recent().getTime()

    const range = arrayRange(1, 99)

    const userLoadX = range.map(n => ({
      x: n * 1000 + startingTimestamp,
      y: faker.number.int({ min: 1, max: 100 })
    }))

    const systemLoadX = range.map(n => ({
      x: n * 1000 + startingTimestamp,
      y: 100 - userLoadX.at(n - 1)!.y
    }))

    const result = await getStackedAreaGraph({
      label: 'CPU Load (%)',
      axisColor,
      areas: [
        {
          label: 'User Load',
          color: '#e41a1c99',
          points: userLoadX
        },
        {
          label: 'System Load',
          color: '#ff7f0099',
          points: systemLoadX
        }
      ]
    })

    expect(result.length).toBeGreaterThan(100) // Not empty
    expect(result.length).toBeLessThan(65000) // 65k

    expect(result).toMatchSnapshot()
  })
})
