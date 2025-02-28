// In the handlePaymentProcess function, around line 425-430, modify the catch block at the end:

      return result;
    } catch (error) {
      console.error('Payment processing error:', error);
      
      // Clear any existing timeout
      if (paymentTimeoutId) {
        clearTimeout(paymentTimeoutId);
        setPaymentTimeoutId(null);
      }
      
      // Update transaction status to FAILED
      if (currentDbTransactionIdRef.current) {
        try {
          await updateTransactionStatus(
            currentDbTransactionIdRef.current, 
            TRANSACTION_STATUS.FAILED
          );
        } catch (updateError) {
          console.error("Failed to update transaction status after error:", updateError);
        }
      }
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown payment error',
        isUserRejection: error.message && error.message.includes("rejected")
      };
    } finally {
      setIsPaymentProcessing(false);
    }
