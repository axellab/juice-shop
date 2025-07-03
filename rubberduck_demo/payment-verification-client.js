/*
 * Rubberduck Demo - Payment Verification Client for Juice Shop
 * This client library provides an interface to interact with the 
 * Payment Verification Microservice.
 */

const axios = require('axios');
const EventEmitter = require('events');

class PaymentVerificationClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.baseURL = options.baseURL || process.env.PAYMENT_VERIFICATION_URL || 'http://localhost:3002';
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': 'juice-shop-verification-client'
      }
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use((config) => {
      // You could add authentication headers here if needed
      return config;
    }, (error) => {
      return Promise.reject(error);
    });

    // Response interceptor
    this.client.interceptors.response.use((response) => {
      return response;
    }, async (error) => {
      if (this.shouldRetry(error)) {
        return this.retryRequest(error.config);
      }
      return Promise.reject(error);
    });
  }

  shouldRetry(error) {
    // Determine if we should retry the request
    const { config } = error;
    
    // Only retry on network errors or 5xx status codes
    if (!error.response || (error.response.status >= 500 && error.response.status < 600)) {
      // Check if we've already tried too many times
      config.retryCount = config.retryCount || 0;
      return config.retryCount < this.retryAttempts;
    }
    
    return false;
  }

  async retryRequest(config, attempt = 1) {
    // Exponential backoff
    const delay = this.retryDelay * Math.pow(2, attempt - 1);
    
    // Wait for the delay
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Increment retry count
    config.retryCount = attempt;
    
    // Log retry attempt
    console.log(`Retrying request to ${config.url} (attempt ${attempt})`);
    
    // Try again
    return this.client.request(config);
  }

  /**
   * Verify a payment transaction
   */
  async verifyTransaction(transactionId, options = {}) {
    try {
      const payload = {
        transactionId,
        ...options
      };
      
      const response = await this.client.post('/api/verify/transaction', payload);
      
      this.emit('verification_initiated', {
        transactionId,
        verificationId: response.data.verificationId
      });

      return {
        success: response.data.status === 'success',
        verificationId: response.data.verificationId,
        message: response.data.message
      };
    } catch (error) {
      console.error('[VerificationClient] Transaction verification failed:', error.message);
      
      this.emit('verification_error', {
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
   * Get verification status
   */
  async getVerificationStatus(verificationId) {
    try {
      const response = await this.client.get(`/api/verify/status/${verificationId}`);
      
      return {
        success: response.data.status === 'success',
        data: response.data.data
      };
    } catch (error) {
      console.error('[VerificationClient] Get verification status failed:', error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Verify payment for an order
   */
  async verifyOrderPayment(orderId) {
    try {
      const response = await this.client.get(`/api/verify/order/${orderId}`);
      
      this.emit('order_payment_verified', {
        orderId,
        verified: response.data.data?.paymentVerified
      });

      return {
        success: response.data.status === 'success',
        verified: response.data.data?.paymentVerified,
        message: response.data.data?.message,
        data: response.data.data
      };
    } catch (error) {
      console.error('[VerificationClient] Order payment verification failed:', error.message);
      
      this.emit('order_verification_error', {
        orderId,
        error: error.message
      });

      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Start payment reconciliation process
   */
  async reconcilePayments(options = {}) {
    try {
      const response = await this.client.post('/api/verify/reconcile', options);
      
      this.emit('reconciliation_initiated', {
        reconciliationId: response.data.reconciliationId
      });

      return {
        success: response.data.status === 'success',
        reconciliationId: response.data.reconciliationId,
        message: response.data.message
      };
    } catch (error) {
      console.error('[VerificationClient] Payment reconciliation failed:', error.message);
      
      this.emit('reconciliation_error', {
        error: error.message
      });

      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Send payment status notification
   */
  async notifyPaymentStatus(transactionId, status, target = 'email') {
    try {
      const response = await this.client.post('/api/notify/payment-status', {
        transactionId,
        status,
        target
      });
      
      this.emit('notification_sent', {
        transactionId,
        status,
        target
      });

      return {
        success: response.data.status === 'success',
        notificationId: response.data.notificationId,
        message: response.data.message
      };
    } catch (error) {
      console.error('[VerificationClient] Payment notification failed:', error.message);
      
      this.emit('notification_error', {
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
   * Get verification analytics
   */
  async getVerificationAnalytics() {
    try {
      const response = await this.client.get('/api/verify/analytics');
      
      return {
        success: response.data.status === 'success',
        data: response.data.data
      };
    } catch (error) {
      console.error('[VerificationClient] Get analytics failed:', error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      
      return {
        success: true,
        healthy: response.data.status === 'healthy',
        service: response.data.service,
        timestamp: response.data.timestamp
      };
    } catch (error) {
      console.error('[VerificationClient] Health check failed:', error.message);
      
      return {
        success: false,
        healthy: false,
        error: error.message
      };
    }
  }
}

module.exports = PaymentVerificationClient;
