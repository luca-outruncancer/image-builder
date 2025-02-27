// src/lib/transactionStorage.ts
'use client';

import { createClient } from '@supabase/supabase-js';

// Use environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: any = null;

try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase client initialized in transactionStorage");
  } else {
    console.error("Unable to initialize Supabase client due to missing environment variables in transactionStorage");
  }
} catch (error) {
  console.error("Error initializing Supabase client in transactionStorage:", error);
}

export interface TransactionRecord {
  image_id: number;
  solana_wallet: string;
  transaction_hash: string;
  amount: number;
  currency: string;
}

export async function saveTransaction(record: TransactionRecord) {
  try {
    console.log("Saving transaction to database:", record);
    
    if (!supabase) {
      console.warn("Skipping database operation: Supabase client not available");
      return { 
        success: false, 
        error: "Supabase client not available. Check your environment variables." 
      };
    }
    
    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        image_id: record.image_id,
        solana_wallet: record.solana_wallet,
        transaction_hash: record.transaction_hash,
        amount: record.amount,
        currency: record.currency,
        timestamp: new Date().toISOString()
      }])
      .select();
    
    if (error) {
      console.error("Supabase error saving transaction:", error);
      throw error;
    }
    
    console.log("Transaction saved successfully:", data);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to save transaction:', error);
    return { success: false, error };
  }
}

export async function updateImagePaymentStatus(imageId: number, transactionHash: string) {
  try {
    console.log("Updating image payment status:", imageId, transactionHash);
    
    if (!supabase) {
      console.warn("Skipping database operation: Supabase client not available");
      return { 
        success: false, 
        error: "Supabase client not available. Check your environment variables." 
      };
    }
    
    const { error } = await supabase
      .from('images')
      .update({ 
        payment_status: 'paid',
        transaction_hash: transactionHash,
        payment_timestamp: new Date().toISOString()
      })
      .eq('image_id', imageId);
    
    if (error) {
      console.error("Supabase error updating image:", error);
      throw error;
    }
    
    console.log("Image payment status updated successfully");
    return { success: true };
  } catch (error) {
    console.error('Failed to update image payment status:', error);
    return { success: false, error };
  }
}

export async function getTransactionsByImage(imageId: number) {
  try {
    if (!supabase) {
      console.warn("Skipping database operation: Supabase client not available");
      return { 
        success: false, 
        error: "Supabase client not available. Check your environment variables." 
      };
    }
    
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('image_id', imageId);
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Failed to get transactions for image:', error);
    return { success: false, error };
  }
}
