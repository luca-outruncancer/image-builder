// src/components/canvas/hooks/useCanvasState.tsx
// Update only the section that checks payment results (around line 699-705)

    const paymentResult = await handlePaymentProcess(imageId, currentDbTransactionIdRef.current);
    console.log("Payment result:", paymentResult);
    
    if (!paymentResult.success) {
      // Check if the transaction was rejected by the user
      if (paymentResult.userRejected) {
        console.log("User rejected the transaction - returning to confirmation screen");
        
        // Just silently return to confirmation screen without error message
        setIsPaymentProcessing(false);
        
        // Mark transaction as cancelled but don't show error
        try {
          await updateTransactionStatus(
            currentDbTransactionIdRef.current!, 
            TRANSACTION_STATUS.FAILED,
            undefined,
            false
          );
        } catch (updateError) {
          console.error("Failed to update transaction status after user rejection:", updateError);
        }
        
        return;
      }
      
      // Continue with other error handling...