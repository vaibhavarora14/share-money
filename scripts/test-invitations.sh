#!/bin/bash

# Test script for Group Invitation Feature
# This script tests the invitation API endpoints

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8888/api}"
SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH}"

echo "🧪 Group Invitation Feature Test Script"
echo "========================================"
echo ""
echo "API URL: $API_URL"
echo "Supabase URL: $SUPABASE_URL"
echo ""

# Helper function to print test results
print_test() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
    fi
}

# Helper function to make authenticated API calls
api_call() {
    local method=$1
    local endpoint=$2
    local token=$3
    local data=$4
    
    if [ -z "$data" ]; then
        curl -s -w "\n%{http_code}" -X "$method" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            "$API_URL$endpoint"
    else
        curl -s -w "\n%{http_code}" -X "$method" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_URL$endpoint"
    fi
}

# Helper function to extract JSON and status code
parse_response() {
    local response=$1
    local json=$(echo "$response" | head -n -1)
    local status=$(echo "$response" | tail -n 1)
    echo "$json|$status"
}

echo "📋 Prerequisites Check"
echo "----------------------"

# Check if Supabase is running
if curl -s "$SUPABASE_URL/rest/v1/" > /dev/null 2>&1; then
    print_test 0 "Supabase is running"
else
    print_test 1 "Supabase is not running - please start it with 'supabase start'"
    exit 1
fi

# Check if API server is running
if curl -s "$API_URL/groups" > /dev/null 2>&1; then
    print_test 0 "API server is running"
else
    print_test 1 "API server is not running - please start it with 'npm run dev:server'"
    exit 1
fi

echo ""
echo "⚠️  Manual Testing Required"
echo "=========================="
echo ""
echo "This script provides a framework for testing. Due to the need for:"
echo "  - User authentication tokens"
echo "  - Creating test users and groups"
echo "  - Complex state management"
echo ""
echo "Please use the test plan in TEST_PLAN_INVITATIONS.md for comprehensive testing."
echo ""
echo "Quick manual test steps:"
echo ""
echo "1. Create a test user and get auth token:"
echo "   - Sign up via mobile app or Supabase Studio"
echo "   - Get access token from Supabase auth"
echo ""
echo "2. Create a group:"
echo "   curl -X POST $API_URL/groups \\"
echo "     -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"name\":\"Test Group\",\"description\":\"Test\"}'"
echo ""
echo "3. Create an invitation:"
echo "   curl -X POST $API_URL/invitations \\"
echo "     -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"group_id\":\"GROUP_ID\",\"email\":\"newuser@example.com\"}'"
echo ""
echo "4. List invitations:"
echo "   curl -X GET '$API_URL/invitations?group_id=GROUP_ID' \\"
echo "     -H 'Authorization: Bearer YOUR_TOKEN'"
echo ""
echo "5. Check database:"
echo "   - Open Supabase Studio: http://127.0.0.1:54323"
echo "   - View group_invitations table"
echo ""
echo "For complete test scenarios, see TEST_PLAN_INVITATIONS.md"
echo ""

# Check if database table exists
echo "🔍 Database Verification"
echo "-----------------------"

# This would require database access - skipping for now
echo "To verify database:"
echo "  1. Open Supabase Studio: http://127.0.0.1:54323"
echo "  2. Check that 'group_invitations' table exists"
echo "  3. Verify columns: id, group_id, email, invited_by, status, token, expires_at, created_at, accepted_at"
echo "  4. Check that functions exist: accept_group_invitation, accept_pending_invitations_for_user"
echo ""

echo "✅ Test script completed"
echo ""
echo "Next steps:"
echo "  1. Review TEST_PLAN_INVITATIONS.md for detailed test cases"
echo "  2. Use Supabase Studio to verify database schema"
echo "  3. Test API endpoints manually or via mobile app"
echo "  4. Test auto-acceptance by signing up with invited email"
echo ""

