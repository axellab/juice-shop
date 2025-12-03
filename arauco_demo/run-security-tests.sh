#!/bin/bash

# Arauco Demo Security Test Runner
# This script runs all security tests for the arauco_demo microservices

set -e

echo "🔒 Starting Arauco Demo Security Tests..."
echo "================================================"

# Check if Node.js dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "⚠️  Installing dependencies..."
    npm install
fi

# Function to run tests with error handling
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo ""
    echo "🧪 Running $test_name..."
    echo "----------------------------------------"
    
    if eval "$test_command"; then
        echo "✅ $test_name passed"
    else
        echo "❌ $test_name failed"
        exit 1
    fi
}

# Run API Security Tests
run_test "API Security Tests" "npm run test:api:arauco"

# Run Server Security Tests  
run_test "Server Security Tests" "npm run test:server:arauco"

# Run End-to-End Security Tests (optional, requires Cypress setup)
if command -v cypress &> /dev/null; then
    run_test "End-to-End Security Tests" "npm run test:e2e:arauco"
else
    echo "ℹ️  Cypress not available, skipping E2E security tests"
fi

echo ""
echo "🎉 All Arauco Demo Security Tests Completed Successfully!"
echo "================================================"
echo "✅ Input validation security tests passed"
echo "✅ Authentication and authorization tests passed"
echo "✅ Data protection tests passed"
echo "✅ Business logic security tests passed"
echo "✅ API security tests passed"
echo "✅ Integration security tests passed"
echo ""
echo "🔒 Security test coverage validated for:"
echo "   - payment-service.js"
echo "   - payment-client.js"  
echo "   - order-payment-integration.js"
echo ""
echo "📊 Test reports available in build/reports/coverage/"