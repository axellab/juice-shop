/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import * as frisby from 'frisby'
import { expect } from '@jest/globals'

const URL = 'http://localhost:3000'
const REST_URL = `${URL}/rest/`

describe('/data-processing', () => {
  describe('/health', () => {
    it('GET health check returns healthy status', () => {
      return frisby.get(REST_URL + 'data-processing/health')
        .expect('status', 200)
        .expect('json', 'status', 'healthy')
        .expect('json', 'service', 'data-processing')
    })
  })

  describe('/operations', () => {
    it('GET available operations returns list of operations', () => {
      return frisby.get(REST_URL + 'data-processing/operations')
        .expect('status', 200)
        .expect('json', 'status', 'success')
        .promise()
        .then(({ json }) => {
          expect(json.operations).toBeDefined()
          expect(Array.isArray(json.operations)).toBe(true)
          expect(json.operations.length).toBeGreaterThan(0)
        })
    })
  })

  describe('/process', () => {
    it('POST uppercase transformation works correctly', () => {
      return frisby.post(REST_URL + 'data-processing/process', {
        body: {
          operation: 'uppercase',
          data: 'hello world'
        }
      })
        .expect('status', 200)
        .expect('json', 'status', 'success')
        .expect('json', 'result', 'HELLO WORLD')
    })

    it('POST lowercase transformation works correctly', () => {
      return frisby.post(REST_URL + 'data-processing/process', {
        body: {
          operation: 'lowercase',
          data: 'HELLO WORLD'
        }
      })
        .expect('status', 200)
        .expect('json', 'status', 'success')
        .expect('json', 'result', 'hello world')
    })

    it('POST filter operation filters array correctly', () => {
      return frisby.post(REST_URL + 'data-processing/process', {
        body: {
          operation: 'filter',
          data: [
            { name: 'John', age: 30 },
            { name: 'Jane', age: 25 },
            { name: 'Bob', age: 30 }
          ],
          options: {
            conditions: { age: 30 }
          }
        }
      })
        .expect('status', 200)
        .expect('json', 'status', 'success')
        .promise()
        .then(({ json }) => {
          expect(json.result.length).toBe(2)
          expect(json.result[0].name).toBe('John')
          expect(json.result[1].name).toBe('Bob')
        })
    })

    it('POST map operation maps fields correctly', () => {
      return frisby.post(REST_URL + 'data-processing/process', {
        body: {
          operation: 'map',
          data: [
            { name: 'John', age: 30, city: 'NYC' },
            { name: 'Jane', age: 25, city: 'LA' }
          ],
          options: {
            fields: ['name', 'age']
          }
        }
      })
        .expect('status', 200)
        .expect('json', 'status', 'success')
        .promise()
        .then(({ json }) => {
          expect(json.result.length).toBe(2)
          expect(json.result[0].city).toBeUndefined()
          expect(json.result[0].name).toBe('John')
          expect(json.result[0].age).toBe(30)
        })
    })

    it('POST aggregate operation aggregates data correctly', () => {
      return frisby.post(REST_URL + 'data-processing/process', {
        body: {
          operation: 'aggregate',
          data: [
            { category: 'A', value: 10 },
            { category: 'A', value: 20 },
            { category: 'B', value: 15 }
          ],
          options: {
            groupBy: 'category',
            sumFields: ['value']
          }
        }
      })
        .expect('status', 200)
        .expect('json', 'status', 'success')
        .promise()
        .then(({ json }) => {
          expect(json.result.length).toBe(2)
          const categoryA = json.result.find((item: any) => item.category === 'A')
          const categoryB = json.result.find((item: any) => item.category === 'B')
          expect(categoryA.value).toBe(30)
          expect(categoryB.value).toBe(15)
        })
    })

    it('POST returns error for invalid request without operation', () => {
      return frisby.post(REST_URL + 'data-processing/process', {
        body: {
          data: 'test'
        }
      })
        .expect('status', 400)
        .expect('json', 'status', 'error')
    })

    it('POST returns error for unknown operation', () => {
      return frisby.post(REST_URL + 'data-processing/process', {
        body: {
          operation: 'unknown',
          data: 'test'
        }
      })
        .expect('status', 200)
        .expect('json', 'status', 'error')
        .promise()
        .then(({ json }) => {
          expect(json.error).toContain('Unknown operation')
        })
    })

    it('POST uppercase works with arrays', () => {
      return frisby.post(REST_URL + 'data-processing/process', {
        body: {
          operation: 'uppercase',
          data: ['hello', 'world']
        }
      })
        .expect('status', 200)
        .expect('json', 'status', 'success')
        .promise()
        .then(({ json }) => {
          expect(json.result).toEqual(['HELLO', 'WORLD'])
        })
    })

    it('POST uppercase works with nested objects', () => {
      return frisby.post(REST_URL + 'data-processing/process', {
        body: {
          operation: 'uppercase',
          data: { name: 'john', city: 'nyc' }
        }
      })
        .expect('status', 200)
        .expect('json', 'status', 'success')
        .promise()
        .then(({ json }) => {
          expect(json.result.name).toBe('JOHN')
          expect(json.result.city).toBe('NYC')
        })
    })
  })

  describe('/process-multiple', () => {
    it('POST processes multiple sources correctly', () => {
      return frisby.post(REST_URL + 'data-processing/process-multiple', {
        body: {
          sources: [
            { name: 'source1', data: { value: 10 } },
            { name: 'source2', data: { value: 20 } }
          ]
        }
      })
        .expect('status', 200)
        .expect('json', 'status', 'success')
        .promise()
        .then(({ json }) => {
          expect(json.result.source1).toEqual({ value: 10 })
          expect(json.result.source2).toEqual({ value: 20 })
        })
    })

    it('POST returns error when sources is not an array', () => {
      return frisby.post(REST_URL + 'data-processing/process-multiple', {
        body: {
          sources: 'not an array'
        }
      })
        .expect('status', 400)
        .expect('json', 'status', 'error')
    })
  })
})
