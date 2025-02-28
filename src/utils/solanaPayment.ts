// Around line 410 in the sendSOLPayment function, update the try-catch block that handles signing:

    // Sign the transaction
    console.log(`Requesting wallet signature (${transactionId})...`);
    let signedTransaction;
    try {
      signedTransaction = await signTransaction(transaction);
      console.log(`Transaction signed successfully (${transactionId})`);
    } catch (signError) {
      console.error(`Signing failed (${transactionId}):`, signError);
      
      // Check if this is a user rejection and handle it specially
      const errorMessage = signError.message || String(signError);
      if (errorMessage.includes("rejected") || 
          errorMessage.includes("declined") || 
          errorMessage.includes("User denied")) {
        console.log("User rejected the transaction");
        return {
          success: false,
          error: "Transaction was declined",
          userRejected: true
        };
      }
      
      return {
        success: false,
        error: `Transaction signing failed: ${errorMessage}`
      };
    }