// src/lib/payment/solana/connectionManager.ts
import { Connection, Commitment, TransactionSignature } from '@solana/web3.js';
import { PaymentError, ErrorCategory } from '../types/index';
import { createPaymentError } from '../utils/errorUtils';
import { RPC_ENDPOINT, CONNECTION_TIMEOUT, CONFIRMATION_TIMEOUT, FALLBACK_ENDPOINTS } from './walletConfig';
import { blockchainLogger } from '@/utils/logger';

/**
 * Manager for Solana RPC connections with fallback support
 */
export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  
  /**
   * Get or create a connection for a specific endpoint and commitment
   */
  getConnection(endpoint: string = RPC_ENDPOINT, commitment: Commitment = 'confirmed'): Connection {
    const key = `${endpoint}-${commitment}`;
    
    if (!this.connections.has(key)) {
      const connection = new Connection(endpoint, {
        commitment,
        confirmTransactionInitialTimeout: CONFIRMATION_TIMEOUT
      });
      
      this.connections.set(key, connection);
      blockchainLogger.info('Created new connection', { endpoint, commitment });
    }
    
    return this.connections.get(key)!;
  }
  
  /**
   * Try to confirm a transaction with multiple endpoints if needed
   */
  async confirmTransaction(
    signature: TransactionSignature,
    commitment: Commitment = 'confirmed'
  ): Promise<boolean> {
    // Start with the main endpoint
    try {
      const connection = this.getConnection(RPC_ENDPOINT, commitment);
      const result = await connection.confirmTransaction(signature, commitment);
      
      if (result.value.err) {
        blockchainLogger.warn('Transaction confirmed with error', new Error(String(result.value.err)));
        return false;
      }
      
      return true;
    } catch (error) {
      blockchainLogger.warn('Failed to confirm transaction with primary endpoint', error instanceof Error ? error : new Error(String(error)));
      
      // Try with fallback endpoints
      for (const fallbackEndpoint of FALLBACK_ENDPOINTS) {
        try {
          const connection = this.getConnection(fallbackEndpoint, commitment);
          const result = await connection.confirmTransaction(signature, commitment);
          
          if (result.value.err) {
            blockchainLogger.warn('Transaction confirmed with error on fallback', new Error(String(result.value.err)));
            return false;
          }
          
          blockchainLogger.info('Successfully confirmed transaction with fallback endpoint', {
            endpoint: fallbackEndpoint,
            signature
          });
          
          return true;
        } catch (fallbackError) {
          blockchainLogger.warn('Failed to confirm transaction with fallback endpoint', 
            fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)), 
            { endpoint: fallbackEndpoint }
          );
        }
      }
      
      // All endpoints failed
      blockchainLogger.error('Failed to confirm transaction with all endpoints', 
        error instanceof Error ? error : new Error(String(error)), 
        { signature }
      );
      
      throw createPaymentError(
        ErrorCategory.BLOCKCHAIN_ERROR,
        'Failed to confirm transaction with all endpoints',
        error instanceof Error ? error : new Error(String(error)),
        true
      );
    }
  }
}

// Export a singleton instance
export const connectionManager = new ConnectionManager();