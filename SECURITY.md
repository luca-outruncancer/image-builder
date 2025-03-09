# Security Guide for Image Builder Application

This document outlines the security features implemented in the Image Builder application and provides guidance for secure deployment and operation.

## Security Features

### 1. Server-Side Payment Verification

All payment transactions are now verified server-side, with the following security measures:

- Transaction signatures are verified against the Solana blockchain
- Recipient wallet address is validated to ensure payments go to the correct destination
- Payment status is updated in the database only after blockchain confirmation
- Client-side payment processing is backed by server verification

### 2. Database Locking for Concurrent Operations

To prevent race conditions and ensure data integrity:

- Database-level locks for image placement areas
- Serializable transaction isolation level for critical operations
- Automatic cleanup of expired locks
- Server-side validation of placement availability

### 3. Rate Limiting and Access Control

Multiple layers of rate limiting:

- Global API rate limiting via middleware
- Per-endpoint specific rate limits
- IP-based rate limiting with escalating restrictions
- Token bucket algorithm for API key authentication
- Blacklisting mechanism for repeated abuse

### 4. Enhanced Input Validation

Comprehensive validation for all user inputs:

- File type and size validation
- Secure file handling with proper error recovery
- Canvas coordinates and placement validation
- JSON input validation and sanitization
- Proper error responses for invalid inputs

### 5. Server-Side Logic

Critical business logic moved to server-side:

- Transaction verification performed server-side
- Area availability check and locking via database functions
- File processing and storage handled server-side
- Payment processing verified independently of client

## Deployment Recommendations

### Environment Variables

Set the following environment variables for secure operation:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_KEY=your_api_key  # For client-side API calls
SERVER_API_KEY=your_server_api_key  # For server-only operations
```

### Database Setup

1. Run the database schema script in `src/database/schema.sql`
2. Run the lock procedures script in `src/database/lock_procedures.sql`
3. Run the cron jobs script in `src/database/cron_jobs.sql`

### CORS Configuration

Configure CORS to restrict API access to trusted domains:

```javascript
// Set in your web server configuration
"Access-Control-Allow-Origin": "https://yourdomain.com"
"Access-Control-Allow-Methods": "GET, POST, OPTIONS"
"Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key"
```

### File Storage Security

The application handles file uploads with security measures:

1. Files are stored in the `/public/uploads` directory
2. Filenames are cryptographically random (using crypto.randomBytes)
3. File extensions are validated
4. Files are processed and optimized server-side

For production, consider:
- Using a CDN or specialized file storage service
- Implementing virus/malware scanning for uploads
- Setting appropriate file permissions

## Monitoring and Security Logs

The application includes extensive logging:

- All API requests are logged with rate limit information
- Transaction verification logs
- File upload processing logs
- Error tracking with detailed context

For production, implement:

- Centralized log collection
- Alerts for suspicious activity
- Regular security audits
- Monitoring of rate limit violations

## Known Limitations and Future Improvements

While the current implementation addresses critical security vulnerabilities, there are areas for improvement:

1. **Authentication**: The application uses basic API key authentication. For production, implement:
   - OAuth 2.0 or JWT-based authentication
   - Role-based access control
   - Secure token storage and refresh mechanism

2. **Payment Processing**: 
   - Consider implementing webhook callbacks for payment confirmation
   - Add support for transaction receipts and notifications
   - Implement idempotent payment processing to prevent duplicates

3. **File Storage**:
   - Switch to signed URLs for file access control
   - Implement content moderation for uploaded images
   - Consider moving files to off-server storage (AWS S3, etc.)

4. **Rate Limiting**:
   - Implement a distributed rate limiting solution for multi-server deployments
   - Add more granular per-user quotas
   - Enhanced analytics for rate limit events

## Security Incident Response

In case of a security incident:

1. **Isolate**: Identify affected components and isolate as needed
2. **Investigate**: Review logs and determine extent of the incident
3. **Mitigate**: Apply necessary security fixes and patches
4. **Communicate**: Notify affected users as appropriate
5. **Review**: Conduct post-incident analysis and improve security measures

## Reporting Security Issues

If you discover a security vulnerability, please report it to:

**Email**: security@outruncancer.com

Please provide:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested mitigation (if any)

We take all security reports seriously and will respond promptly.
