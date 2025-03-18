'use client';

import { nanoid } from 'nanoid';
import { 
  PaymentResponse, 
  PaymentStatusResponse, 
  PaymentStatus, 
  PaymentError, 
  ErrorCategory,
  PaymentMetadata,
  WalletConfig,
  PaymentRequest
} from './types';
import { SolanaPaymentProvider } from './solana/solanaPaymentProvider';
import { getMintAddress, ACTIVE_PAYMENT_TOKEN, RECIPIENT_WALLET_ADDRESS } from '@/utils/constants';
import { paymentLogger } from '@/utils/logger/index';
import { formatErrorForUser } from './utils';

const PAYMENT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Client-side Payment Service that orchestrates the payment flow
 * This uses API endpoints for database operations instead of direct access
 */
export class ClientPaymentService {
  private paymentProvider: SolanaPaymentProvider;
  private activePayments: Map<string, any>;
  private paymentTimeouts: Map<string, NodeJS.Timeout>;
  private wallet: WalletConfig;
  private requestId: string;
  
  constructor(wallet: WalletConfig) {
    this.wallet = wallet;
    this.paymentProvider = new SolanaPaymentProvider(wallet);
    this.activePayments = new Map();
    this.paymentTimeouts = new Map();
    this.requestId = nanoid();
    
    // Log service initialization
    paymentLogger.info('Payment service initialized', {
      requestId: this.requestId,
      walletConnected: this.wallet.connected,
      walletAddress: this.wallet.publicKey?.toString()
    });
  }
  
  /**
   * Clean up resources
   */
  public dispose() {
    // Clear any active timeouts
    for (const [paymentId, timeout] of this.paymentTimeouts.entries()) {
      clearTimeout(timeout);
    }
    this.paymentTimeouts.clear();
    this.activePayments.clear();
  }
  
  /**
   * Restore a payment session from saved data
   * This is used to restore state from localStorage between page navigations
   */
  public restorePaymentSession(paymentId: string, paymentInfo: any): void {
    // Don't restore if payment is already in memory
    if (this.activePayments.has(paymentId)) {
      return;
    }
    
    // Store payment info in memory
    this.activePayments.set(paymentId, paymentInfo);
    
    // Set timeout for this payment if it's still active
    if (paymentInfo.status === PaymentStatus.INITIALIZED || 
        paymentInfo.status === PaymentStatus.PENDING || 
        paymentInfo.status === PaymentStatus.PROCESSING) {
      this.setPaymentTimeout(paymentId);
    }
    
    paymentLogger.info('Payment session restored', { 
      paymentId,
      status: paymentInfo.status,
      transactionId: paymentInfo.transactionId
    });
  }
  
  /**
   * Set a timeout for a payment
   */
  private setPaymentTimeout(paymentId: string) {
    // Clear any existing timeout
    if (this.paymentTimeouts.has(paymentId)) {
      clearTimeout(this.paymentTimeouts.get(paymentId)!);
    }
    
    // Set a new timeout
    const timeout = setTimeout(() => {
      this.handlePaymentTimeout(paymentId);
    }, PAYMENT_TIMEOUT_MS);
    
    this.paymentTimeouts.set(paymentId, timeout);
  }
  
  /**
   * Handle a payment timeout
   */
  private async handlePaymentTimeout(paymentId: string) {
    paymentLogger.warn('Payment timed out', { paymentId });
    
    // Try to cancel the payment
    await this.cancelPayment(paymentId);
    
    // Clean up
    this.paymentTimeouts.delete(paymentId);
    this.activePayments.delete(paymentId);
  }
  
  /**
   * Initialize a new payment using the server API
   */
  public async initializePayment(
    amount: number,
    metadata: PaymentMetadata
  ): Promise<PaymentResponse> {
    const context = {
      amount,
      token: ACTIVE_PAYMENT_TOKEN,
      imageId: metadata.imageId,
      walletConnected: this.wallet.connected,
      requestId: this.requestId
    };
    
    paymentLogger.info('Initializing payment', context);
    
    try {
      // Check if wallet is connected
      if (!this.wallet.connected || !this.wallet.publicKey) {
        paymentLogger.error('Payment initialization failed - wallet not connected', undefined, context);
        return {
          paymentId: '',
          status: PaymentStatus.FAILED,
          error: {
            category: ErrorCategory.WALLET_ERROR,
            message: 'Wallet not connected',
            retryable: false
          }
        };
      }
      
      // Call the server API to initialize the payment in the database
      const response = await fetch('/api/payment/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': this.requestId
        },
        body: JSON.stringify({
          imageId: metadata.imageId,
          amount,
          walletAddress: this.wallet.publicKey.toString(),
          token: ACTIVE_PAYMENT_TOKEN
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const error = {
          category: ErrorCategory.NETWORK_ERROR,
          message: errorData.error || 'Failed to initialize payment',
          retryable: true,
          details: errorData.details
        };
        
        paymentLogger.error('Failed to initialize payment', new Error(error.message), {
          ...context,
          statusCode: response.status,
          error
        });
        
        return {
          paymentId: '',
          status: PaymentStatus.FAILED,
          error
        };
      }
      
      const data = await response.json();
      const { paymentId, transactionId } = data;
      
      // Debug log to see what we're getting from the API
      console.log('===== DEBUG: CLIENT PAYMENT SERVICE INIT =====');
      console.log('Received from API:', { paymentId, transactionId });
      console.log('Response data:', data);
      
      // Store payment info in memory with consistent property naming
      this.activePayments.set(paymentId, {
        paymentId,
        transactionId,
        imageId: metadata.imageId,
        amount,
        status: PaymentStatus.INITIALIZED,
        walletAddress: this.wallet.publicKey.toString(),
        // Store using database field names
        start_position_x: metadata.positionX || 0,
        start_position_y: metadata.positionY || 0,
        size_x: metadata.width || 0,
        size_y: metadata.height || 0
      });
      
      // Debug log to confirm what's stored
      console.log('Stored payment info:', this.activePayments.get(paymentId));
      
      // Set timeout for this payment
      this.setPaymentTimeout(paymentId);
      
      paymentLogger.info('Payment initialized successfully', {
        ...context,
        paymentId,
        transactionId
      });
      
      return {
        paymentId,
        status: PaymentStatus.INITIALIZED,
        transactionId
      };
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      paymentLogger.error('Payment initialization failed', err, context);
      
      return {
        paymentId: '',
        status: PaymentStatus.FAILED,
        error: {
          category: ErrorCategory.UNKNOWN_ERROR,
          message: err.message,
          retryable: true,
          originalError: err
        }
      };
    }
  }
  
  /**
   * Process a payment using the blockchain
   */
  public async processPayment(paymentId: string): Promise<PaymentStatusResponse> {
    const context = { paymentId, requestId: this.requestId };
    
    console.log('===== DEBUG: PROCESSING PAYMENT =====');
    console.log('Payment ID:', paymentId);
    
    // Debug: Log all keys in the activePayments Map to see what's available
    const allKeys = Array.from(this.activePayments.keys());
    console.log('All active payment keys:', allKeys);
    console.log('Keys include paymentId?', allKeys.includes(paymentId));
    console.log('Keys exact match check:', allKeys.map(key => ({
      key,
      matches: key === paymentId,
      keyLength: key.length,
      paymentIdLength: paymentId.length
    })));
    
    console.log('All active payments:', Object.fromEntries(this.activePayments));
    
    // Try to get payment info directly by key and as a fallback try case-insensitive matching
    let paymentInfo = this.activePayments.get(paymentId);
    
    // If not found, try to find it by iterating through the Map (case-insensitive)
    if (!paymentInfo) {
      console.log('Payment not found by direct key access, trying alternative methods...');
      
      // Try to find a case-insensitive match
      for (const [key, value] of this.activePayments.entries()) {
        if (key.toLowerCase() === paymentId.toLowerCase()) {
          console.log('Found payment with case-insensitive match:', key);
          paymentInfo = value;
          break;
        }
      }
      
      // If still not found, check localStorage as a fallback
      if (!paymentInfo && typeof window !== 'undefined') {
        console.log('Trying to restore from localStorage...');
        try {
          const storedPaymentInfo = localStorage.getItem('image_board_payment_info');
          if (storedPaymentInfo) {
            const parsed = JSON.parse(storedPaymentInfo);
            if (parsed.paymentId === paymentId) {
              console.log('Found payment info in localStorage');
              paymentInfo = parsed;
              
              // Also add it back to the activePayments Map
              this.activePayments.set(paymentId, paymentInfo);
            }
          }
        } catch (err) {
          console.error('Error accessing localStorage:', err);
        }
      }
    }
    
    console.log('Found payment info:', paymentInfo);
    
    if (!paymentInfo) {
      const error = new Error('Payment session not found');
      paymentLogger.error('Payment session not found', error, context);
      
      return {
        paymentId,
        status: PaymentStatus.FAILED,
        error: {
          category: ErrorCategory.NETWORK_ERROR,
          message: 'Payment session not found',
          retryable: false
        }
      };
    }
    
    try {
      console.log('About to update payment status to PROCESSING');
      console.log('Using transaction ID:', paymentInfo.transactionId);
      
      // Update payment status to processing via API
      await fetch('/api/payment/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': this.requestId
        },
        body: JSON.stringify({
          transactionId: paymentInfo.transactionId,
          paymentId,
          status: PaymentStatus.PROCESSING
        })
      });
      
      // Create payment request for the blockchain
      const request: PaymentRequest = {
        amount: paymentInfo.amount,
        recipientWallet: RECIPIENT_WALLET_ADDRESS,
        token: ACTIVE_PAYMENT_TOKEN,
        metadata: {
          paymentId,
          imageId: paymentInfo.imageId,
          // Map to database field names
          positionX: paymentInfo.start_position_x || paymentInfo.positionX || paymentInfo.x || 0,
          positionY: paymentInfo.start_position_y || paymentInfo.positionY || paymentInfo.y || 0,
          width: paymentInfo.size_x || paymentInfo.width || 0,
          height: paymentInfo.size_y || paymentInfo.height || 0
        }
      };
      
      // Debug log to show the exact request being sent
      console.log('===== DEBUG: PAYMENT REQUEST =====');
      console.log('Request:', JSON.stringify(request, null, 2));
      
      // Process the payment with the blockchain
      const result = await this.paymentProvider.processPayment(
        request,
        ACTIVE_PAYMENT_TOKEN === 'SOL' ? null : getMintAddress()
      );
      
      // If successful, update payment status to confirmed
      if (result.success && result.transactionHash) {
        paymentLogger.info('Payment successful, updating status', {
          ...context,
          transactionHash: result.transactionHash
        });
        
        // Update payment status via API
        await fetch('/api/payment/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': this.requestId
          },
          body: JSON.stringify({
            transactionId: paymentInfo.transactionId,
            paymentId,
            status: PaymentStatus.CONFIRMED,
            transactionHash: result.transactionHash
          })
        });
        
        // Verify the transaction on the blockchain
        try {
          const verifyResponse = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': this.requestId
            },
            body: JSON.stringify({
              transactionHash: result.transactionHash,
              transactionId: paymentInfo.transactionId
            })
          });
          
          if (!verifyResponse.ok) {
            const errorText = await verifyResponse.text();
            paymentLogger.warn('Transaction verification returned non-200 status', {
              status: verifyResponse.status,
              response: errorText.substring(0, 200),
              transactionHash: result.transactionHash
            });
          } else {
            const verifyData = await verifyResponse.json();
            paymentLogger.info('Transaction verification result', {
              verified: verifyData.verified,
              status: verifyData.status
            });
          }
        } catch (err) {
          // Just log any verification errors, don't throw
          paymentLogger.warn('Transaction verification failed', err instanceof Error ? err : new Error(String(err)), {
            ...context,
            transactionHash: result.transactionHash
          });
        }
        
        // Return success response
        return {
          paymentId,
          status: PaymentStatus.CONFIRMED,
          transactionHash: result.transactionHash
        };
        
      } else if (result.error) {
        // Update payment status to failed
        paymentLogger.error('Payment processing failed', result.error instanceof Error ? result.error : new Error(String(result.error)), context);
        
        // Update payment status via API
        await fetch('/api/payment/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': this.requestId
          },
          body: JSON.stringify({
            transactionId: paymentInfo.transactionId,
            paymentId,
            status: PaymentStatus.FAILED
          })
        });
        
        // Return error response
        return {
          paymentId,
          status: PaymentStatus.FAILED,
          error: result.error
        };
      }
      
      // Shouldn't reach here, but just in case
      return {
        paymentId,
        status: PaymentStatus.FAILED,
        error: {
          category: ErrorCategory.UNKNOWN_ERROR,
          message: 'Unknown payment result',
          retryable: true
        }
      };
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      paymentLogger.error('Payment processing failed', err, context);
      
      // Try to update payment status to failed
      try {
        if (paymentInfo?.transactionId) {
          await fetch('/api/payment/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': this.requestId
            },
            body: JSON.stringify({
              transactionId: paymentInfo.transactionId,
              paymentId,
              status: PaymentStatus.FAILED
            })
          });
        }
      } catch (updateError) {
        // Just log any update errors
        paymentLogger.warn('Failed to update payment status after error', updateError, context);
      }
      
      return {
        paymentId,
        status: PaymentStatus.FAILED,
        error: {
          category: ErrorCategory.UNKNOWN_ERROR,
          message: err.message,
          retryable: true,
          originalError: err
        }
      };
    }
  }
  
  /**
   * Cancel a payment
   */
  public async cancelPayment(paymentId: string): Promise<PaymentStatusResponse> {
    const context = { paymentId, requestId: this.requestId };
    
    try {
      // Get payment info from memory
      const paymentInfo = this.activePayments.get(paymentId);
      if (!paymentInfo) {
        paymentLogger.warn('Cannot cancel payment - session not found', context);
        return {
          paymentId,
          status: PaymentStatus.FAILED,
          error: {
            category: ErrorCategory.NETWORK_ERROR,
            message: 'Payment session not found',
            retryable: false
          }
        };
      }
      
      // Update payment status to canceled via API
      const response = await fetch('/api/payment/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': this.requestId
        },
        body: JSON.stringify({
          transactionId: paymentInfo.transactionId,
          paymentId,
          status: PaymentStatus.CANCELED
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const error = {
          category: ErrorCategory.NETWORK_ERROR,
          message: errorData.error || 'Failed to cancel payment',
          retryable: true,
          details: errorData.details
        };
        
        paymentLogger.error('Failed to cancel payment', new Error(error.message), {
          ...context,
          statusCode: response.status,
          error
        });
        
        return {
          paymentId,
          status: PaymentStatus.FAILED,
          error
        };
      }
      
      // Clean up
      if (this.paymentTimeouts.has(paymentId)) {
        clearTimeout(this.paymentTimeouts.get(paymentId)!);
        this.paymentTimeouts.delete(paymentId);
      }
      this.activePayments.delete(paymentId);
      
      paymentLogger.info('Payment canceled successfully', context);
      
      return {
        paymentId,
        status: PaymentStatus.CANCELED
      };
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      paymentLogger.error('Failed to cancel payment', err, context);
      
      return {
        paymentId,
        status: PaymentStatus.FAILED,
        error: {
          category: ErrorCategory.UNKNOWN_ERROR,
          message: err.message,
          retryable: true,
          originalError: err
        }
      };
    }
  }
  
  /**
   * Get a user-friendly error message
   */
  public getFormattedErrorMessage(error: PaymentError): string {
    return formatErrorForUser(error);
  }
}

export default ClientPaymentService; 