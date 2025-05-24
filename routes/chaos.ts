/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { type Request, type Response, type NextFunction } from 'express'
import * as challengeUtils from '../lib/challengeUtils'
import { challenges } from '../data/datacache'

// Fibonacci function for CPU-intensive calculation
function fibonacci (n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

export function triggerChaosExperiment () {
  return (req: Request, res: Response, next: NextFunction) => {
    const monkeyType = req.query.monkey
    
    if (monkeyType === 'cpu') {
      // Solve the challenge when the CPU monkey is triggered
      challengeUtils.solveIf(challenges.chaosExperimentChallenge, () => { return true })
      
      // Start CPU-intensive calculation in the background
      setTimeout(() => {
        try {
          // Calculate a large Fibonacci number to stress the CPU
          // This is intentionally inefficient to simulate CPU load
          fibonacci(40)
        } catch (err) {
          console.error(`Error during chaos experiment: ${err}`)
        }
      }, 1)
      
      res.status(200).json({
        status: 'success',
        message: 'Chaos experiment triggered successfully. CPU is now under stress.'
      })
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Invalid chaos monkey type. Try with "?monkey=cpu"'
      })
    }
  }
}