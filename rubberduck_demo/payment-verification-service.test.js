/*
 * Rubberduck Demo - Payment Verification Service Tests
 * Focused tests for validation and outbound request hardening
 */

const mockApp = {
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  listen: jest.fn()
};

const mockJson = jest.fn(() => 'json-middleware');
const mockUrlencoded = jest.fn(() => 'urlencoded-middleware');
const mockCors = jest.fn(() => 'cors-middleware');
const mockAxiosGet = jest.fn();

jest.mock('express', () => jest.fn(() => mockApp), { virtual: true });
jest.mock('cors', () => mockCors, { virtual: true });
jest.mock('body-parser', () => ({
  json: mockJson,
  urlencoded: mockUrlencoded
}), { virtual: true });
jest.mock('axios', () => ({
  get: mockAxiosGet
}), { virtual: true });

const PaymentVerificationService = require('./payment-verification-service');

const createResponse = () => {
  const response = {
    status: jest.fn(),
    json: jest.fn()
  };

  response.status.mockReturnValue(response);
  return response;
};

describe('PaymentVerificationService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentVerificationService();
  });

  it('rejects malformed verification input before starting background processing', async () => {
    const response = createResponse();

    await service.verifyTransaction({
      body: {
        transactionId: 'bad id',
        orderId: 'order_123',
        expectedAmount: '10.50'
      }
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      code: 'INVALID_TRANSACTION_ID'
    }));
  });

  it('rejects invalid expected amounts', async () => {
    const response = createResponse();

    await service.verifyTransaction({
      body: {
        transactionId: 'tx_123',
        expectedAmount: '-1'
      }
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      code: 'INVALID_EXPECTED_AMOUNT'
    }));
  });

  it('rejects invalid reconciliation filters', async () => {
    const response = createResponse();

    await service.reconcilePayments({
      body: {
        startDate: '2026-02-01T00:00:00Z',
        endDate: '2026-01-01T00:00:00Z'
      }
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      message: 'Start date must be before or equal to end date'
    }));
  });

  it('rejects invalid notification channels', async () => {
    const response = createResponse();

    await service.notifyPaymentStatus({
      body: {
        transactionId: 'tx_123',
        status: 'completed',
        target: 'ftp'
      }
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      message: 'Notification target is invalid'
    }));
  });

  it('uses an encoded URL and timeout when fetching transaction details', async () => {
    mockAxiosGet.mockResolvedValue({
      data: {
        status: 'success',
        data: {
          id: 'tx_123',
          status: 'completed',
          amount: 19.99
        }
      }
    });

    const result = await service.fetchTransactionDetails('tx_123');

    expect(mockAxiosGet).toHaveBeenCalledWith(
      'http://localhost:3001/api/payments/transaction/tx_123',
      expect.objectContaining({ timeout: 5000 })
    );
    expect(result).toEqual(expect.objectContaining({
      id: 'tx_123',
      status: 'completed',
      amount: 19.99
    }));
  });
});
