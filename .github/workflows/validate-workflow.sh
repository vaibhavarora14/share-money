#!/bin/bash

# GitHub Workflow Validation Script
# Tests the workflow logic locally to catch issues before pushing

set -e

echo "🔍 Validating GitHub Workflow..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Check if workflow file exists
echo "1. Checking workflow file exists..."
if [ ! -f ".github/workflows/auto-increment-build.yml" ]; then
    echo -e "${RED}❌ Workflow file not found${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ Workflow file exists${NC}"
fi
echo ""

# Validate YAML syntax
echo "2. Validating YAML syntax..."
YAML_VALID=false
if command -v yq &> /dev/null; then
    if yq eval '.' .github/workflows/auto-increment-build.yml > /dev/null 2>&1; then
        echo -e "${GREEN}✓ YAML syntax is valid (yq)${NC}"
        YAML_VALID=true
    fi
fi
if [ "$YAML_VALID" = false ] && python3 -c "import yaml" 2>/dev/null; then
    if python3 -c "import yaml; yaml.safe_load(open('.github/workflows/auto-increment-build.yml'))" 2>/dev/null; then
        echo -e "${GREEN}✓ YAML syntax is valid (python)${NC}"
        YAML_VALID=true
    fi
fi
if [ "$YAML_VALID" = false ]; then
    echo -e "${YELLOW}⚠ Could not validate YAML (no validator found or syntax error)${NC}"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check required files
echo "3. Checking required files..."
if [ ! -f "mobile/version.json" ]; then
    echo -e "${RED}❌ mobile/version.json not found${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ mobile/version.json exists${NC}"
    
    # Validate version.json structure
    if node -e "const v = require('./mobile/version.json'); if (!v.version || typeof v.buildNumber !== 'number') throw new Error('Invalid')" 2>/dev/null; then
        echo -e "${GREEN}✓ version.json structure is valid${NC}"
    else
        echo -e "${RED}❌ version.json structure is invalid${NC}"
        ERRORS=$((ERRORS + 1))
    fi
fi

if [ ! -f "mobile/scripts/version.js" ]; then
    echo -e "${RED}❌ mobile/scripts/version.js not found${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ mobile/scripts/version.js exists${NC}"
fi

if [ ! -f "mobile/package.json" ]; then
    echo -e "${RED}❌ mobile/package.json not found${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓ mobile/package.json exists${NC}"
fi
echo ""

# Check npm script exists
echo "4. Checking npm scripts..."
if grep -q '"version:build"' mobile/package.json; then
    echo -e "${GREEN}✓ version:build script exists${NC}"
else
    echo -e "${RED}❌ version:build script not found in package.json${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Test version script
echo "5. Testing version script..."
cd mobile
if node scripts/version.js show > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Version script runs successfully${NC}"
    
    # Test dry-run
    if node scripts/version.js build --dry-run > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Dry-run mode works${NC}"
    else
        echo -e "${YELLOW}⚠ Dry-run mode test failed${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${RED}❌ Version script failed${NC}"
    ERRORS=$((ERRORS + 1))
fi
cd ..
echo ""

# Check workflow triggers
echo "6. Checking workflow triggers..."
if grep -q "branches:" .github/workflows/auto-increment-build.yml && grep -q "main" .github/workflows/auto-increment-build.yml; then
    echo -e "${GREEN}✓ Workflow triggers on main branch${NC}"
else
    echo -e "${YELLOW}⚠ Workflow trigger configuration unclear${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

if grep -q "paths-ignore:" .github/workflows/auto-increment-build.yml; then
    echo -e "${GREEN}✓ paths-ignore configured (prevents loops)${NC}"
else
    echo -e "${YELLOW}⚠ paths-ignore not configured${NC}"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check permissions
echo "7. Checking workflow permissions..."
if grep -q "contents: write" .github/workflows/auto-increment-build.yml; then
    echo -e "${GREEN}✓ Write permissions configured${NC}"
else
    echo -e "${RED}❌ Write permissions missing (needed to commit)${NC}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check for common issues
echo "8. Checking for common issues..."

# Check if [skip ci] is in commit message logic
if grep -q "\[skip ci\]" .github/workflows/auto-increment-build.yml; then
    echo -e "${GREEN}✓ Skip CI logic present${NC}"
else
    echo -e "${YELLOW}⚠ Skip CI logic not found${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

# Check for retry logic
if grep -q "MAX_RETRIES" .github/workflows/auto-increment-build.yml; then
    echo -e "${GREEN}✓ Retry logic present${NC}"
else
    echo -e "${YELLOW}⚠ Retry logic not found${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

# Check for validation
if grep -q "Validate" .github/workflows/auto-increment-build.yml || grep -q "validate" .github/workflows/auto-increment-build.yml; then
    echo -e "${GREEN}✓ Validation logic present${NC}"
else
    echo -e "${YELLOW}⚠ Validation logic not found${NC}"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Test workflow logic simulation
echo "9. Simulating workflow logic..."
cd mobile
CURRENT_VERSION=$(node -p "require('./version.json').version")
CURRENT_BUILD=$(node -p "require('./version.json').buildNumber")

echo "  Current version: $CURRENT_VERSION"
echo "  Current build: $CURRENT_BUILD"

# Validate version format
if echo "$CURRENT_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo -e "${GREEN}  ✓ Version format is valid${NC}"
else
    echo -e "${RED}  ❌ Version format is invalid${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Validate build number
if [ "$CURRENT_BUILD" -ge 1 ]; then
    echo -e "${GREEN}  ✓ Build number is valid (>= 1)${NC}"
else
    echo -e "${RED}  ❌ Build number is invalid (< 1)${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Test increment (dry-run)
echo "  Testing build increment (dry-run)..."
if node scripts/version.js build --dry-run > /dev/null 2>&1; then
    EXPECTED_BUILD=$((CURRENT_BUILD + 1))
    echo -e "${GREEN}  ✓ Build increment would work (would be: $EXPECTED_BUILD)${NC}"
else
    echo -e "${RED}  ❌ Build increment test failed${NC}"
    ERRORS=$((ERRORS + 1))
fi
cd ..
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Validation Summary:"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Workflow should work correctly.${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Validation passed with $WARNINGS warning(s)${NC}"
    echo "Workflow should work, but review warnings above."
    exit 0
else
    echo -e "${RED}❌ Validation failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo "Please fix the errors before pushing to main."
    exit 1
fi
