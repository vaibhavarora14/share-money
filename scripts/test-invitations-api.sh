#!/bin/bash

# Interactive test script for Group Invitation API
# This script helps test the invitation endpoints step by step

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="${API_URL:-http://localhost:8888/api}"
SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH}"

echo -e "${BLUE}🧪 Group Invitation API Test${NC}"
echo "================================"
echo ""
echo "API URL: $API_URL"
echo "Supabase URL: $SUPABASE_URL"
echo ""

# Check if server is running
if ! curl -s "$API_URL/groups" > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  API server is not running${NC}"
    echo "Please start it with: npm run dev:server"
    exit 1
fi

echo -e "${GREEN}✓${NC} API server is running"
echo ""

echo "📋 Test Steps:"
echo "=============="
echo ""
echo "1. First, you need to get an authentication token:"
echo "   - Sign up/login via the mobile app, OR"
echo "   - Use Supabase Studio: http://127.0.0.1:54323"
echo "   - Go to Authentication > Users"
echo "   - Create a test user or use existing one"
echo "   - Get the access token from browser dev tools or Supabase Studio"
echo ""
echo "2. Once you have a token, you can test the endpoints:"
echo ""

read -p "Do you have an auth token? (y/n): " has_token

if [ "$has_token" != "y" ]; then
    echo ""
    echo "To get a token:"
    echo "1. Open Supabase Studio: http://127.0.0.1:54323"
    echo "2. Go to Authentication > Users"
    echo "3. Create a user or use existing"
    echo "4. Copy the access token from the user details"
    echo ""
    echo "Or use the mobile app to sign in and check the console logs"
    echo ""
    exit 0
fi

read -p "Enter your auth token: " AUTH_TOKEN

if [ -z "$AUTH_TOKEN" ]; then
    echo "Token is required"
    exit 1
fi

echo ""
echo -e "${GREEN}Testing with token: ${AUTH_TOKEN:0:20}...${NC}"
echo ""

# Test 1: Create a group
echo "📝 Test 1: Create a test group"
echo "-------------------------------"
read -p "Enter group name (default: Test Group): " GROUP_NAME
GROUP_NAME=${GROUP_NAME:-Test Group}

GROUP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/groups" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$GROUP_NAME\",\"description\":\"Test group for invitations\"}")

GROUP_JSON=$(echo "$GROUP_RESPONSE" | head -n -1)
GROUP_STATUS=$(echo "$GROUP_RESPONSE" | tail -n 1)

if [ "$GROUP_STATUS" = "201" ]; then
    GROUP_ID=$(echo "$GROUP_JSON" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
    echo -e "${GREEN}✓${NC} Group created: $GROUP_ID"
    echo "Response: $GROUP_JSON"
else
    echo -e "${YELLOW}✗${NC} Failed to create group (Status: $GROUP_STATUS)"
    echo "Response: $GROUP_JSON"
    exit 1
fi

echo ""

# Test 2: Create invitation for non-existent user
echo "📝 Test 2: Create invitation for non-existent user"
echo "---------------------------------------------------"
read -p "Enter email for invitation (default: newuser@test.com): " INVITE_EMAIL
INVITE_EMAIL=${INVITE_EMAIL:-newuser@test.com}

INVITE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/invitations" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"group_id\":\"$GROUP_ID\",\"email\":\"$INVITE_EMAIL\"}")

INVITE_JSON=$(echo "$INVITE_RESPONSE" | head -n -1)
INVITE_STATUS=$(echo "$INVITE_RESPONSE" | tail -n 1)

if [ "$INVITE_STATUS" = "201" ]; then
    INVITATION_ID=$(echo "$INVITE_JSON" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
    echo -e "${GREEN}✓${NC} Invitation created: $INVITATION_ID"
    echo "Response: $INVITE_JSON"
else
    echo -e "${YELLOW}✗${NC} Failed to create invitation (Status: $INVITE_STATUS)"
    echo "Response: $INVITE_JSON"
    # Try via group-members endpoint
    echo ""
    echo "Trying via group-members endpoint..."
    MEMBER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/group-members" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"group_id\":\"$GROUP_ID\",\"email\":\"$INVITE_EMAIL\"}")
    
    MEMBER_JSON=$(echo "$MEMBER_RESPONSE" | head -n -1)
    MEMBER_STATUS=$(echo "$MEMBER_RESPONSE" | tail -n 1)
    
    if [ "$MEMBER_STATUS" = "201" ] || [ "$MEMBER_STATUS" = "200" ]; then
        echo -e "${GREEN}✓${NC} Invitation created via group-members endpoint"
        echo "Response: $MEMBER_JSON"
        if echo "$MEMBER_JSON" | grep -q "invitation"; then
            INVITATION_ID=$(echo "$MEMBER_JSON" | grep -o '"invitation_id":"[^"]*' | head -1 | cut -d'"' -f4)
        fi
    else
        echo -e "${YELLOW}✗${NC} Failed (Status: $MEMBER_STATUS)"
        echo "Response: $MEMBER_JSON"
    fi
fi

echo ""

# Test 3: List invitations
echo "📝 Test 3: List invitations for the group"
echo "------------------------------------------"
LIST_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/invitations?group_id=$GROUP_ID" \
    -H "Authorization: Bearer $AUTH_TOKEN")

LIST_JSON=$(echo "$LIST_RESPONSE" | head -n -1)
LIST_STATUS=$(echo "$LIST_RESPONSE" | tail -n 1)

if [ "$LIST_STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} Invitations retrieved"
    echo "Response: $LIST_JSON"
    INVITATION_COUNT=$(echo "$LIST_JSON" | grep -o '"id"' | wc -l | tr -d ' ')
    echo "Found $INVITATION_COUNT invitation(s)"
else
    echo -e "${YELLOW}✗${NC} Failed to list invitations (Status: $LIST_STATUS)"
    echo "Response: $LIST_JSON"
fi

echo ""

# Test 4: Check database
echo "📝 Test 4: Verify in database"
echo "-----------------------------"
echo "Open Supabase Studio: http://127.0.0.1:54323"
echo "Go to Table Editor > group_invitations"
echo "You should see the invitation with:"
echo "  - group_id: $GROUP_ID"
echo "  - email: $INVITE_EMAIL"
echo "  - status: pending"
echo ""

# Test 5: Cancel invitation (optional)
if [ -n "$INVITATION_ID" ]; then
    read -p "Do you want to test canceling the invitation? (y/n): " cancel_test
    if [ "$cancel_test" = "y" ]; then
        echo ""
        echo "📝 Test 5: Cancel invitation"
        echo "----------------------------"
        CANCEL_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "$API_URL/invitations/$INVITATION_ID" \
            -H "Authorization: Bearer $AUTH_TOKEN")
        
        CANCEL_JSON=$(echo "$CANCEL_RESPONSE" | head -n -1)
        CANCEL_STATUS=$(echo "$CANCEL_RESPONSE" | tail -n 1)
        
        if [ "$CANCEL_STATUS" = "200" ]; then
            echo -e "${GREEN}✓${NC} Invitation cancelled"
            echo "Response: $CANCEL_JSON"
        else
            echo -e "${YELLOW}✗${NC} Failed to cancel (Status: $CANCEL_STATUS)"
            echo "Response: $CANCEL_JSON"
        fi
    fi
fi

echo ""
echo -e "${GREEN}✅ Testing complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Test auto-acceptance: Sign up with email $INVITE_EMAIL"
echo "2. Verify user is automatically added to the group"
echo "3. Check invitation status changes to 'accepted'"
echo ""

