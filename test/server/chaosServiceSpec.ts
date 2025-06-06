/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { expect } from 'chai'
import config from 'config'
import { chaosService } from '../../lib/chaos/chaosService'

describe('Chaos Engineering Service', () => {
  before(() => {
    // Backup original config
    this.originalChaosEnabled = config.get('chaos.enabled')
  })

  after(() => {
    // Restore original config
  })

  describe('initialization', () => {
    it('should initialize with chaos engineering disabled by default', () => {
      // By default, chaos should be disabled
      expect(chaosService.isReady()).to.equal(false)
    })

    it('should list available experiments regardless of enabled status', () => {
      const experiments = chaosService.getExperiments()
      expect(experiments).to.be.an('array')
    })
  })

  describe('experiment configuration', () => {
    it('should have database outage experiment configured', () => {
      const experiments = chaosService.getExperiments()
      const dbOutage = experiments.find(exp => exp.name === 'database-outage')
      
      expect(dbOutage).to.not.be.undefined
      expect(dbOutage).to.have.property('description')
      expect(dbOutage).to.have.property('targetService', 'sqlite')
    })

    it('should have API latency experiment configured', () => {
      const experiments = chaosService.getExperiments()
      const apiLatency = experiments.find(exp => exp.name === 'api-latency')
      
      expect(apiLatency).to.not.be.undefined
      expect(apiLatency).to.have.property('description')
      expect(apiLatency).to.have.property('targetService', 'http')
    })

    it('should have memory load experiment configured', () => {
      const experiments = chaosService.getExperiments()
      const memoryLoad = experiments.find(exp => exp.name === 'memory-load')
      
      expect(memoryLoad).to.not.be.undefined
      expect(memoryLoad).to.have.property('description')
      expect(memoryLoad).to.have.property('targetService', 'memory')
    })
  })
})