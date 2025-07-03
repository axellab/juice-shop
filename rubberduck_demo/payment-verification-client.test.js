/*
 * Rubberduck Demo - Payment Verification Client Tests
 * Unit tests for the payment verification client module
 */

const axios = require('axios');
const PaymentVerificationClient = require('./payment-verification-client');

// Mock axios
jest.mock('axios');

describe('PaymentVerificationClient', () => {
  let client;
  let mockAxiosCreate;
  let mockRequest;
  let mockPost;
  let mockGet;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup axios mock
    mockRequest = jest.fn();
    mockPost = jest.fn();
    mockGet = jest.fn();
    
    // Create a mock axios instance
    mockAxiosCreate = jest.spyOn(axios, 'create').mockReturnValue({
      request: mockRequest,
      post: mockPost,
      get: mockGet,
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    });
    
    // Create client instance
    client = new PaymentVerificationClient({
      baseURL: 'http://test-verification-service:3002',
      timeout: 5000,
      retryAttempts: 2,
      retryDelay: 100
    });
    
    // Spy on emit method
    jest.spyOn(client, 'emit');
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultClient = new PaymentVerificationClient();
      expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
        baseURL: 'http://localhost:3002',
        timeout: 30000
      }));
    });

    it('should initialize with provided options', () => {
      expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
        baseURL: 'http://test-verification-service:3002',
        timeout: 5000
      }));
    });
  });

  describe('verifyTransaction', () => {
    it('should verify transaction successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          status: 'success',
          verificationId: 'ver_12345',
          message: 'Verification initiated'
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Test data
      const transactionId = 'tx_12345';
      const options = { 
        detailed: true,
        source: 'payment_processor'
      };

      // Call the method
      const result = await client.verifyTransaction(transactionId, options);

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/api/verify/transaction', {
        transactionId,
        detailed: true,
        source: 'payment_processor'
      });
      expect(result).toEqual({
        success: true,
        verificationId: 'ver_12345',
        message: 'Verification initiated'
      });
      expect(client.emit).toHaveBeenCalledWith('verification_initiated', {
        transactionId: 'tx_12345',
        verificationId: 'ver_12345'
      });
    });

    it('should handle verification failure', async () => {
      // Setup mock error
      const error = new Error('Verification failed');
      mockPost.mockRejectedValue(error);

      // Call the method
      const result = await client.verifyTransaction('tx_12345');

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Verification failed'
      });
      expect(client.emit).toHaveBeenCalledWith('verification_error', {
        transactionId: 'tx_12345',
        error: 'Verification failed'
      });
    });
  });

  describe('getVerificationStatus', () => {
    it('should get verification status successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          status: 'success',
          data: {
            verificationId: 'ver_12345',
            status: 'completed',
            verified: true,
            timestamp: '2023-06-06T12:00:00Z'
          }
        }
      };
      mockGet.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.getVerificationStatus('ver_12345');

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/api/verify/status/ver_12345');
      expect(result).toEqual({
        success: true,
        data: {
          verificationId: 'ver_12345',
          status: 'completed',
          verified: true,
          timestamp: '2023-06-06T12:00:00Z'
        }
      });
    });

    it('should handle error when getting verification status', async () => {
      // Setup mock error
      const error = new Error('Status retrieval failed');
      mockGet.mockRejectedValue(error);

      // Call the method
      const result = await client.getVerificationStatus('invalid_id');

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Status retrieval failed'
      });
    });
  });

  describe('verifyOrderPayment', () => {
    it('should verify order payment successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          status: 'success',
          data: {
            orderId: 'order_123',
            paymentVerified: true,
            message: 'Payment verified',
            transactionId: 'tx_12345'
          }
        }
      };
      mockGet.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.verifyOrderPayment('order_123');

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/api/verify/order/order_123');
      expect(result).toEqual({
        success: true,
        verified: true,
        message: 'Payment verified',
        data: {
          orderId: 'order_123',
          paymentVerified: true,
          message: 'Payment verified',
          transactionId: 'tx_12345'
        }
      });
      expect(client.emit).toHaveBeenCalledWith('order_payment_verified', {
        orderId: 'order_123',
        verified: true
      });
    });

    it('should handle error when verifying order payment', async () => {
      // Setup mock error
      const error = new Error('Order verification failed');
      mockGet.mockRejectedValue(error);

      // Call the method
      const result = await client.verifyOrderPayment('invalid_order');

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Order verification failed'
      });
      expect(client.emit).toHaveBeenCalledWith('order_verification_error', {
        orderId: 'invalid_order',
        error: 'Order verification failed'
      });
    });
  });

  describe('reconcilePayments', () => {
    it('should initiate payment reconciliation successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          status: 'success',
          reconciliationId: 'rec_12345',
          message: 'Reconciliation initiated'
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Test options
      const options = {
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        paymentProvider: 'all'
      };

      // Call the method
      const result = await client.reconcilePayments(options);

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/api/verify/reconcile', options);
      expect(result).toEqual({
        success: true,
        reconciliationId: 'rec_12345',
        message: 'Reconciliation initiated'
      });
      expect(client.emit).toHaveBeenCalledWith('reconciliation_initiated', {
        reconciliationId: 'rec_12345'
      });
    });

    it('should handle reconciliation failure', async () => {
      // Setup mock error
      const error = new Error('Reconciliation failed');
      mockPost.mockRejectedValue(error);

      // Call the method
      const result = await client.reconcilePayments({});

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Reconciliation failed'
      });
      expect(client.emit).toHaveBeenCalledWith('reconciliation_error', {
        error: 'Reconciliation failed'
      });
    });
  });

  describe('notifyPaymentStatus', () => {
    it('should send payment status notification successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          status: 'success',
          notificationId: 'notif_12345',
          message: 'Notification sent'
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.notifyPaymentStatus('tx_12345', 'completed', 'email');

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/api/notify/payment-status', {
        transactionId: 'tx_12345',
        status: 'completed',
        target: 'email'
      });
      expect(result).toEqual({
        success: true,
        notificationId: 'notif_12345',
        message: 'Notification sent'
      });
      expect(client.emit).toHaveBeenCalledWith('notification_sent', {
        transactionId: 'tx_12345',
        status: 'completed',
        target: 'email'
      });
    });

    it('should handle notification failure', async () => {
      // Setup mock error
      const error = new Error('Notification failed');
      mockPost.mockRejectedValue(error);

      // Call the method
      const result = await client.notifyPaymentStatus('tx_12345', 'completed');

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Notification failed'
      });
      expect(client.emit).toHaveBeenCalledWith('notification_error', {
        transactionId: 'tx_12345',
        error: 'Notification failed'
      });
    });
  });

  describe('getVerificationAnalytics', () => {
    it('should get verification analytics successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          status: 'success',
          data: {
            totalVerifications: 100,
            successRate: 95,
            failureRate: 5,
            averageVerificationTime: 2.3
          }
        }
      };
      mockGet.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.getVerificationAnalytics();

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/api/verify/analytics');
      expect(result).toEqual({
        success: true,
        data: {
          totalVerifications: 100,
          successRate: 95,
          failureRate: 5,
          averageVerificationTime: 2.3
        }
      });
    });

    it('should handle error when getting analytics', async () => {
      // Setup mock error
      const error = new Error('Analytics retrieval failed');
      mockGet.mockRejectedValue(error);

      // Call the method
      const result = await client.getVerificationAnalytics();

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Analytics retrieval failed'
      });
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when service is healthy', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          status: 'healthy',
          service: 'payment-verification-service',
          timestamp: '2023-06-06T12:00:00Z'
        }
      };
      mockGet.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.healthCheck();

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/health');
      expect(result).toEqual({
        success: true,
        healthy: true,
        service: 'payment-verification-service',
        timestamp: '2023-06-06T12:00:00Z'
      });
    });

    it('should return unhealthy status when service is down', async () => {
      // Setup mock error
      const error = new Error('Connection refused');
      mockGet.mockRejectedValue(error);

      // Call the method
      const result = await client.healthCheck();

      // Assertions
      expect(result).toEqual({
        success: false,
        healthy: false,
        error: 'Connection refused'
      });
    });
  });

  describe('retryRequest', () => {
    it('should retry a failed request successfully', async () => {
      // Setup mock behavior to fail once then succeed
      mockRequest
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: 'success' });

      // Create a config object
      const config = {
        method: 'get',
        url: '/test'
      };

      // Call the method
      const result = await client.retryRequest(config);

      // Assertions
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: 'success' });
    });

    it('should throw error after max retries', async () => {
      // Setup mock to always fail
      const error = new Error('Persistent error');
      error.config = { url: '/test' };
      mockRequest.mockRejectedValue(error);

      // Create a config object
      const config = {
        method: 'get',
        url: '/test',
        retryCount: 0
      };

      // Call the method and expect it to fail after retries
      try {
        await client.retryRequest(config);
        fail('Should have thrown an error');
      } catch (e) {
        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(e.message).toBe('Persistent error');
      }
    });
  });
});
