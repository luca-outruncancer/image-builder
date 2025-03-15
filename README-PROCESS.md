# Image Upload and Payment Process Flow

## Initial Image Upload Phase

1. **Image File Selection**
   ```mermaid
   flowchart TD
       A[User clicks 'Upload Image'] --> B{File Selected?}
       B -->|Yes| C[Validate Image]
       B -->|No| D[Show Error]
       C -->|Valid| E[Continue]
       C -->|Invalid| D
   ```
   - **SUCCESS**:
     - Log: `imageLogger.debug('File selected')`
     - Set file in state
     - Create preview URL
   - **FAILURE**:
     - Log: `imageLogger.warn('File validation failed')`
     - Clear selected file
     - Show error message

2. **Image Validation**
   ```mermaid
   flowchart TD
       A[Validate Image] --> B{Check Size}
       B -->|>1MB| C[Size Error]
       B -->|≤1MB| D{Check Format}
       D -->|Invalid| E[Format Error]
       D -->|Valid| F{Get Dimensions}
       F -->|Success| G[Set Image Info]
       F -->|Failure| H[Processing Error]
   ```
   - **SUCCESS**:
     - Log: `imageLogger.debug('Image dimensions obtained')`
     - Store image metadata
     - Enable "Next" button
   - **FAILURE**:
     - Log: `imageLogger.error('Image validation failed')`
     - Show specific error (size/format)
     - Clear selection

3. **Preview Generation**
   ```mermaid
   flowchart TD
       A[Create Preview] --> B{Size Selection}
       B -->|Preset| C[Use Preset Size]
       B -->|Custom| D[Use Custom Size]
       C --> E[Calculate Cost]
       D --> E
       E --> F[Show Preview]
   ```
   - **SUCCESS**:
     - Log: `imageLogger.info('Preview generated')`
     - Display preview with dimensions
     - Show calculated cost
   - **FAILURE**:
     - Log: `imageLogger.error('Preview generation failed')`
     - Return to selection step
     - Show error message

4. **Cost Calculation**
   ```mermaid
   flowchart TD
       A[Get Dimensions] --> B[Calculate Base Cost]
       B --> C{Size Type}
       C -->|Preset| D[Use Standard Rate]
       C -->|Custom| E[Apply Custom Rate]
       D --> F[Display Final Cost]
       E --> F
   ```
   - **SUCCESS**:
     - Log: `imageLogger.info('Cost calculated')`
     - Update UI with cost
     - Enable confirmation
   - **FAILURE**:
     - Log: `imageLogger.error('Cost calculation failed')`
     - Show error message
     - Disable confirmation

5. **Initial Database Validation**
   ```mermaid
   flowchart TD
       A[Validate DB Connection] --> B{Check Cache}
       B -->|Valid Cache| C[Use Cached Validation]
       B -->|No Cache| D[Query Database]
       D -->|Success| E[Cache Result]
       D -->|Failure| F[Show Error]
       E --> G[Continue]
       C --> G
   ```
   - **SUCCESS**:
     - Log: `storageLogger.debug('Database connection validated successfully')`
     - Cache validation result
     - Proceed with upload
   - **FAILURE**:
     - Log: `storageLogger.error('Database connection validation failed')`
     - Show connection error
     - Allow retry

## Payment Processing Phase

6. **Payment Session Initialization**
   ```mermaid
   flowchart TD
       A[Initialize Payment] --> B[Create Session]
       B --> C{Check Balance}
       C -->|Sufficient| D[Create Request]
       C -->|Insufficient| E[Show Error]
       D --> F[Store Session]
   ```
   - **Libraries/Functions**:
     - `src/lib/payment/paymentService.ts::initializePayment`
     - `src/lib/payment/solana/solPaymentProcessor.ts::checkSolBalance`
     - `src/lib/payment/storage/paymentStorageProvider.ts::createPaymentSession`
   - **SUCCESS**:
     - Log: `paymentLogger.info('Payment session initialized')`
     - Store session ID
     - Enable payment button
   - **FAILURE**:
     - Log: `paymentLogger.error('Payment initialization failed')`
     - Show balance error
     - Disable payment button

7. **Transaction Preparation**
   ```mermaid
   flowchart TD
       A[Prepare Transaction] --> B[Get Fresh Blockhash]
       B --> C[Create Instructions]
       C --> D[Build Transaction]
       D --> E[Sign Transaction]
   ```
   - **Libraries/Functions**:
     - `src/lib/payment/solana/solPaymentProcessor.ts::createTransaction`
     - `src/lib/payment/solana/solPaymentProcessor.ts::signTransaction`
     - `@solana/web3.js::getLatestBlockhash`
   - **SUCCESS**:
     - Log: `paymentLogger.debug('Transaction prepared')`
     - Cache signed transaction
     - Update session status
   - **FAILURE**:
     - Log: `paymentLogger.error('Transaction preparation failed')`
     - Reset session
     - Show error message

8. **Transaction Processing**
   ```mermaid
   flowchart TD
       A[Process Payment] --> B[Send Transaction]
       B --> C{Confirm Status}
       C -->|Confirmed| D[Update DB]
       C -->|Failed| E[Retry/Error]
       D --> F[Complete]
   ```
   - **Libraries/Functions**:
     - `src/lib/payment/solana/solPaymentProcessor.ts::processPayment`
     - `src/lib/payment/storage/transactionRepository.ts::updateTransactionStatus`
     - `@solana/web3.js::sendAndConfirmTransaction`
   - **SUCCESS**:
     - Log: `paymentLogger.info('Transaction confirmed')`
     - Update transaction status
     - Trigger image processing
   - **FAILURE**:
     - Log: `paymentLogger.error('Transaction failed')`
     - Update failure status
     - Show retry option

9. **Image Processing**
   ```mermaid
   flowchart TD
       A[Start Processing] --> B[Resize Image]
       B --> C[Upload to Storage]
       C --> D[Create DB Record]
       D --> E[Update Status]
   ```
   - **Libraries/Functions**:
     - `src/lib/imageResizer.ts::resizeImage`
     - `src/app/api/upload/route.ts::POST`
     - `src/lib/payment/storage/imageRepository.ts::createImageRecord`
   - **SUCCESS**:
     - Log: `imageLogger.info('Image processed and stored')`
     - Update image status
     - Show success message
   - **FAILURE**:
     - Log: `imageLogger.error('Image processing failed')`
     - Mark transaction for refund
     - Show error message

10. **Final Confirmation**
    ```mermaid
    flowchart TD
        A[Check Status] --> B{All Complete?}
        B -->|Yes| C[Show Success]
        B -->|No| D[Show Error]
        C --> E[Clear State]
        D --> F[Support Info]
    ```
    - **Libraries/Functions**:
      - `src/lib/payment/hooks/usePayment.ts::usePaymentStatus`
      - `src/lib/payment/storage/paymentStorageProvider.ts::getPaymentStatus`
    - **SUCCESS**:
      - Log: `paymentLogger.info('Process complete')`
      - Clear payment session
      - Show success screen
    - **FAILURE**:
      - Log: `paymentLogger.error('Process incomplete')`
      - Preserve session data
      - Show support contact

## Error Handling and Recovery
- All steps include automatic retry logic for transient failures
- Failed transactions are logged for manual review
- Users can retry failed payments without creating new sessions
- Incomplete processes can be resumed from last successful step
- All errors are logged with correlation IDs for tracking

## State Management
- Payment session state is maintained in database
- Transaction status is updated in real-time
- Image processing status is tracked separately
- All state changes are logged with timestamps
- Recovery points are maintained for each step

Would you like me to provide more details about any specific step or component? 