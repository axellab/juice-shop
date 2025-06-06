/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import config from 'config'
import { Request, Response, NextFunction } from 'express'
import { chaosService } from '../lib/chaos/chaosService'
import logger from '../lib/logger'

/**
 * Get all available chaos experiments
 */
export const listExperiments = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!config.get('chaos.enabled')) {
        return res.status(403).json({ error: 'Chaos engineering is not enabled' })
      }

      const experiments = chaosService.getExperiments()
      res.status(200).json({ experiments })
    } catch (err) {
      logger.error(`Error listing chaos experiments: ${err}`)
      next(err)
    }
  }
}

/**
 * Run a chaos experiment by name
 */
export const runExperiment = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!config.get('chaos.enabled')) {
        return res.status(403).json({ error: 'Chaos engineering is not enabled' })
      }

      const experimentName = req.params.name
      if (!experimentName) {
        return res.status(400).json({ error: 'Experiment name is required' })
      }

      // Check if the chaos service is ready
      if (!chaosService.isReady()) {
        return res.status(503).json({ error: 'Chaos service not initialized' })
      }

      const result = await chaosService.runExperiment(experimentName)
      res.status(200).json(result)
    } catch (err: any) {
      logger.error(`Error running chaos experiment: ${err.message}`)
      res.status(400).json({ error: err.message })
    }
  }
}