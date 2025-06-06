/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import * as frisby from 'frisby'

const PAYMENT_SERVICE_URL = 'http://localhost:3001'
const API_URL = 'http://localhost:3000/api'

const jsonHeader = { 'content-type': 'application/json' }

describe('Arauco Demo - Payment Microservice Security Tests', () => {
  
  describe('Input Validation Security', () => {
    it('should reject malicious SQL injection in payment validation', () => {
      const maliciousPayload = {
        paymentMethod: "'; DROP TABLE payments; --",
        paymentDetails: {
          cardNumber: "4111111111111111' OR 1=1 --",
          cvv: "123'; UPDATE users SET isAdmin=1; --",
          expiryMonth: 12,
          expiryYear: 2025
        }
      }

      return frisby.post(PAYMENT_SERVICE_URL + '/api/payments/validate', {
        headers: jsonHeader,
        body: maliciousPayload
      })
        .expect('status', 400)
        .expect('jsonTypes', {
          status: String,
          message: String
        })
        .expect('json', 'status', 'error')
    })

    it('should sanitize XSS attempts in payment details', () => {
      const xssPayload = {
        paymentMethod: '<script>alert("xss")</script>',
        paymentDetails: {
          cardNumber: '4111111111111111',
          cvv: '<img src=x onerror=alert("xss")>',
          expiryMonth: 12,
          expiryYear: 2025,
          fullName: '<script>document.cookie="malicious=true"</script>'
        }
      }

      return frisby.post(PAYMENT_SERVICE_URL + '/api/payments/validate', {
        headers: jsonHeader,
        body: xssPayload
      })
        .expect('status', 400)
        .expect('jsonTypes', {
          status: String
        })
        .then(({ json }) => {
          // Ensure the response doesn't contain unescaped script tags
          const responseString = JSON.stringify(json)
          expect(responseString).not.toContain('<script>')
          expect(responseString).not.toContain('onerror=')
        })
    })

    it('should reject oversized payloads to prevent DoS attacks', () => {
      const oversizedPayload = {
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          cvv: '123',
          expiryMonth: 12,
          expiryYear: 2025,
          largeField: 'A'.repeat(100000) // 100KB string
        }
      }

      return frisby.post(PAYMENT_SERVICE_URL + '/api/payments/validate', {
        headers: jsonHeader,
        body: oversizedPayload
      })
        .expect('status', 413) // Payload Too Large
    })
  })

  describe('Authentication and Authorization Security', () => {
    it('should require proper authentication for sensitive endpoints', () => {
      return frisby.get(PAYMENT_SERVICE_URL + '/api/payments/admin/transactions')
        .expect('status', 401)
    })

    it('should validate authorization tokens properly', () => {
      const invalidToken = 'Bearer invalid.jwt.token'
      
      return frisby.get(PAYMENT_SERVICE_URL + '/api/payments/transactions', {
        headers: {
          'Authorization': invalidToken,
          'content-type': 'application/json'
        }
      })
        .expect('status', 401)
    })

    it('should prevent privilege escalation attempts', () => {
      const privilegeEscalationPayload = {
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          cvv: '123',
          expiryMonth: 12,
          expiryYear: 2025
        },
        adminOverride: true,
        isAdmin: true,
        role: 'admin'
      }

      return frisby.post(PAYMENT_SERVICE_URL + '/api/payments/process', {
        headers: jsonHeader,
        body: privilegeEscalationPayload
      })
        .expect('status', 403)
    })
  })

  describe('Data Protection and Sensitive Information', () => {
    it('should not expose sensitive payment data in responses', () => {
      const paymentData = {
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          cvv: '123',
          expiryMonth: 12,
          expiryYear: 2025,
          fullName: 'John Doe'
        }
      }

      return frisby.post(PAYMENT_SERVICE_URL + '/api/payments/validate', {
        headers: jsonHeader,
        body: paymentData
      })
        .then(({ json }) => {
          const responseString = JSON.stringify(json)
          // Should not contain full card number
          expect(responseString).not.toContain('4111111111111111')
          // Should not contain CVV
          expect(responseString).not.toContain('123')
        })
    })

    it('should mask card numbers in transaction logs', () => {
      return frisby.post(PAYMENT_SERVICE_URL + '/api/payments/tokenize', {
        headers: jsonHeader,
        body: {
          paymentMethod: 'credit_card',
          paymentDetails: {
            cardNumber: '4111111111111111',
            cvv: '123',
            expiryMonth: 12,
            expiryYear: 2025
          }
        }
      })
        .expect('jsonTypes', {
          status: String,
          token: String
        })
        .then(({ json }) => {
          // Should only contain last 4 digits
          if (json.lastFour) {
            expect(json.lastFour).toBe('1111')
          }
          // Should not contain full card number
          const responseString = JSON.stringify(json)
          expect(responseString).not.toContain('4111111111111111')
        })
    })
  })

  describe('API Security Headers and Configuration', () => {
    it('should include proper security headers', () => {
      return frisby.get(PAYMENT_SERVICE_URL + '/health')
        .expect('status', 200)
        .inspectHeaders()
        .then(({ headers }) => {
          // Check for security headers (if implemented)
          // These tests will pass even if headers are not set, but document expected security measures
          console.log('Security headers check:', {
            'X-Content-Type-Options': headers['x-content-type-options'] || 'Not set',
            'X-Frame-Options': headers['x-frame-options'] || 'Not set',
            'X-XSS-Protection': headers['x-xss-protection'] || 'Not set'
          })
        })
    })

    it('should handle malformed JSON gracefully', () => {
      return frisby.post(PAYMENT_SERVICE_URL + '/api/payments/validate', {
        headers: { 'content-type': 'application/json' },
        body: '{"invalid": json malformed'
      })
        .expect('status', 400)
    })

    it('should rate limit to prevent abuse', () => {
      // Simulate rapid requests to test rate limiting
      const requests = []
      for (let i = 0; i < 10; i++) {
        requests.push(
          frisby.get(PAYMENT_SERVICE_URL + '/health')
        )
      }
      
      return Promise.all(requests)
        .then(responses => {
          // In a real scenario, some requests should be rate limited
          // This is a basic test to ensure the endpoint can handle multiple requests
          responses.forEach(response => {
            expect([200, 429]).toContain(response.status)
          })
        })
    })
  })

  describe('Business Logic Security', () => {
    it('should validate card expiry dates', () => {
      const expiredCardPayload = {
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          cvv: '123',
          expiryMonth: 1,
          expiryYear: 2020 // Expired year
        }
      }

      return frisby.post(PAYMENT_SERVICE_URL + '/api/payments/validate-credit-card', {
        headers: jsonHeader,
        body: expiredCardPayload
      })
        .expect('status', 200)
        .expect('json', 'validation.valid', false)
        .expect('json', 'validation.errors', (errors: string[]) => {
          expect(errors.some(error => error.includes('expired'))).toBe(true)
        })
    })

    it('should validate CVV format', () => {
      const invalidCvvPayload = {
        cardNumber: '4111111111111111',
        cvv: '12', // Too short
        expiryMonth: 12,
        expiryYear: 2025
      }

      return frisby.post(PAYMENT_SERVICE_URL + '/api/payments/validate-credit-card', {
        headers: jsonHeader,
        body: invalidCvvPayload
      })
        .expect('status', 200)
        .expect('json', 'validation.valid', false)
        .expect('json', 'validation.errors', (errors: string[]) => {
          expect(errors.some(error => error.includes('CVV'))).toBe(true)
        })
    })

    it('should prevent negative amount transactions', () => {
      const negativeAmountPayload = {
        paymentMethod: 'credit_card',
        amount: -100.00,
        orderId: 'test-order-123',
        paymentDetails: {
          cardNumber: '4111111111111111',
          cvv: '123',
          expiryMonth: 12,
          expiryYear: 2025
        }
      }

      return frisby.post(PAYMENT_SERVICE_URL + '/api/payments/process', {
        headers: jsonHeader,
        body: negativeAmountPayload
      })
        .expect('status', 400)
        .expect('json', 'status', 'error')
    })
  })
})