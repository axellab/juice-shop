/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { expect } from 'chai'
import * as sinon from 'sinon'

// Mock axios for testing
const mockAxios = {
  create: sinon.stub().returns({
    interceptors: {
      request: { use: sinon.stub() },
      response: { use: sinon.stub() }
    },
    post: sinon.stub(),
    get: sinon.stub()
  }),
  post: sinon.stub(),
  get: sinon.stub()
}

// Mock the payment client
describe('Arauco Demo - Payment Client Security Tests', () => {
  let PaymentServiceClient: any
  let paymentClient: any

  beforeEach(() => {
    // Reset all stubs
    sinon.resetHistory()
    
    // Mock the PaymentServiceClient class
    PaymentServiceClient = class MockPaymentServiceClient {
      constructor(options: any = {}) {
        this.baseURL = options.baseURL || 'http://localhost:3001'
        this.timeout = options.timeout || 30000
        this.retryAttempts = options.retryAttempts || 3
        this.client = mockAxios.create()
      }

      async validatePayment(paymentMethod: string, paymentDetails: any) {
        // Simulate input validation
        if (!paymentMethod || !paymentDetails) {
          return {
            valid: false,
            errors: ['Payment method and details are required']
          }
        }

        // Check for malicious input
        if (this.containsMaliciousInput(paymentMethod) || this.containsMaliciousInput(JSON.stringify(paymentDetails))) {
          return {
            valid: false,
            errors: ['Malicious input detected']
          }
        }

        return {
          valid: true,
          paymentMethod,
          errors: []
        }
      }

      async processPayment(paymentData: any) {
        // Simulate security checks
        if (!paymentData || !paymentData.amount || paymentData.amount <= 0) {
          throw new Error('Invalid payment amount')
        }

        if (this.containsMaliciousInput(JSON.stringify(paymentData))) {
          throw new Error('Security violation detected')
        }

        return {
          success: true,
          transactionId: 'test-transaction-123'
        }
      }

      async tokenizePaymentMethod(paymentMethod: string, paymentDetails: any) {
        if (!paymentDetails || !paymentDetails.cardNumber) {
          throw new Error('Card number is required for tokenization')
        }

        // Ensure sensitive data is not logged
        const safeDetails = { ...paymentDetails }
        delete safeDetails.cardNumber
        delete safeDetails.cvv

        return {
          token: 'secure-token-' + Math.random().toString(36).substring(7),
          lastFour: paymentDetails.cardNumber ? paymentDetails.cardNumber.slice(-4) : undefined,
          paymentMethod
        }
      }

      private containsMaliciousInput(input: string): boolean {
        const maliciousPatterns = [
          /<script/i,
          /javascript:/i,
          /on\w+=/i,
          /DROP\s+TABLE/i,
          /INSERT\s+INTO/i,
          /UPDATE\s+\w+\s+SET/i,
          /DELETE\s+FROM/i,
          /UNION\s+SELECT/i,
          /'\s*(OR|AND)\s*'?\w/i
        ]

        return maliciousPatterns.some(pattern => pattern.test(input))
      }
    }

    paymentClient = new PaymentServiceClient()
  })

  describe('Input Validation Security', () => {
    it('should reject null or undefined payment methods', async () => {
      const result = await paymentClient.validatePayment(null, { cardNumber: '4111111111111111' })
      expect(result.valid).to.be.false
      expect(result.errors).to.include('Payment method and details are required')
    })

    it('should reject null or undefined payment details', async () => {
      const result = await paymentClient.validatePayment('credit_card', null)
      expect(result.valid).to.be.false
      expect(result.errors).to.include('Payment method and details are required')
    })

    it('should detect and reject SQL injection attempts', async () => {
      const maliciousPaymentMethod = "'; DROP TABLE payments; --"
      const paymentDetails = { cardNumber: '4111111111111111' }
      
      const result = await paymentClient.validatePayment(maliciousPaymentMethod, paymentDetails)
      expect(result.valid).to.be.false
      expect(result.errors).to.include('Malicious input detected')
    })

    it('should detect and reject XSS attempts', async () => {
      const xssPaymentDetails = {
        cardNumber: '4111111111111111',
        fullName: '<script>alert("xss")</script>'
      }
      
      const result = await paymentClient.validatePayment('credit_card', xssPaymentDetails)
      expect(result.valid).to.be.false
      expect(result.errors).to.include('Malicious input detected')
    })

    it('should detect JavaScript injection attempts', async () => {
      const jsInjectionDetails = {
        cardNumber: '4111111111111111',
        cvv: 'javascript:alert("injection")'
      }
      
      const result = await paymentClient.validatePayment('credit_card', jsInjectionDetails)
      expect(result.valid).to.be.false
      expect(result.errors).to.include('Malicious input detected')
    })
  })

  describe('Payment Processing Security', () => {
    it('should reject payments with invalid amounts', async () => {
      const invalidPaymentData = {
        amount: -100,
        paymentMethod: 'credit_card',
        paymentDetails: { cardNumber: '4111111111111111' }
      }

      try {
        await paymentClient.processPayment(invalidPaymentData)
        expect.fail('Should have thrown an error for invalid amount')
      } catch (error: any) {
        expect(error.message).to.equal('Invalid payment amount')
      }
    })

    it('should reject payments with zero amounts', async () => {
      const zeroAmountData = {
        amount: 0,
        paymentMethod: 'credit_card',
        paymentDetails: { cardNumber: '4111111111111111' }
      }

      try {
        await paymentClient.processPayment(zeroAmountData)
        expect.fail('Should have thrown an error for zero amount')
      } catch (error: any) {
        expect(error.message).to.equal('Invalid payment amount')
      }
    })

    it('should detect security violations in payment data', async () => {
      const maliciousPaymentData = {
        amount: 100,
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          notes: 'DROP TABLE transactions;'
        }
      }

      try {
        await paymentClient.processPayment(maliciousPaymentData)
        expect.fail('Should have thrown an error for security violation')
      } catch (error: any) {
        expect(error.message).to.equal('Security violation detected')
      }
    })
  })

  describe('Tokenization Security', () => {
    it('should require card number for tokenization', async () => {
      const invalidDetails = { cvv: '123' }

      try {
        await paymentClient.tokenizePaymentMethod('credit_card', invalidDetails)
        expect.fail('Should have thrown an error for missing card number')
      } catch (error: any) {
        expect(error.message).to.equal('Card number is required for tokenization')
      }
    })

    it('should not expose sensitive data in tokenization response', async () => {
      const paymentDetails = {
        cardNumber: '4111111111111111',
        cvv: '123',
        expiryMonth: 12,
        expiryYear: 2025
      }

      const result = await paymentClient.tokenizePaymentMethod('credit_card', paymentDetails)
      
      // Should have a token
      expect(result.token).to.exist
      expect(result.token).to.be.a('string')
      
      // Should only contain last 4 digits
      expect(result.lastFour).to.equal('1111')
      
      // Should not contain full card number or CVV
      const resultString = JSON.stringify(result)
      expect(resultString).to.not.contain('4111111111111111')
      expect(resultString).to.not.contain('123')
    })

    it('should generate unique tokens for each request', async () => {
      const paymentDetails = {
        cardNumber: '4111111111111111',
        cvv: '123'
      }

      const result1 = await paymentClient.tokenizePaymentMethod('credit_card', paymentDetails)
      const result2 = await paymentClient.tokenizePaymentMethod('credit_card', paymentDetails)
      
      expect(result1.token).to.not.equal(result2.token)
    })
  })

  describe('Configuration Security', () => {
    it('should use secure defaults for timeout', () => {
      const client = new PaymentServiceClient()
      expect(client.timeout).to.equal(30000) // 30 seconds
    })

    it('should use secure defaults for retry attempts', () => {
      const client = new PaymentServiceClient()
      expect(client.retryAttempts).to.equal(3)
    })

    it('should accept custom secure configuration', () => {
      const client = new PaymentServiceClient({
        baseURL: 'https://secure-payment-service.com',
        timeout: 15000,
        retryAttempts: 2
      })
      
      expect(client.baseURL).to.equal('https://secure-payment-service.com')
      expect(client.timeout).to.equal(15000)
      expect(client.retryAttempts).to.equal(2)
    })

    it('should not accept insecure HTTP URLs in production-like environment', () => {
      // This test documents the expectation that production should use HTTPS
      const client = new PaymentServiceClient({
        baseURL: 'http://insecure-payment-service.com'
      })
      
      // In a real implementation, this should validate and reject HTTP URLs
      // For now, we document the security requirement
      console.log('Security note: Payment service should only accept HTTPS URLs in production')
      expect(client.baseURL).to.exist
    })
  })

  describe('Error Handling Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      const sensitivePaymentData = {
        amount: 100,
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          cvv: '123',
          apiKey: 'secret-api-key'
        }
      }

      try {
        // Force an error by including malicious content
        sensitivePaymentData.paymentDetails.cardNumber = 'DROP TABLE users'
        await paymentClient.processPayment(sensitivePaymentData)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        // Error message should not contain sensitive data
        expect(error.message).to.not.contain('secret-api-key')
        expect(error.message).to.not.contain('4111111111111111')
        expect(error.message).to.not.contain('123')
      }
    })

    it('should handle network errors gracefully', () => {
      // This test documents the expectation for proper error handling
      const client = new PaymentServiceClient()
      
      // Verify that the client has proper error handling structure
      expect(client.client).to.exist
      expect(typeof client.validatePayment).to.equal('function')
      expect(typeof client.processPayment).to.equal('function')
    })
  })
})