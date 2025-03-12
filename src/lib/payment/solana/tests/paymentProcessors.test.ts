// src/lib/payment/solana/tests/paymentProcessors.test.ts
import { PublicKey, Transaction, SystemProgram, Connection } from '@solana/web3.js';
import { processSolPayment } from '../solPaymentProcessor';
import { processTokenPayment } from '../tokenPaymentProcessor';
import { processPayment } from '../index';
import { WalletConfig, PaymentRequest } from '../../types';
import { ErrorCategory } from '../../types';
import { jest } from '@jest/globals';

// Mock data
const mockWalletConfig: WalletConfig = {
  publicKey: new PublicKey('6ghQYEsbBRC4udcJThSDGoGkKWmrFdDDE6hjXWReG4LC'),
  signTransaction: jest.fn(),
  connected: true
};

const mockPaymentRequest: PaymentRequest = {
  amount: 0.1,
  token: 'SOL',
  recipientWallet: '6ghQYEsbBRC4udcJThSDGoGkKWmrFdDDE6hjXWReG4LC',
  metadata: {
    imageId: 123,
    positionX: 100,
    positionY: 200,
    width: 300,
    height: 400,
    fileName: 'test.png',
    paymentId: 'pay_123456'
  }
};

// Mock the Connection class to avoid real network calls
jest.mock('@solana/web3.js', () => {
  const originalModule = jest.requireActual('@solana/web3.js');
  
  return {
    ...originalModule,
    Connection: jest.fn().mockImplementation(() => ({
      getBalance: jest.fn().mockResolvedValue(1_000_000_000), // 1 SOL
      getLatestBlockhash: jest.fn().mockResolvedValue({
        blockhash: 'mockblockhash',
        lastValidBlockHeight: 100
      }),
      sendRawTransaction: jest.fn().mockResolvedValue('mock_signature'),
      confirmTransaction: jest.fn().mockResolvedValue({ 
        value: { err: null } 
      }),
      getSignatureStatus: jest.fn().mockResolvedValue({
        value: { err: null }
      }),
      getTokenAccountBalance: jest.fn().mockResolvedValue({
        value: { uiAmount: 10.0 }
      }),
      getAccountInfo: jest.fn().mockResolvedValue({
        lamports: 1_000_000_000,
        data: Buffer.from('test')
      })
    }))
  };
});

// Mock SPL Token module
jest.mock('@solana/spl-token', () => {
  return {
    createTransferCheckedInstruction: jest.fn(),
    getAssociatedTokenAddress: jest.fn().mockResolvedValue(new PublicKey('6ghQYEsbBRC4udcJThSDGoGkKWmrFdDDE6hjXWReG4LC')),
    getMint: jest.fn().mockResolvedValue({
      decimals: 9,
      isInitialized: true
    }),
    getAccount: jest.fn().mockResolvedValue({
      amount: BigInt('10000000000'),
      mint: new PublicKey('6ghQYEsbBRC4udcJThSDGoGkKWmrFdDDE6hjXWReG4LC'),
      owner: new PublicKey('6ghQYEsbBRC4udcJThSDGoGkKWmrFdDDE6hjXWReG4LC')
    }),
    TokenAccountNotFoundError: class TokenAccountNotFoundError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'TokenAccountNotFoundError';
      }
    }
  };
});

// Set up for each test
beforeEach(() => {
  jest.clearAllMocks();
  // Mock successful transaction signing
  (mockWalletConfig.signTransaction as jest.Mock).mockImplementation((tx: Transaction) => {
    // Add a dummy signature
    tx.signatures.push({
      publicKey: mockWalletConfig.publicKey!,
      signature: Buffer.from('mock_signature')
    });
    return Promise.resolve(tx);
  });
});

describe('SOL Payment Processor', () => {
  test('should process SOL payment successfully', async () => {
    const result = await processSolPayment(mockPaymentRequest, mockWalletConfig);
    
    expect(result.success).toBe(true);
    expect(result.transactionHash).toBe('mock_signature');
    expect(result.blockchainConfirmation).toBe(true);
  });
  
  test('should fail when wallet not connected', async () => {
    const disconnectedWallet = { ...mockWalletConfig, connected: false, publicKey: null };
    
    const result = await processSolPayment(mockPaymentRequest, disconnectedWallet);
    
    expect(result.success).toBe(false);
    expect(result.error?.category).toBe(ErrorCategory.WALLET_ERROR);
  });
  
  test('should fail on insufficient balance', async () => {
    // Mock getBalance to return insufficient funds
    (Connection.prototype.getBalance as jest.Mock).mockResolvedValueOnce(1000); // 0.000001 SOL
    
    const result = await processSolPayment(mockPaymentRequest, mockWalletConfig);
    
    expect(result.success).toBe(false);
    expect(result.error?.category).toBe(ErrorCategory.BALANCE_ERROR);
  });
  
  test('should handle user rejection', async () => {
    // Mock user rejecting the transaction
    (mockWalletConfig.signTransaction as jest.Mock).mockRejectedValueOnce(new Error('User rejected the transaction'));
    
    const result = await processSolPayment(mockPaymentRequest, mockWalletConfig);
    
    expect(result.success).toBe(false);
    expect(result.error?.category).toBe(ErrorCategory.USER_REJECTION);
  });
});

describe('Token Payment Processor', () => {
  const tokenPaymentRequest: PaymentRequest = {
    ...mockPaymentRequest,
    token: 'USDC'
  };
  
  const mockMintAddress = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
  
  test('should process token payment successfully', async () => {
    const result = await processTokenPayment(tokenPaymentRequest, mockMintAddress, mockWalletConfig);
    
    expect(result.success).toBe(true);
    expect(result.transactionHash).toBe('mock_signature');
    expect(result.blockchainConfirmation).toBe(true);
  });
  
  test('should fail when wallet not connected', async () => {
    const disconnectedWallet = { ...mockWalletConfig, connected: false, publicKey: null };
    
    const result = await processTokenPayment(tokenPaymentRequest, mockMintAddress, disconnectedWallet);
    
    expect(result.success).toBe(false);
    expect(result.error?.category).toBe(ErrorCategory.WALLET_ERROR);
  });
  
  test('should handle token account not found error', async () => {
    const { TokenAccountNotFoundError } = require('@solana/spl-token');
    
    // Mock getAccount to throw TokenAccountNotFoundError
    const { getAccount } = require('@solana/spl-token');
    (getAccount as jest.Mock).mockRejectedValueOnce(new TokenAccountNotFoundError('Token account not found'));
    
    const result = await processTokenPayment(tokenPaymentRequest, mockMintAddress, mockWalletConfig);
    
    expect(result.success).toBe(false);
    expect(result.error?.category).toBe(ErrorCategory.WALLET_ERROR);
    expect(result.error?.message).toContain('token account');
  });
});

describe('Payment Processor Router', () => {
  test('should route SOL payments to SOL processor', async () => {
    const result = await processPayment(mockPaymentRequest, mockWalletConfig);
    
    expect(result.success).toBe(true);
    expect(result.transactionHash).toBe('mock_signature');
  });
  
  test('should route token payments to token processor', async () => {
    const tokenPaymentRequest: PaymentRequest = {
      ...mockPaymentRequest,
      token: 'USDC'
    };
    
    const mockMintAddress = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
    
    const result = await processPayment(tokenPaymentRequest, mockWalletConfig, mockMintAddress);
    
    expect(result.success).toBe(true);
    expect(result.transactionHash).toBe('mock_signature');
  });
  
  test('should fail for token payments without mint address', async () => {
    const tokenPaymentRequest: PaymentRequest = {
      ...mockPaymentRequest,
      token: 'USDC'
    };
    
    const result = await processPayment(tokenPaymentRequest, mockWalletConfig);
    
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('No mint address');
  });
});
