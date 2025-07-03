/*
 * Rubberduck Demo - Payment Service Client Tests
 * Unit tests for the payment service client module
 */

const axios = require('axios');
const PaymentServiceClient = require('./payment-client');

// Mock axios
jest.mock('axios');

describe('PaymentServiceClient', () => {
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
    client = new PaymentServiceClient({
      baseURL: 'http://test-payment-service:3001',
      timeout: 5000,
      retryAttempts: 2,
      retryDelay: 100
    });
    
    // Spy on emit method
    jest.spyOn(client, 'emit');
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultClient = new PaymentServiceClient();
      expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
        baseURL: 'http://localhost:3001',
        timeout: 30000
      }));
    });

    it('should initialize with provided options', () => {
      expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({
        baseURL: 'http://test-payment-service:3001',
        timeout: 5000
      }));
    });
  });

  describe('processPayment', () => {
    it('should process payment successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          status: 'success',
          transactionId: 'tx_12345',
          message: 'Payment processed',
          data: { amount: 100, currency: 'USD' }
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Test data
      const paymentData = {
        amount: 100,
        currency: 'USD',
        paymentMethod: 'credit_card',
        userId: 'user_123',
        orderId: 'order_456'
      };

      // Call the method
      const result = await client.processPayment(paymentData);

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/api/payments/process', paymentData);
      expect(result).toEqual({
        success: true,
        transactionId: 'tx_12345',
        message: 'Payment processed',
        data: { amount: 100, currency: 'USD' },
        error: null
      });
      expect(client.emit).toHaveBeenCalledWith('payment_initiated', {
        transactionId: 'tx_12345',
        orderId: 'order_456',
        amount: 100
      });
    });

    it('should handle payment failure', async () => {
      // Setup mock error
      const error = new Error('Network error');
      mockPost.mockRejectedValue(error);

      // Test data
      const paymentData = {
        amount: 100,
        currency: 'USD',
        paymentMethod: 'credit_card',
        userId: 'user_123',
        orderId: 'order_456'
      };

      // Call the method
      const result = await client.processPayment(paymentData);

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Network error',
        code: 'NETWORK_ERROR'
      });
      expect(client.emit).toHaveBeenCalledWith('payment_failed', {
        orderId: 'order_456',
        error: 'Network error'
      });
    });
  });

  describe('validatePayment', () => {
    it('should validate payment details successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          valid: true,
          paymentMethod: 'credit_card'
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Test data
      const paymentMethod = 'credit_card';
      const paymentDetails = { cardNumber: '4111111111111111', cvv: '123' };

      // Call the method
      const result = await client.validatePayment(paymentMethod, paymentDetails);

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/api/payments/validate', {
        paymentMethod,
        paymentDetails
      });
      expect(result).toEqual({
        valid: true,
        paymentMethod: 'credit_card',
        errors: []
      });
    });

    it('should handle validation failure', async () => {
      // Setup mock error
      const error = new Error('Validation error');
      error.response = {
        data: {
          message: 'Invalid card details'
        }
      };
      mockPost.mockRejectedValue(error);

      // Test data
      const paymentMethod = 'credit_card';
      const paymentDetails = { cardNumber: 'invalid', cvv: '123' };

      // Call the method
      const result = await client.validatePayment(paymentMethod, paymentDetails);

      // Assertions
      expect(result).toEqual({
        valid: false,
        errors: ['Invalid card details']
      });
    });
  });

  describe('getTransactionStatus', () => {
    it('should get transaction status successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          data: {
            transactionId: 'tx_12345',
            status: 'completed',
            amount: 100
          }
        }
      };
      mockGet.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.getTransactionStatus('tx_12345');

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/api/payments/transaction/tx_12345');
      expect(result).toEqual({
        success: true,
        data: {
          transactionId: 'tx_12345',
          status: 'completed',
          amount: 100
        }
      });
    });

    it('should handle error when getting transaction status', async () => {
      // Setup mock error
      const error = new Error('Not found');
      mockGet.mockRejectedValue(error);

      // Call the method
      const result = await client.getTransactionStatus('invalid_id');

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Not found'
      });
    });
  });

  describe('processRefund', () => {
    it('should process refund successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          status: 'success',
          refundId: 'refund_12345',
          message: 'Refund processed',
          data: { amount: 50 }
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.processRefund('tx_12345', 50, 'Customer request');

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/api/payments/refund', {
        transactionId: 'tx_12345',
        amount: 50,
        reason: 'Customer request'
      });
      expect(result).toEqual({
        success: true,
        refundId: 'refund_12345',
        message: 'Refund processed',
        data: { amount: 50 }
      });
      expect(client.emit).toHaveBeenCalledWith('refund_initiated', {
        refundId: 'refund_12345',
        transactionId: 'tx_12345',
        amount: 50
      });
    });

    it('should handle refund failure', async () => {
      // Setup mock error
      const error = new Error('Refund failed');
      mockPost.mockRejectedValue(error);

      // Call the method
      const result = await client.processRefund('tx_12345', 50, 'Customer request');

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Refund failed'
      });
      expect(client.emit).toHaveBeenCalledWith('refund_failed', {
        transactionId: 'tx_12345',
        error: 'Refund failed'
      });
    });
  });

  describe('validateCreditCard', () => {
    it('should validate credit card successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          validation: {
            valid: true,
            errors: []
          }
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Test data
      const cardDetails = {
        cardNumber: '4111111111111111',
        cvv: '123',
        expiryMonth: 12,
        expiryYear: 2025
      };

      // Call the method
      const result = await client.validateCreditCard(cardDetails);

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/api/payments/methods/validate-card', cardDetails);
      expect(result).toEqual({
        valid: true,
        errors: []
      });
    });

    it('should handle invalid credit card', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          validation: {
            valid: false,
            errors: ['Invalid card number']
          }
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Test data
      const cardDetails = {
        cardNumber: '1234',
        cvv: '123',
        expiryMonth: 12,
        expiryYear: 2025
      };

      // Call the method
      const result = await client.validateCreditCard(cardDetails);

      // Assertions
      expect(result).toEqual({
        valid: false,
        errors: ['Invalid card number']
      });
    });
  });

  describe('tokenizePaymentMethod', () => {
    it('should tokenize payment method successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          token: 'token_12345',
          lastFour: '1111',
          paymentMethod: 'credit_card'
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Test data
      const paymentMethod = 'credit_card';
      const paymentDetails = {
        cardNumber: '4111111111111111',
        cvv: '123'
      };

      // Call the method
      const result = await client.tokenizePaymentMethod(paymentMethod, paymentDetails);

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/api/payments/methods/tokenize', {
        paymentMethod,
        paymentDetails
      });
      expect(result).toEqual({
        success: true,
        token: 'token_12345',
        lastFour: '1111',
        paymentMethod: 'credit_card'
      });
    });

    it('should handle tokenization failure', async () => {
      // Setup mock error
      const error = new Error('Tokenization failed');
      mockPost.mockRejectedValue(error);

      // Call the method
      const result = await client.tokenizePaymentMethod('credit_card', {});

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Tokenization failed'
      });
    });
  });

  describe('chargeWallet', () => {
    it('should charge wallet successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          status: 'success',
          message: 'Wallet charged',
          data: { newBalance: 150 }
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.chargeWallet('user_123', 50, 'card_456');

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/api/payments/wallet/charge', {
        userId: 'user_123',
        amount: 50,
        paymentMethodId: 'card_456'
      });
      expect(result).toEqual({
        success: true,
        message: 'Wallet charged',
        data: { newBalance: 150 }
      });
      expect(client.emit).toHaveBeenCalledWith('wallet_charged', {
        userId: 'user_123',
        amount: 50,
        newBalance: 150
      });
    });

    it('should handle wallet charge failure', async () => {
      // Setup mock error
      const error = new Error('Charge failed');
      mockPost.mockRejectedValue(error);

      // Call the method
      const result = await client.chargeWallet('user_123', 50, 'card_456');

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Charge failed'
      });
      expect(client.emit).toHaveBeenCalledWith('wallet_charge_failed', {
        userId: 'user_123',
        amount: 50,
        error: 'Charge failed'
      });
    });
  });

  describe('getWalletBalance', () => {
    it('should get wallet balance successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          data: {
            balance: 100,
            currency: 'USD'
          }
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.getWalletBalance('user_123');

      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/api/payments/wallet/balance', { userId: 'user_123' });
      expect(result).toEqual({
        success: true,
        balance: 100,
        currency: 'USD'
      });
    });

    it('should handle error when getting wallet balance', async () => {
      // Setup mock error
      const error = new Error('Not found');
      mockPost.mockRejectedValue(error);

      // Call the method
      const result = await client.getWalletBalance('invalid_user');

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Not found',
        balance: 0
      });
    });
  });

  describe('getPaymentHistory', () => {
    it('should get payment history successfully with default options', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          data: {
            transactions: [{ id: 'tx_1' }, { id: 'tx_2' }],
            total: 2
          }
        }
      };
      mockGet.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.getPaymentHistory('user_123');

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/api/payments/history/user_123?limit=50&offset=0');
      expect(result).toEqual({
        success: true,
        data: {
          transactions: [{ id: 'tx_1' }, { id: 'tx_2' }],
          total: 2
        }
      });
    });

    it('should get payment history with custom options', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          data: {
            transactions: [{ id: 'tx_1' }],
            total: 1
          }
        }
      };
      mockGet.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.getPaymentHistory('user_123', {
        limit: 10,
        offset: 5,
        status: 'completed'
      });

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/api/payments/history/user_123?limit=10&offset=5&status=completed');
      expect(result).toEqual({
        success: true,
        data: {
          transactions: [{ id: 'tx_1' }],
          total: 1
        }
      });
    });
  });

  describe('getPaymentAnalytics', () => {
    it('should get payment analytics successfully', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          data: {
            totalTransactions: 100,
            totalVolume: 5000,
            successRate: 95
          }
        }
      };
      mockGet.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.getPaymentAnalytics();

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/api/payments/analytics');
      expect(result).toEqual({
        success: true,
        data: {
          totalTransactions: 100,
          totalVolume: 5000,
          successRate: 95
        }
      });
    });

    it('should handle error when getting analytics', async () => {
      // Setup mock error
      const error = new Error('Analytics error');
      mockGet.mockRejectedValue(error);

      // Call the method
      const result = await client.getPaymentAnalytics();

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Analytics error'
      });
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when service is healthy', async () => {
      // Setup mock response
      const mockResponse = {
        data: {
          status: 'healthy',
          service: 'payment-service',
          timestamp: '2023-06-06T12:00:00Z'
        }
      };
      mockGet.mockResolvedValue(mockResponse);

      // Call the method
      const result = await client.healthCheck();

      // Assertions
      expect(mockGet).toHaveBeenCalledWith('/health');
      expect(result).toEqual({
        healthy: true,
        data: {
          status: 'healthy',
          service: 'payment-service',
          timestamp: '2023-06-06T12:00:00Z'
        }
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
        healthy: false,
        error: 'Connection refused'
      });
    });
  });

  describe('createPaymentSession and completePaymentSession', () => {
    it('should create and complete a payment session successfully', async () => {
      // Setup mock response for processPayment
      const mockResponse = {
        data: {
          status: 'success',
          transactionId: 'tx_session_12345',
          message: 'Payment processed',
          data: { amount: 100, currency: 'USD' }
        }
      };
      mockPost.mockResolvedValue(mockResponse);

      // Session data
      const sessionData = {
        amount: 100,
        currency: 'USD',
        userId: 'user_123',
        orderId: 'order_456',
        items: [{ id: 'item_1', price: 100 }]
      };

      // Create session
      const createResult = await client.createPaymentSession(sessionData);
      expect(createResult.success).toBe(true);
      expect(createResult.sessionId).toBeDefined();

      // Final payment data
      const finalPaymentData = {
        paymentMethod: 'credit_card',
        paymentDetails: {
          cardNumber: '4111111111111111',
          cvv: '123'
        }
      };

      // Complete session
      const completeResult = await client.completePaymentSession(createResult.sessionId, finalPaymentData);
      
      // Assertions
      expect(mockPost).toHaveBeenCalledWith('/api/payments/process', expect.objectContaining({
        amount: 100,
        currency: 'USD',
        userId: 'user_123',
        orderId: 'order_456',
        paymentMethod: 'credit_card'
      }));
      
      expect(completeResult).toEqual({
        success: true,
        transactionId: 'tx_session_12345',
        message: 'Payment processed',
        data: { amount: 100, currency: 'USD' },
        error: null
      });
    });

    it('should handle invalid session ID', async () => {
      // Call the method with invalid session ID
      const result = await client.completePaymentSession('invalid_session', {});

      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Invalid or expired session'
      });
    });

    it('should handle expired session', async () => {
      // Create an expired session
      const sessionData = {
        amount: 100,
        userId: 'user_123'
      };
      
      // Create session
      const createResult = await client.createPaymentSession(sessionData);
      
      // Manually expire the session
      client._sessions.get(createResult.sessionId).expiresAt = new Date(Date.now() - 60000).toISOString();
      
      // Try to complete expired session
      const result = await client.completePaymentSession(createResult.sessionId, {});
      
      // Assertions
      expect(result).toEqual({
        success: false,
        error: 'Session expired'
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
      mockRequest.mockRejectedValue(new Error('Persistent error'));

      // Create a config object
      const config = {
        method: 'get',
        url: '/test'
      };

      // Call the method and expect it to throw
      await expect(client.retryRequest(config)).rejects.toThrow('Max retry attempts reached');
      
      // Should have tried the maximum number of attempts (1 initial + 2 retries)
      expect(mockRequest).toHaveBeenCalledTimes(3);
    });
  });
});
