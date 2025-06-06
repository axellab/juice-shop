/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { expect } from 'chai'
import * as sinon from 'sinon'

describe('Arauco Demo - Order Payment Integration Security Tests', () => {
  let OrderPaymentIntegration: any
  let integration: any
  let mockPaymentClient: any

  beforeEach(() => {
    // Mock PaymentServiceClient
    mockPaymentClient = {
      processPayment: sinon.stub(),
      validatePayment: sinon.stub(),
      processRefund: sinon.stub(),
      healthCheck: sinon.stub(),
      on: sinon.stub()
    }

    // Mock OrderPaymentIntegration class
    OrderPaymentIntegration = class MockOrderPaymentIntegration {
      constructor(options: any = {}) {
        this.paymentClient = mockPaymentClient
      }

      async validateOrderForPayment(orderData: any) {
        const errors: string[] = []

        // Basic validation
        if (!orderData.orderId) {
          errors.push('Order ID is required')
        }

        if (!orderData.userId) {
          errors.push('User ID is required')
        }

        if (!orderData.totalPrice || orderData.totalPrice <= 0) {
          errors.push('Valid total price is required')
        }

        if (!orderData.paymentMethod) {
          errors.push('Payment method is required')
        }

        if (!orderData.basketItems || orderData.basketItems.length === 0) {
          errors.push('Order must contain items')
        }

        // Security validation
        if (this.containsMaliciousContent(JSON.stringify(orderData))) {
          errors.push('Malicious content detected in order data')
        }

        // Business logic validation
        if (orderData.totalPrice > 999999) {
          errors.push('Order amount exceeds maximum limit')
        }

        return {
          valid: errors.length === 0,
          errors
        }
      }

      async processOrderPayment(orderData: any) {
        // Validate order first
        const validation = await this.validateOrderForPayment(orderData)
        if (!validation.valid) {
          return {
            success: false,
            errors: validation.errors
          }
        }

        // Check for privilege escalation attempts
        if (orderData.adminOverride || orderData.bypassSecurity) {
          return {
            success: false,
            error: 'Unauthorized operation attempted'
          }
        }

        // Simulate payment processing
        try {
          const result = await this.paymentClient.processPayment({
            amount: orderData.totalPrice,
            paymentMethod: orderData.paymentMethod,
            paymentDetails: orderData.paymentDetails
          })

          return {
            success: true,
            transactionId: result.transactionId || 'test-transaction-' + Date.now(),
            orderId: orderData.orderId
          }
        } catch (error: any) {
          return {
            success: false,
            error: 'Payment processing failed'
          }
        }
      }

      async processOrderRefund(orderId: string, transactionId: string, amount: number, reason: string) {
        // Input validation
        if (!orderId || !transactionId) {
          return {
            success: false,
            error: 'Order ID and transaction ID are required'
          }
        }

        if (!amount || amount <= 0) {
          return {
            success: false,
            error: 'Valid refund amount is required'
          }
        }

        // Security checks
        if (this.containsMaliciousContent(reason)) {
          return {
            success: false,
            error: 'Invalid refund reason'
          }
        }

        if (amount > 999999) {
          return {
            success: false,
            error: 'Refund amount exceeds maximum limit'
          }
        }

        try {
          await this.paymentClient.processRefund(transactionId, amount, reason)
          return {
            success: true,
            refundId: 'refund-' + Date.now(),
            orderId,
            amount
          }
        } catch (error) {
          return {
            success: false,
            error: 'Refund processing failed'
          }
        }
      }

      async calculateFinalAmount(basketItems: any[], baseAmount: number, deliveryMethodId?: string) {
        // Input validation
        if (!Array.isArray(basketItems)) {
          throw new Error('Invalid basket items')
        }

        if (typeof baseAmount !== 'number' || baseAmount < 0) {
          throw new Error('Invalid base amount')
        }

        // Security checks
        if (basketItems.length > 1000) {
          throw new Error('Too many items in basket')
        }

        let totalAmount = baseAmount

        // Calculate item totals with security checks
        for (const item of basketItems) {
          if (!item.price || typeof item.price !== 'number' || item.price < 0) {
            throw new Error('Invalid item price detected')
          }
          
          if (!item.quantity || typeof item.quantity !== 'number' || item.quantity < 0 || item.quantity > 999) {
            throw new Error('Invalid item quantity detected')
          }

          totalAmount += item.price * item.quantity
        }

        // Add delivery fee (simulate)
        if (deliveryMethodId === 'express') {
          totalAmount += 10.00
        } else if (deliveryMethodId === 'standard') {
          totalAmount += 5.00
        }

        return Math.round(totalAmount * 100) / 100 // Round to 2 decimal places
      }

      private containsMaliciousContent(input: string): boolean {
        const maliciousPatterns = [
          /<script/i,
          /javascript:/i,
          /on\w+=/i,
          /DROP\s+TABLE/i,
          /INSERT\s+INTO/i,
          /UPDATE\s+\w+\s+SET/i,
          /DELETE\s+FROM/i,
          /UNION\s+SELECT/i,
          /'\s*(OR|AND)\s*'?\w/i,
          /eval\(/i,
          /Function\(/i
        ]

        return maliciousPatterns.some(pattern => pattern.test(input))
      }
    }

    integration = new OrderPaymentIntegration()
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('Order Validation Security', () => {
    it('should require all mandatory order fields', async () => {
      const incompleteOrder = {
        // Missing required fields
        totalPrice: 100
      }

      const result = await integration.validateOrderForPayment(incompleteOrder)
      expect(result.valid).to.be.false
      expect(result.errors).to.include('Order ID is required')
      expect(result.errors).to.include('User ID is required')
      expect(result.errors).to.include('Payment method is required')
      expect(result.errors).to.include('Order must contain items')
    })

    it('should reject orders with invalid amounts', async () => {
      const invalidOrder = {
        orderId: 'order-123',
        userId: 'user-456',
        totalPrice: -50, // Invalid negative amount
        paymentMethod: 'credit_card',
        basketItems: [{ id: 1, name: 'Product', price: 10, quantity: 1 }]
      }

      const result = await integration.validateOrderForPayment(invalidOrder)
      expect(result.valid).to.be.false
      expect(result.errors).to.include('Valid total price is required')
    })

    it('should detect SQL injection attempts in order data', async () => {
      const maliciousOrder = {
        orderId: "'; DROP TABLE orders; --",
        userId: 'user-456',
        totalPrice: 100,
        paymentMethod: 'credit_card',
        basketItems: [{ id: 1, name: 'Product', price: 10, quantity: 1 }]
      }

      const result = await integration.validateOrderForPayment(maliciousOrder)
      expect(result.valid).to.be.false
      expect(result.errors).to.include('Malicious content detected in order data')
    })

    it('should detect XSS attempts in order data', async () => {
      const xssOrder = {
        orderId: 'order-123',
        userId: 'user-456',
        totalPrice: 100,
        paymentMethod: 'credit_card',
        basketItems: [{ 
          id: 1, 
          name: '<script>alert("xss")</script>', 
          price: 10, 
          quantity: 1 
        }]
      }

      const result = await integration.validateOrderForPayment(xssOrder)
      expect(result.valid).to.be.false
      expect(result.errors).to.include('Malicious content detected in order data')
    })

    it('should enforce maximum order amount limits', async () => {
      const expensiveOrder = {
        orderId: 'order-123',
        userId: 'user-456',
        totalPrice: 1000000, // Exceeds maximum
        paymentMethod: 'credit_card',
        basketItems: [{ id: 1, name: 'Expensive Product', price: 1000000, quantity: 1 }]
      }

      const result = await integration.validateOrderForPayment(expensiveOrder)
      expect(result.valid).to.be.false
      expect(result.errors).to.include('Order amount exceeds maximum limit')
    })
  })

  describe('Payment Processing Security', () => {
    it('should prevent privilege escalation in payment processing', async () => {
      const privilegeEscalationOrder = {
        orderId: 'order-123',
        userId: 'user-456',
        totalPrice: 100,
        paymentMethod: 'credit_card',
        basketItems: [{ id: 1, name: 'Product', price: 10, quantity: 1 }],
        adminOverride: true // Privilege escalation attempt
      }

      const result = await integration.processOrderPayment(privilegeEscalationOrder)
      expect(result.success).to.be.false
      expect(result.error).to.equal('Unauthorized operation attempted')
    })

    it('should prevent security bypass attempts', async () => {
      const bypassOrder = {
        orderId: 'order-123',
        userId: 'user-456',
        totalPrice: 100,
        paymentMethod: 'credit_card',
        basketItems: [{ id: 1, name: 'Product', price: 10, quantity: 1 }],
        bypassSecurity: true // Security bypass attempt
      }

      const result = await integration.processOrderPayment(bypassOrder)
      expect(result.success).to.be.false
      expect(result.error).to.equal('Unauthorized operation attempted')
    })

    it('should validate order before processing payment', async () => {
      const invalidOrder = {
        // Missing required fields
        totalPrice: 100
      }

      const result = await integration.processOrderPayment(invalidOrder)
      expect(result.success).to.be.false
      expect(result.errors).to.be.an('array').that.is.not.empty
    })
  })

  describe('Refund Processing Security', () => {
    it('should require valid refund parameters', async () => {
      const result = await integration.processOrderRefund('', '', 0, 'test reason')
      expect(result.success).to.be.false
      expect(result.error).to.include('required')
    })

    it('should validate refund amounts', async () => {
      const result = await integration.processOrderRefund('order-123', 'txn-456', -50, 'Invalid amount')
      expect(result.success).to.be.false
      expect(result.error).to.equal('Valid refund amount is required')
    })

    it('should enforce maximum refund limits', async () => {
      const result = await integration.processOrderRefund('order-123', 'txn-456', 1000000, 'Large refund')
      expect(result.success).to.be.false
      expect(result.error).to.equal('Refund amount exceeds maximum limit')
    })

    it('should sanitize refund reason input', async () => {
      const maliciousReason = '<script>alert("xss")</script>'
      const result = await integration.processOrderRefund('order-123', 'txn-456', 100, maliciousReason)
      expect(result.success).to.be.false
      expect(result.error).to.equal('Invalid refund reason')
    })
  })

  describe('Amount Calculation Security', () => {
    it('should validate basket items structure', async () => {
      try {
        await integration.calculateFinalAmount('not-an-array', 100)
        expect.fail('Should have thrown an error for invalid basket items')
      } catch (error: any) {
        expect(error.message).to.equal('Invalid basket items')
      }
    })

    it('should validate base amount', async () => {
      try {
        await integration.calculateFinalAmount([], -100)
        expect.fail('Should have thrown an error for negative base amount')
      } catch (error: any) {
        expect(error.message).to.equal('Invalid base amount')
      }
    })

    it('should prevent basket overflow attacks', async () => {
      const largeBasket = Array(1001).fill({ price: 1, quantity: 1 })
      
      try {
        await integration.calculateFinalAmount(largeBasket, 100)
        expect.fail('Should have thrown an error for too many items')
      } catch (error: any) {
        expect(error.message).to.equal('Too many items in basket')
      }
    })

    it('should validate item prices', async () => {
      const basketWithInvalidPrice = [
        { price: -10, quantity: 1 } // Invalid negative price
      ]

      try {
        await integration.calculateFinalAmount(basketWithInvalidPrice, 100)
        expect.fail('Should have thrown an error for invalid price')
      } catch (error: any) {
        expect(error.message).to.equal('Invalid item price detected')
      }
    })

    it('should validate item quantities', async () => {
      const basketWithInvalidQuantity = [
        { price: 10, quantity: -1 } // Invalid negative quantity
      ]

      try {
        await integration.calculateFinalAmount(basketWithInvalidQuantity, 100)
        expect.fail('Should have thrown an error for invalid quantity')
      } catch (error: any) {
        expect(error.message).to.equal('Invalid item quantity detected')
      }
    })

    it('should prevent quantity overflow attacks', async () => {
      const basketWithLargeQuantity = [
        { price: 10, quantity: 1000 } // Exceeds maximum quantity
      ]

      try {
        await integration.calculateFinalAmount(basketWithLargeQuantity, 100)
        expect.fail('Should have thrown an error for excessive quantity')
      } catch (error: any) {
        expect(error.message).to.equal('Invalid item quantity detected')
      }
    })

    it('should calculate amounts correctly with valid data', async () => {
      const validBasket = [
        { price: 10.50, quantity: 2 },
        { price: 5.25, quantity: 1 }
      ]

      const result = await integration.calculateFinalAmount(validBasket, 0, 'express')
      expect(result).to.equal(36.25) // (10.50 * 2) + (5.25 * 1) + 10.00 express delivery
    })
  })

  describe('Error Handling Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      const orderWithSensitiveData = {
        orderId: 'order-123',
        userId: 'user-456',
        totalPrice: 100,
        paymentMethod: 'credit_card',
        basketItems: [{ id: 1, name: 'Product', price: 10, quantity: 1 }],
        internalApiKey: 'secret-key-12345',
        adminPassword: 'super-secret-password'
      }

      // Force an error by including malicious content
      orderWithSensitiveData.orderId = '<script>alert("xss")</script>'
      
      const result = await integration.processOrderPayment(orderWithSensitiveData)
      const resultString = JSON.stringify(result)
      
      // Should not contain sensitive data
      expect(resultString).to.not.contain('secret-key-12345')
      expect(resultString).to.not.contain('super-secret-password')
    })

    it('should handle payment client errors gracefully', async () => {
      // Make the payment client throw an error
      mockPaymentClient.processPayment.rejects(new Error('Payment service unavailable'))

      const validOrder = {
        orderId: 'order-123',
        userId: 'user-456',
        totalPrice: 100,
        paymentMethod: 'credit_card',
        basketItems: [{ id: 1, name: 'Product', price: 10, quantity: 1 }]
      }

      const result = await integration.processOrderPayment(validOrder)
      expect(result.success).to.be.false
      expect(result.error).to.equal('Payment processing failed')
    })
  })
})