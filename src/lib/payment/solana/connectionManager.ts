// src/lib/payment/solana/connectionManager.ts
import { Connection, Commitment, TransactionSignature } from '@solana/web3.js';
import { ErrorCategory } from '../types';
import { createPaymentError } from '../utils/errorUtils';
import { RPC_ENDPOINT, CONNECTION_TIMEOUT, FALLBACK_ENDPOINTS } from '@/lib/solana/walletConfig';
import { blockchainLogger } from '@/utils/logger';

/**
 * ConnectionManager handles all Solana RPC connection functionality
 */
export class ConnectionManager {
  private primaryConnection: Connection;
  private fallbackConnections: Connection[] = [];
  private currentConnection: Connection;
  
  constructor() {
    this.primaryConnection = this.createConnection();
    this.currentConnection = this.primaryConnection;
    
    // Initialize fallback connections
    if (FALLBACK_ENDPOINTS && FALLBACK_ENDPOINTS.length > 0) {
      this.fallbackConnections = FALLBACK_ENDPOINTS.map(endpoint => 
        this.createConnection()
      );
    }
  }
  
  /**
   * Create a Solana connection with custom configuration
   */
  private createConnection(): Connection {
    const commitment: Commitment = 'confirmed';
    
    try {
      if (!RPC_ENDPOINT) {
        throw new Error('No RPC endpoint configured');
      }
      
      const connection = new Connection(RPC_ENDPOINT, {
        commitment,
        confirmTransactionInitialTimeout: CONNECTION_TIMEOUT
      });
      
      return connection;
    } catch (error) {
      blockchainLogger.error('Failed to create Solana connection:', error);
      throw createPaymentError(
        ErrorCategory.NETWORK_ERROR,
        'Connection initialization failed',
        error,
        true
      );
    }
  }
  
  /**
   * Get the current connection
   */
  public getConnection(): Connection {
    return this.currentConnection;
  }
  
  /**
   * Verify if a transaction has already been processed successfully
   */
  public async verifyTransaction(
    signature: TransactionSignature
  ): Promise<boolean> {
    try {
      blockchainLogger.info(`Verifying transaction signature: ${signature}`);
      const status = await this.currentConnection.getSignatureStatus(signature);
      
      // If we have a confirmation, the transaction succeeded
      if (status && status.value && !status.value.err) {
        blockchainLogger.info(`Transaction verified: ${signature} was SUCCESSFUL`);
        return true;
      }
      
      blockchainLogger.info(`Transaction verified: ${signature} was NOT successful`, {
        status: status?.value || null
      });
      return false;
    } catch (error) {
      blockchainLogger.error('Error verifying transaction:', error, {
        signature
      });
      
      // Try fallback connections if available
      if (this.fallbackConnections.length > 0) {
        try {
          // Switch to a fallback connection
          const fallback = this.fallbackConnections[0];
          this.currentConnection = fallback;
          
          // Retry with the fallback
          const status = await fallback.getSignatureStatus(signature);
          if (status && status.value && !status.value.err) {
            blockchainLogger.info(`Transaction verified on fallback: ${signature} was SUCCESSFUL`);
            return true;
          }
        } catch (fallbackError) {
          blockchainLogger.error('Error verifying transaction on fallback:', fallbackError);
        } finally {
          // Switch back to primary
          this.currentConnection = this.primaryConnection;
        }
      }
      
      return false;
    }
  }
}

// Export a singleton instance
export const connectionManager = new ConnectionManager();