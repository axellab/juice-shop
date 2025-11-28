/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { expect } from 'chai'
import * as dataProcessing from '../../lib/dataProcessing'

describe('dataProcessing', () => {
  describe('validateRequest', () => {
    it('should return true for valid request', () => {
      const request = {
        operation: 'uppercase',
        data: 'test'
      }
      expect(dataProcessing.validateRequest(request)).to.equal(true)
    })

    it('should return false for request without operation', () => {
      const request = {
        data: 'test'
      }
      expect(dataProcessing.validateRequest(request)).to.equal(false)
    })

    it('should return false for request without data', () => {
      const request = {
        operation: 'uppercase'
      }
      expect(dataProcessing.validateRequest(request)).to.equal(false)
    })

    it('should return false for null request', () => {
      expect(dataProcessing.validateRequest(null)).to.equal(false)
    })

    it('should return false for non-object request', () => {
      expect(dataProcessing.validateRequest('string')).to.equal(false)
    })
  })

  describe('transformData', () => {
    describe('uppercase operation', () => {
      it('should transform string to uppercase', () => {
        const result = dataProcessing.transformData({
          operation: 'uppercase',
          data: 'hello'
        })
        expect(result.status).to.equal('success')
        expect(result.result).to.equal('HELLO')
      })

      it('should transform array of strings to uppercase', () => {
        const result = dataProcessing.transformData({
          operation: 'uppercase',
          data: ['hello', 'world']
        })
        expect(result.status).to.equal('success')
        expect(result.result).to.deep.equal(['HELLO', 'WORLD'])
      })

      it('should transform object properties to uppercase', () => {
        const result = dataProcessing.transformData({
          operation: 'uppercase',
          data: { name: 'john', city: 'nyc' }
        })
        expect(result.status).to.equal('success')
        expect(result.result).to.deep.equal({ name: 'JOHN', city: 'NYC' })
      })
    })

    describe('lowercase operation', () => {
      it('should transform string to lowercase', () => {
        const result = dataProcessing.transformData({
          operation: 'lowercase',
          data: 'HELLO'
        })
        expect(result.status).to.equal('success')
        expect(result.result).to.equal('hello')
      })

      it('should transform array of strings to lowercase', () => {
        const result = dataProcessing.transformData({
          operation: 'lowercase',
          data: ['HELLO', 'WORLD']
        })
        expect(result.status).to.equal('success')
        expect(result.result).to.deep.equal(['hello', 'world'])
      })
    })

    describe('filter operation', () => {
      it('should filter array based on conditions', () => {
        const result = dataProcessing.transformData({
          operation: 'filter',
          data: [
            { name: 'John', age: 30 },
            { name: 'Jane', age: 25 }
          ],
          options: {
            conditions: { age: 30 }
          }
        })
        expect(result.status).to.equal('success')
        expect(result.result.length).to.equal(1)
        expect(result.result[0].name).to.equal('John')
      })

      it('should return error if data is not an array', () => {
        const result = dataProcessing.transformData({
          operation: 'filter',
          data: 'not an array',
          options: { conditions: {} }
        })
        expect(result.status).to.equal('error')
        expect(result.error).to.contain('must be an array')
      })
    })

    describe('map operation', () => {
      it('should map array to specific fields', () => {
        const result = dataProcessing.transformData({
          operation: 'map',
          data: [
            { name: 'John', age: 30, city: 'NYC' }
          ],
          options: {
            fields: ['name', 'age']
          }
        })
        expect(result.status).to.equal('success')
        expect(result.result[0]).to.have.property('name')
        expect(result.result[0]).to.have.property('age')
        expect(result.result[0]).to.not.have.property('city')
      })

      it('should return error if data is not an array', () => {
        const result = dataProcessing.transformData({
          operation: 'map',
          data: 'not an array',
          options: { fields: ['name'] }
        })
        expect(result.status).to.equal('error')
      })
    })

    describe('aggregate operation', () => {
      it('should aggregate data without grouping', () => {
        const result = dataProcessing.transformData({
          operation: 'aggregate',
          data: [
            { value: 10 },
            { value: 20 }
          ],
          options: {
            sumFields: ['value']
          }
        })
        expect(result.status).to.equal('success')
        expect(result.result.value).to.equal(30)
      })

      it('should aggregate data with grouping', () => {
        const result = dataProcessing.transformData({
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
        })
        expect(result.status).to.equal('success')
        expect(result.result.length).to.equal(2)
        const categoryA = result.result.find((item: any) => item.category === 'A')
        expect(categoryA.value).to.equal(30)
      })

      it('should return error if data is not an array', () => {
        const result = dataProcessing.transformData({
          operation: 'aggregate',
          data: 'not an array',
          options: { sumFields: [] }
        })
        expect(result.status).to.equal('error')
      })
    })

    describe('unknown operation', () => {
      it('should return error for unknown operation', () => {
        const result = dataProcessing.transformData({
          operation: 'unknown',
          data: 'test'
        })
        expect(result.status).to.equal('error')
        expect(result.error).to.contain('Unknown operation')
      })
    })
  })

  describe('processMultipleSources', () => {
    it('should combine data from multiple sources', async () => {
      const sources = [
        { name: 'source1', data: { value: 10 } },
        { name: 'source2', data: { value: 20 } }
      ]
      const result = await dataProcessing.processMultipleSources(sources)
      expect(result.status).to.equal('success')
      expect(result.result.source1).to.deep.equal({ value: 10 })
      expect(result.result.source2).to.deep.equal({ value: 20 })
    })
  })
})
