/*
 * Rubberduck Demo - Payment Verification Integration for Juice Shop
 * This module demonstrates how to integrate the payment verification
 * microservice with the existing Juice Shop payment flow.
 */

const PaymentServiceClient = require('./payment-client');
const PaymentVerificationClient = require('./payment-verification-client');
const { EventEmitter } = require('events');

class PaymentVerificationIntegration extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.paymentClient = new PaymentServiceClient({
      baseURL: options.paymentServiceUrl || 'http://localhost:3001',
      timeout: options.timeout || 30000
    });

    this.verificationClient = new PaymentVerificationClient({
      baseURL: options.verificationServiceUrl || 'http://localhost:3002',
      timeout: options.timeout || 30000
    });

    this.setupEventListeners();
    this.verificationResults = new Map();
  }

  setupEventListeners() {
    // Listen for payment events
    this.paymentClient.on('payment_initiated', (data) => {
      console.log(`Payment initiated: ${data.transactionId} for order ${data.orderId}`);
      this.emit('payment_started', data);
      
      // Automatically initiate verification after payment
      if (options?.autoVerify !== false) {
        this.verifyAfterPayment(data.transactionId, data.orderId);
      }
    });

    this.paymentClient.on('payment_failed', (data) => {
      console.error(`Payment failed for order ${data.orderId}: ${data.error}`);
      this.emit('payment_error', data);
    });

    // Listen for verification events
    this.verificationClient.on('verification_initiated', (data) => {
      console.log(`Verification initiated: ${data.verificationId} for transaction ${data.transactionId}`);
      this.emit('verification_started', data);
    });

    this.verificationClient.on('verification_error', (data) => {
      console.error(`Verification failed for transaction ${data.transactionId}: ${data.error}`);
      this.emit('verification_error', data);
    });

    this.verificationClient.on('order_payment_verified', (data) => {
      console.log(`Order payment verification result: ${data.orderId} - ${data.verified ? 'Verified' : 'Not Verified'}`);
      this.emit('order_verification_completed', data);
    });
  }

  /**
   * Process payment and automatically verify it
   */
  async processAndVerifyPayment(paymentData) {
    try {
      // Step 1: Process the payment
      const paymentResult = await this.paymentClient.processPayment(paymentData);
      
      if (!paymentResult.success) {
        this.emit('payment_verification_failed', {
          orderId: paymentData.orderId,
          error: 'Payment processing failed',
          paymentError: paymentResult.error
        });
        
        return {
          success: false,
          error: paymentResult.error,
          stage: 'payment'
        };
      }
      
      // Step 2: Verify the payment
      const verificationResult = await this.verifyTransaction(
        paymentResult.transactionId, 
        paymentData.orderId,
        paymentData.amount
      );
      
      // Store verification result
      this.verificationResults.set(paymentResult.transactionId, verificationResult);
      
      // Determine overall success
      const verified = verificationResult.success && 
                     verificationResult.data && 
                     (verificationResult.data.status === 'completed' || 
                      verificationResult.data.status === 'pending');
      
      if (verified) {
        this.emit('payment_verification_success', {
          orderId: paymentData.orderId,
          transactionId: paymentResult.transactionId,
          verificationId: verificationResult.verificationId
        });
      } else {
        this.emit('payment_verification_failed', {
          orderId: paymentData.orderId,
          transactionId: paymentResult.transactionId,
          error: 'Verification failed',
          verificationError: verificationResult.error
        });
      }
      
      return {
        success: verified,
        transactionId: paymentResult.transactionId,
        verificationId: verificationResult.verificationId,
        payment: paymentResult,
        verification: verificationResult
      };

    } catch (error) {
      console.error(`Payment and verification error for order ${paymentData.orderId}:`, error);
      
      this.emit('payment_verification_error', {
        orderId: paymentData.orderId,
        error: error.message
      });

      return {
        success: false,
        error: 'Payment and verification system error',
        details: error.message
      };
    }
  }

  /**
   * Verify a transaction that was already processed
   */
  async verifyTransaction(transactionId, orderId, expectedAmount) {
    try {
      // Initiate verification
      const verification = await this.verificationClient.verifyTransaction(transactionId, {
        orderId,
        expectedAmount
      });
      
      if (!verification.success) {
        return {
          success: false,
          error: verification.error,
          verificationId: verification.verificationId
        };
      }
      
      // Poll for verification status
      const verificationId = verification.verificationId;
      const status = await this.pollVerificationStatus(verificationId);
      
      return {
        success: true,
        verificationId,
        data: status.data
      };
      
    } catch (error) {
      console.error(`Transaction verification error for ${transactionId}:`, error);
      return {
        success: false,
        error: 'Verification process error'
      };
    }
  }

  /**
   * Poll for verification status until completed or timeout
   */
  async pollVerificationStatus(verificationId, maxAttempts = 10, interval = 1000) {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const status = await this.verificationClient.getVerificationStatus(verificationId);
      
      if (!status.success) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, interval));
        continue;
      }
      
      if (status.data.status === 'completed' || status.data.status === 'failed' || status.data.status === 'error') {
        return status;
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    // Timeout - return the last status
    return await this.verificationClient.getVerificationStatus(verificationId);
  }

  /**
   * Verify payment for an order
   */
  async verifyOrderPayment(orderId) {
    return await this.verificationClient.verifyOrderPayment(orderId);
  }

  /**
   * Automatically verify after payment (usually triggered by event)
   */
  async verifyAfterPayment(transactionId, orderId, expectedAmount = null) {
    try {
      // Get transaction details if amount not provided
      if (expectedAmount === null) {
        const transactionStatus = await this.paymentClient.getTransactionStatus(transactionId);
        if (transactionStatus.success) {
          expectedAmount = transactionStatus.data.amount;
        }
      }
      
      // Verify the transaction
      const verification = await this.verifyTransaction(transactionId, orderId, expectedAmount);
      
      if (verification.success && verification.data.result === 'valid') {
        this.emit('payment_auto_verified', {
          transactionId,
          orderId,
          verificationId: verification.verificationId
        });
      } else {
        this.emit('payment_auto_verification_failed', {
          transactionId,
          orderId,
          verificationId: verification.verificationId,
          issues: verification.data?.issues || []
        });
        
        // Optionally notify someone about the verification failure
        await this.verificationClient.notifyPaymentStatus(
          transactionId, 
          'verification_failed',
          'email'
        );
      }
      
      return verification;
    } catch (error) {
      console.error(`Auto-verification error for transaction ${transactionId}:`, error);
      this.emit('payment_auto_verification_error', {
        transactionId,
        orderId,
        error: error.message
      });
      
      return {
        success: false,
        error: 'Auto-verification error'
      };
    }
  }

  /**
   * Get verification result for a transaction
   */
  getVerificationResult(transactionId) {
    return this.verificationResults.get(transactionId);
  }

  /**
   * Check both payment services health
   */
  async checkServicesHealth() {
    try {
      const paymentHealth = await this.paymentClient.healthCheck();
      const verificationHealth = await this.verificationClient.healthCheck();
      
      return {
        success: true,
        allHealthy: paymentHealth.healthy && verificationHealth.healthy,
        services: {
          payment: {
            healthy: paymentHealth.healthy,
            timestamp: paymentHealth.timestamp
          },
          verification: {
            healthy: verificationHealth.healthy,
            timestamp: verificationHealth.timestamp
          }
        }
      };
    } catch (error) {
      console.error('Health check error:', error);
      return {
        success: false,
        allHealthy: false,
        error: 'Health check failed'
      };
    }
  }

  /**
   * Start a reconciliation process
   */
  async reconcilePayments(options = {}) {
    return await this.verificationClient.reconcilePayments(options);
  }

  /**
   * Get verification analytics
   */
  async getVerificationAnalytics() {
    return await this.verificationClient.getVerificationAnalytics();
  }
}

module.exports = PaymentVerificationIntegration;
