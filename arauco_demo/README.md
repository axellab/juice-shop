# Arauco Demo Security Tests

This directory contains comprehensive security tests for the Arauco Demo microservices.

## Quick Start

### Prerequisites
```bash
# Install dependencies
npm install
```

### Run All Security Tests
```bash
# Run the comprehensive security test suite
./arauco_demo/run-security-tests.sh
```

### Run Individual Test Suites

#### API Security Tests
```bash
npm run test:api:arauco
```

#### Server Security Tests
```bash
npm run test:server:arauco
```

#### End-to-End Security Tests
```bash
npm run test:e2e:arauco
```

### Run All Tests Together
```bash
npm run test:security:arauco
```

## Test Coverage

The security test suite covers:

### 🔒 Input Validation Security
- SQL Injection prevention
- XSS attack prevention  
- Input size validation
- Data type validation

### 🔐 Authentication & Authorization
- Unauthorized access prevention
- Token validation
- Privilege escalation prevention
- Session security

### 🛡️ Data Protection
- Sensitive data exposure prevention
- Data masking validation
- Secure logging practices
- Tokenization security

### 💼 Business Logic Security
- Payment amount validation
- Transaction limits enforcement
- Order integrity validation
- Refund validation

### 🌐 API Security
- Error handling security
- Rate limiting protection
- CORS configuration
- Content type validation

### 🔗 Integration Security
- Service communication security
- Error propagation handling
- Security context preservation
- Failover security

## Files Structure

```
test/
├── api/
│   └── araucoDemoSecuritySpec.ts          # API security tests
├── server/
│   ├── araucoPaymentClientSpec.ts         # Payment client tests
│   └── araucoIntegrationSecuritySpec.ts   # Integration tests
└── cypress/e2e/
    └── araucoDemoSecurity.cy.ts           # E2E security tests

arauco_demo/
├── SECURITY_TESTING.md                    # Detailed documentation
└── run-security-tests.sh                  # Test runner script
```

## Integration with CI/CD

Add to your CI/CD pipeline:

```yaml
# Example GitHub Actions step
- name: Run Arauco Demo Security Tests
  run: |
    npm install
    npm run test:security:arauco
```

```yaml
# Example GitLab CI step
test:security:arauco:
  script:
    - npm install
    - npm run test:security:arauco
```

## Security Test Categories

### Critical Security Tests ⚠️
- Input validation (SQL injection, XSS)
- Authentication and authorization
- Sensitive data protection
- Business logic validation

### Important Security Tests 🔍
- Rate limiting and DoS protection
- Error handling security
- API endpoint protection
- Session management

### Monitoring Tests 📊
- Security header validation
- Logging security compliance
- Performance impact assessment
- Integration health checks

## Troubleshooting

### Dependencies Missing
```bash
npm install
cd frontend && npm install --legacy-peer-deps
```

### TypeScript Compilation Issues
```bash
npm run build:server
```

### Test Framework Issues
```bash
# For Jest/API tests
npm run test:api

# For Mocha/Server tests  
npm run test:server
```

## Security Standards Compliance

These tests help ensure compliance with:
- OWASP Top 10 Web Application Security Risks
- PCI DSS for payment processing
- GDPR for data protection
- Industry security best practices

## Contributing

When adding new security tests:
1. Follow existing test patterns
2. Include both positive and negative test cases
3. Document security requirements being tested
4. Update this README if adding new test categories

## Support

For questions about the security tests:
1. Check the detailed documentation in `SECURITY_TESTING.md`
2. Review existing test patterns in the test files
3. Ensure all dependencies are properly installed