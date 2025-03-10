// src/lib/payment/solana/connectionManager.ts
import { Connection, Commitment } from '@solana/web3.js';
import { ErrorCategory } from '../types';
import { createPaymentError } from '../utils/errorUtils';
import { RPC_ENDPOINT, CONNECTION_TIMEOUT, FALLBACK_ENDPOINTS } from '@/lib/solana/walletConfig';

/**
 * ConnectionManager handles all Solana RPC connection functionality
 */
export class ConnectionManager {
  private primaryConnection: Connection;
  private fallbackConnections: Connection[] = [];
  private currentConnection: Connection;
  
  constructor() {
    this.primaryConnection = this.createConnection(RPC_ENDPOINT);
    this.currentConnection = this.primaryConnection;
    
    // Initialize fallback connections
    if (FALLBACK_ENDPOINTS && FALLBACK_ENDPOINTS.length > 0) {
      this.fallbackConnections = FALLBACK_ENDPOINTS.map(endpoint => 
        this.createConnection(endpoint)
      );
    }
  }
  
  /**
   * Create a Solana connection with custom configuration
   */
  private createConnection(endpoint: string): Connection {
    const commitment: Commitment = 'confirmed';
    
    try {
      if (!endpoint) {
        throw new Error('No RPC endpoint provided');
      }
      
      return new Connection(endpoint, {
        commitment,
        confirmTransactionInitialTimeout: CONNECTION_TIMEOUT
      });
    } catch (error) {
      console.error("Failed to create Solana connection:", error);
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
   * Verify if a transaction has been confirmed
   */
  public async verifyTransaction(signature: string): Promise<boolean> {
    try {
      console.log(`Verifying transaction signature: ${signature}`);
      const status = await this.currentConnection.getSignatureStatus(signature);
      
      // If we have a confirmation, the transaction succeeded
      if (status && status.value && !status.value.err) {
        console.log(`Transaction verified: ${signature} was SUCCESSFUL`);
        return true;
      }
      
      console.log(`Transaction verified: ${signature} was NOT successful`, status);
      return false;
    } catch (error) {
      console.error("Error verifying transaction:", error);
      
      // Try fallback connections if available
      if (this.fallbackConnections.length > 0) {
        try {
          // Switch to a fallback connection
          const fallback = this.fallbackConnections[0];
          this.currentConnection = fallback;
          
          // Retry with the fallback
          const status = await fallback.getSignatureStatus(signature);
          if (status && status.value && !status.value.err) {
            console.log(`Transaction verified on fallback: ${signature} was SUCCESSFUL`);
            return true;
          }
        } catch (fallbackError) {
          console.error("Error verifying transaction on fallback:", fallbackError);
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