/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { type Request, type Response, type NextFunction } from 'express'
import * as dataProcessing from '../lib/dataProcessing'

/**
 * Process data transformation request
 */
export function processData () {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = req.body

      if (!dataProcessing.validateRequest(request)) {
        res.status(400).json({
          status: 'error',
          error: 'Invalid request format. Required fields: operation, data'
        })
        return
      }

      const result = dataProcessing.transformData(request)
      res.json(result)
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Process data from multiple sources
 */
export function processMultipleSources () {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sources } = req.body

      if (!Array.isArray(sources)) {
        res.status(400).json({
          status: 'error',
          error: 'sources must be an array of {name, data} objects'
        })
        return
      }

      const result = await dataProcessing.processMultipleSources(sources)
      res.json(result)
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Health check endpoint for the microservice
 */
export function healthCheck () {
  return (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'data-processing',
      timestamp: new Date().toISOString()
    })
  }
}

/**
 * Get available operations
 */
export function getOperations () {
  return (req: Request, res: Response) => {
    res.json({
      status: 'success',
      operations: [
        {
          name: 'uppercase',
          description: 'Transform string data to uppercase',
          example: { operation: 'uppercase', data: 'hello world' }
        },
        {
          name: 'lowercase',
          description: 'Transform string data to lowercase',
          example: { operation: 'lowercase', data: 'HELLO WORLD' }
        },
        {
          name: 'aggregate',
          description: 'Aggregate array data with optional grouping',
          example: {
            operation: 'aggregate',
            data: [{ category: 'A', value: 10 }, { category: 'A', value: 20 }],
            options: { groupBy: 'category', sumFields: ['value'] }
          }
        },
        {
          name: 'filter',
          description: 'Filter array data based on conditions',
          example: {
            operation: 'filter',
            data: [{ name: 'John', age: 30 }, { name: 'Jane', age: 25 }],
            options: { conditions: { age: 30 } }
          }
        },
        {
          name: 'map',
          description: 'Map array data to specific fields',
          example: {
            operation: 'map',
            data: [{ name: 'John', age: 30, city: 'NYC' }],
            options: { fields: ['name', 'age'] }
          }
        }
      ]
    })
  }
}
