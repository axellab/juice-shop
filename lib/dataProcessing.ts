/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

/**
 * Data Processing Microservice
 * Provides data transformation and processing capabilities
 */

export interface ProcessingRequest {
  operation: string
  data: any
  options?: Record<string, any>
}

export interface ProcessingResponse {
  status: 'success' | 'error'
  result?: any
  error?: string
}

/**
 * Transform data based on operation type
 */
export function transformData (request: ProcessingRequest): ProcessingResponse {
  try {
    const { operation, data, options = {} } = request

    switch (operation) {
      case 'uppercase':
        return {
          status: 'success',
          result: transformToUpperCase(data)
        }
      case 'lowercase':
        return {
          status: 'success',
          result: transformToLowerCase(data)
        }
      case 'aggregate':
        return {
          status: 'success',
          result: aggregateData(data, options)
        }
      case 'filter':
        return {
          status: 'success',
          result: filterData(data, options)
        }
      case 'map':
        return {
          status: 'success',
          result: mapData(data, options)
        }
      default:
        return {
          status: 'error',
          error: `Unknown operation: ${operation}`
        }
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Transform string data to uppercase
 */
function transformToUpperCase (data: any): any {
  if (typeof data === 'string') {
    return data.toUpperCase()
  }
  if (Array.isArray(data)) {
    return data.map(item => transformToUpperCase(item))
  }
  if (typeof data === 'object' && data !== null) {
    const result: Record<string, any> = {}
    for (const key in data) {
      result[key] = transformToUpperCase(data[key])
    }
    return result
  }
  return data
}

/**
 * Transform string data to lowercase
 */
function transformToLowerCase (data: any): any {
  if (typeof data === 'string') {
    return data.toLowerCase()
  }
  if (Array.isArray(data)) {
    return data.map(item => transformToLowerCase(item))
  }
  if (typeof data === 'object' && data !== null) {
    const result: Record<string, any> = {}
    for (const key in data) {
      result[key] = transformToLowerCase(data[key])
    }
    return result
  }
  return data
}

/**
 * Aggregate array data based on grouping key
 */
function aggregateData (data: any[], options: Record<string, any>): any {
  if (!Array.isArray(data)) {
    throw new Error('Data must be an array for aggregation')
  }

  const { groupBy, sumFields = [] } = options

  if (!groupBy) {
    return data.reduce((acc, item) => {
      sumFields.forEach((field: string) => {
        acc[field] = (acc[field] || 0) + (item[field] || 0)
      })
      return acc
    }, {})
  }

  const grouped: Record<string, any> = {}

  data.forEach(item => {
    const key = item[groupBy]
    if (!grouped[key]) {
      grouped[key] = { [groupBy]: key }
      sumFields.forEach((field: string) => {
        grouped[key][field] = 0
      })
    }
    sumFields.forEach((field: string) => {
      grouped[key][field] += item[field] || 0
    })
  })

  return Object.values(grouped)
}

/**
 * Filter array data based on conditions
 */
function filterData (data: any[], options: Record<string, any>): any {
  if (!Array.isArray(data)) {
    throw new Error('Data must be an array for filtering')
  }

  const { conditions = {} } = options

  return data.filter(item => {
    return Object.entries(conditions).every(([key, value]) => {
      return item[key] === value
    })
  })
}

/**
 * Map array data with field transformations
 */
function mapData (data: any[], options: Record<string, any>): any {
  if (!Array.isArray(data)) {
    throw new Error('Data must be an array for mapping')
  }

  const { fields = [] } = options

  if (fields.length === 0) {
    return data
  }

  return data.map(item => {
    const mapped: Record<string, any> = {}
    fields.forEach((field: string) => {
      if (item[field] !== undefined) {
        mapped[field] = item[field]
      }
    })
    return mapped
  })
}

/**
 * Process data from multiple sources and combine results
 */
export async function processMultipleSources (
  sources: Array<{ name: string, data: any }>
): Promise<ProcessingResponse> {
  try {
    const results: Record<string, any> = {}

    sources.forEach(source => {
      results[source.name] = source.data
    })

    return {
      status: 'success',
      result: results
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Validate processing request
 */
export function validateRequest (request: any): boolean {
  if (!request || typeof request !== 'object') {
    return false
  }

  if (!request.operation || typeof request.operation !== 'string') {
    return false
  }

  if (request.data === undefined) {
    return false
  }

  return true
}
