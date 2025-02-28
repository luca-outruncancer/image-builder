// src/components/canvas/hooks/useCanvasState.tsx - handleConfirmPlacement function around line 700-750

    const paymentResult = await handlePaymentProcess(imageId, currentDbTransactionIdRef.current);
    console.log("Payment result:", paymentResult);
    
    if (!paymentResult.success) {
      // Check if the transaction was rejected by the user
      if (paymentResult.userRejected) {
        console.log("User rejected the transaction - returning to confirmation screen");
        
        // Just return to confirmation screen without error message or retry
        setIsPaymentProcessing(false);
        setPaymentError(null);
        
        // Mark transaction as cancelled in DB
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
      
      // Check for specific "already processed" error
      if (paymentResult.error && paymentResult.error.includes("already been processed")) {
        console.error("Detected transaction already processed error - state needs to be reset");
        setPaymentError(`${paymentResult.error}. Please try again.`);
        
        // Marking the image as failed temporarily so we can reset state
        try {
          await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_FAILED);
          // Remove the pending image from the canvas
          setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
        } catch (updateError) {
          console.error("Failed to update image status after payment error:", updateError);
        }
        
        // Reset state completely
        resetState();
        return;
      }
