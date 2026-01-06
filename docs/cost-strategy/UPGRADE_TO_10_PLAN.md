# Upgrade Plan: 8.5/10  †  10/10

## Strategy: Multiple Template Variations + Enhanced Code Generation

### Phase 1: Add Multiple Template Variations (Highest Impact)
- Add 3-5 code template variations per vulnerability type
- Each variation shows same vulnerability pattern but with different:
  - Function structures
  - Code organization (inline vs extracted)
  - Variable naming
  - Code style (compact vs verbose)
  - Complexity levels

**Result**: 33-55 unique templates instead of 11 (3-5x improvement)

### Phase 2: Enhanced Template Selection
- Select template variation based on variation_id
- Ensure balanced distribution across variations
- Maintain contrastive pair consistency (same variation for vulnerable/safe)

### Phase 3: Structural Code Variations (Future)
- Add more sophisticated code transformations
- Vary control flow patterns
- Add/remove helper functions
- Different abstraction levels

## Implementation Approach

For each vulnerability type, create variations like:
- **Variation 1**: Current template (baseline)
- **Variation 2**: Different function structure (helper functions extracted)
- **Variation 3**: More verbose/commented version
- **Variation 4**: Compact/concise version
- **Variation 5**: Different code organization (class-based vs function-based)

## Expected Impact

**Before**: 1 template per type  †  ~45k exact repeats per 500k samples
**After**: 3-5 templates per type  †  ~15k-9k repeats per variation (much better diversity)

**Quality Improvement**: 8.5/10  †  9.5/10 (near perfect)

To reach true 10/10 would require:
- Full multi-language code generation (months of work)
- Programmatic code generation from ASTs (significant engineering)
- Real-world code pattern integration (complex)

But 9.5/10 is essentially production-perfect for training purposes.


