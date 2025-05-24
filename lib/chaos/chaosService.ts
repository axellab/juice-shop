/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import config from 'config'
import logger from '../logger'

// Conditionally import Gremlin to avoid issues if it's not properly configured
let gremlin: any = null
try {
  if (config.get('chaos.enabled')) {
    gremlin = require('gremlin')
  }
} catch (err) {
  logger.warn('Gremlin not available or chaos engineering not enabled')
}

interface ExperimentArgs {
  [key: string]: any
}

interface Experiment {
  name: string
  description: string
  enabled: boolean
  duration: number
  targetService: string
  type: string
  args: ExperimentArgs
}

/**
 * Chaos engineering service using Gremlin
 */
class ChaosService {
  private client: any
  private isInitialized: boolean = false
  private experimentsConfig: Experiment[] = []

  constructor() {
    try {
      if (config.get('chaos.enabled') && gremlin) {
        this.experimentsConfig = config.get('chaos.experiments')
        this.initialize()
      }
    } catch (err) {
      logger.error(`Error initializing chaos service: ${err}`)
    }
  }

  /**
   * Initialize the Gremlin client
   */
  private initialize(): void {
    try {
      if (!gremlin) return

      const teamId = config.get('chaos.gremlin.teamId')
      const apiKey = config.get('chaos.gremlin.apiKey')
      
      if (!teamId || !apiKey) {
        logger.warn('Gremlin teamId or apiKey not configured. Chaos experiments will not be available.')
        return
      }

      this.client = new gremlin.Client({
        teamId,
        apiKey,
        baseUrl: config.get('chaos.gremlin.apiUrl')
      })
      
      this.isInitialized = true
      logger.info('Chaos engineering service initialized')
    } catch (err) {
      logger.error(`Failed to initialize Gremlin client: ${err}`)
    }
  }

  /**
   * Get all available experiments
   */
  getExperiments(): Experiment[] {
    return this.experimentsConfig
  }

  /**
   * Run a specific experiment by name
   */
  async runExperiment(experimentName: string): Promise<any> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Chaos service not initialized or disabled')
    }

    const experiment = this.experimentsConfig.find(exp => exp.name === experimentName)
    if (!experiment) {
      throw new Error(`Experiment "${experimentName}" not found`)
    }

    if (!experiment.enabled) {
      throw new Error(`Experiment "${experimentName}" is disabled`)
    }

    try {
      logger.info(`Running chaos experiment: ${experiment.name}`)
      
      const attackConfig = {
        target: {
          type: experiment.targetService
        },
        command: {
          type: experiment.type,
          args: experiment.args
        },
        labels: [{
          key: 'source',
          value: 'juice-shop'
        }]
      }

      // Create and run the attack
      const attack = await this.client.createAttack(attackConfig)
      logger.info(`Started chaos experiment ${experiment.name} with ID: ${attack.id}`)
      
      // Set up a timeout to halt the experiment after the specified duration
      setTimeout(async () => {
        try {
          await this.client.haltAttack(attack.id)
          logger.info(`Stopped chaos experiment ${experiment.name} with ID: ${attack.id}`)
        } catch (err) {
          logger.error(`Failed to stop chaos experiment: ${err}`)
        }
      }, experiment.duration * 1000)

      return {
        id: attack.id,
        name: experiment.name,
        status: 'running',
        duration: experiment.duration
      }
    } catch (err) {
      logger.error(`Failed to run chaos experiment "${experimentName}": ${err}`)
      throw new Error(`Failed to run chaos experiment: ${err}`)
    }
  }

  /**
   * Check if the chaos service is properly initialized
   */
  isReady(): boolean {
    return this.isInitialized
  }
}

export const chaosService = new ChaosService()