/*
 * Rubberduck Demo - Payment Service Client
 * Integration module to connect Juice Shop with the Payment Microservice
 */

const axios = require('axios');
const EventEmitter = require('events');

class PaymentServiceClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.baseURL = options.baseURL || process.env.PAYMENT_SERVICE_URL || 'http://localhost:3001';
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Client': 'juice-shop'
      }
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[PaymentClient] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[PaymentClient] Request error:', error.message);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (this.shouldRetry(error)) {
          return this.retryRequest(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  shouldRetry(error) {
    return (
      error.response?.status >= 500 ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT'
    );
  }

  async retryRequest(config, attempt = 1) {
    if (attempt > this.retryAttempts) {
      throw new Error('Max retry attempts reached');
    }

    console.log(`[PaymentClient] Retrying request (attempt ${attempt}/${this.retryAttempts})`);
    
    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
    
    try {
      return await this.client.request(config);
    } catch (error) {
      if (this.shouldRetry(error) && attempt < this.retryAttempts) {
        return this.retryRequest(config, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Process a payment transaction
   */
  async processPayment(paymentData) {
    try {
      const response = await this.client.post('/api/payments/process', paymentData);
      
      this.emit('payment_initiated', {
        transactionId: response.data.transactionId,
        orderId: paymentData.orderId,
        amount: paymentData.amount
      });

      return {
        success: response.data.status === 'success',
        transactionId: response.data.transactionId,
        message: response.data.message,
        data: response.data.data,
        error: response.data.status === 'error' ? response.data.message : null
      };
    } catch (error) {
      console.error('[PaymentClient] Payment processing failed:', error.message);
      
      this.emit('payment_failed', {
        orderId: paymentData.orderId,
        error: error.message
      });

      return {
        success: false,
        error: error.response?.data?.message || error.message,
        code: error.response?.data?.code || 'NETWORK_ERROR'
      };
    }
  }

  /**
   * Validate payment details before processing
   */
  async validatePayment(paymentMethod, paymentDetails) {
    try {
      const response = await this.client.post('/api/payments/validate', {
        paymentMethod,
        paymentDetails
      });

      return {
        valid: response.data.valid,
        paymentMethod: response.data.paymentMethod,
        errors: response.data.errors || []
      };
    } catch (error) {
      console.error('[PaymentClient] Payment validation failed:', error.message);
      return {
        valid: false,
        errors: [error.response?.data?.message || error.message]
      };
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionId) {
    try {
      const response = await this.client.get(`/api/payments/transaction/${transactionId}`);
      return {
        success: true,
        data: response.data.data
      };
    } catch (error) {
      console.error('[PaymentClient] Failed to get transaction status:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Process a refund
   */
  async processRefund(transactionId, amount, reason) {
    try {
      const response = await this.client.post('/api/payments/refund', {
        transactionId,
        amount,
        reason
      });

      this.emit('refund_initiated', {
        refundId: response.data.refundId,
        transactionId,
        amount
      });

      return {
        success: response.data.status === 'success',
        refundId: response.data.refundId,
        message: response.data.message,
        data: response.data.data
      };
    } catch (error) {
      console.error('[PaymentClient] Refund processing failed:', error.message);
      
      this.emit('refund_failed', {
        transactionId,
        error: error.message
      });

      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Validate credit card details
   */
  async validateCreditCard(cardDetails) {
    try {
      const response = await this.client.post('/api/payments/methods/validate-card', cardDetails);
      return {
        valid: response.data.validation.valid,
        errors: response.data.validation.errors
      };
    } catch (error) {
      console.error('[PaymentClient] Card validation failed:', error.message);
      return {
        valid: false,
        errors: [error.response?.data?.message || error.message]
      };
    }
  }

  /**
   * Tokenize payment method for secure storage
   */
  async tokenizePaymentMethod(paymentMethod, paymentDetails) {
    try {
      const response = await this.client.post('/api/payments/methods/tokenize', {
        paymentMethod,
        paymentDetails
      });

      return {
        success: true,
        token: response.data.token,
        lastFour: response.data.lastFour,
        paymentMethod: response.data.paymentMethod
      };
    } catch (error) {
      console.error('[PaymentClient] Tokenization failed:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Charge wallet from external payment method
   */
  async chargeWallet(userId, amount, paymentMethodId) {
    try {
      const response = await this.client.post('/api/payments/wallet/charge', {
        userId,
        amount,
        paymentMethodId
      });

      this.emit('wallet_charged', {
        userId,
        amount,
        newBalance: response.data.data?.newBalance
      });

      return {
        success: response.data.status === 'success',
        message: response.data.message,
        data: response.data.data
      };
    } catch (error) {
      console.error('[PaymentClient] Wallet charge failed:', error.message);
      
      this.emit('wallet_charge_failed', {
        userId,
        amount,
        error: error.message
      });

      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(userId) {
    try {
      const response = await this.client.post('/api/payments/wallet/balance', { userId });
      return {
        success: true,
        balance: response.data.data.balance,
        currency: response.data.data.currency
      };
    } catch (error) {
      console.error('[PaymentClient] Failed to get wallet balance:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        balance: 0
      };
    }
  }

  /**
   * Get payment history for a user
   */
  async getPaymentHistory(userId, options = {}) {
    try {
      const params = new URLSearchParams({
        limit: options.limit || 50,
        offset: options.offset || 0,
        ...(options.status && { status: options.status })
      });

      const response = await this.client.get(`/api/payments/history/${userId}?${params}`);
      return {
        success: true,
        data: response.data.data
      };
    } catch (error) {
      console.error('[PaymentClient] Failed to get payment history:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        data: { transactions: [], total: 0 }
      };
    }
  }

  /**
   * Get payment analytics
   */
  async getPaymentAnalytics() {
    try {
      const response = await this.client.get('/api/payments/analytics');
      return {
        success: true,
        data: response.data.data
      };
    } catch (error) {
      console.error('[PaymentClient] Failed to get payment analytics:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Health check for the payment service
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return {
        healthy: response.data.status === 'healthy',
        data: response.data
      };
    } catch (error) {
      console.error('[PaymentClient] Health check failed:', error.message);
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Create a payment session for multi-step transactions
   */
  async createPaymentSession(sessionData) {
    // This would be used for complex payment flows
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store session data temporarily (in a real implementation, this would be in Redis or similar)
    this._sessions = this._sessions || new Map();
    this._sessions.set(sessionId, {
      ...sessionData,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
    });

    return {
      success: true,
      sessionId,
      expiresAt: this._sessions.get(sessionId).expiresAt
    };
  }

  /**
   * Complete a payment session
   */
  async completePaymentSession(sessionId, finalPaymentData) {
    if (!this._sessions || !this._sessions.has(sessionId)) {
      return {
        success: false,
        error: 'Invalid or expired session'
      };
    }

    const session = this._sessions.get(sessionId);
    const now = new Date();
    
    if (new Date(session.expiresAt) < now) {
      this._sessions.delete(sessionId);
      return {
        success: false,
        error: 'Session expired'
      };
    }

    // Merge session data with final payment data
    const completePaymentData = {
      ...session,
      ...finalPaymentData
    };

    // Process the payment
    const result = await this.processPayment(completePaymentData);
    
    // Clean up session
    this._sessions.delete(sessionId);

    return result;
  }
}

module.exports = PaymentServiceClient;
