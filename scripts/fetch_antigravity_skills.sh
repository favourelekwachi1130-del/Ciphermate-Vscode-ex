#!/usr/bin/env bash
# Fetch curated antigravity skills for CipherMate skill composition (Option C).
# Run from project root: ./scripts/fetch_antigravity_skills.sh

set -e
REPO="https://github.com/sickn33/antigravity-awesome-skills.git"
TMP="/tmp/antigravity-awesome-skills"
DEST="skills/antigravity"

# Curated skills for security/code workflows
SKILLS=(
  api-security-best-practices
  api-security-testing
  attack-tree-construction
  auth-implementation-patterns
  ethical-hacking-methodology
  systematic-debugging
)

echo "Fetching antigravity-awesome-skills..."
git clone --depth 1 "$REPO" "$TMP" 2>/dev/null || (cd "$TMP" && git pull)

mkdir -p "$DEST"
for skill in "${SKILLS[@]}"; do
  src="$TMP/skills/$skill"
  if [ -d "$src" ]; then
    cp -r "$src" "$DEST/"
    echo "  + $skill"
  else
    echo "  - $skill (not found)"
  fi
done

echo "Done. Skills in $DEST/"
echo "Enable: ciphermate.skills.useAntigravity = true"
