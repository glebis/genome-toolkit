#!/usr/bin/env bash
# PreToolUse hook: backup .db files before destructive operations
# Triggers on Bash commands that reference .db files with destructive patterns
# Creates timestamped backup, blocks if backup fails

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only process Bash tool calls
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Check if command references .db files
DB_FILES=$(echo "$COMMAND" | grep -oE '[^ "]+\.db\b' | sort -u || true)

if [ -z "$DB_FILES" ]; then
  exit 0
fi

# Block any command that would overwrite a .db file with an empty source
# Catches: cp empty.db real.db, mv empty.db real.db, redirect > file.db
for DB_FILE in $DB_FILES; do
  RESOLVED=""
  if [ -f "$DB_FILE" ]; then
    RESOLVED="$DB_FILE"
  elif [ -f "$(eval echo "$DB_FILE" 2>/dev/null)" ]; then
    RESOLVED="$(eval echo "$DB_FILE" 2>/dev/null)"
  fi

  # Check if command copies/moves FROM an empty file TO this .db
  # Pattern: cp/mv <source> <target.db> where source is empty
  SOURCE_FILE=$(echo "$COMMAND" | grep -oE "(cp|mv)\s+([^ ]+)\s+.*${DB_FILE}" | awk '{print $2}' || true)
  if [ -n "$SOURCE_FILE" ] && [ -f "$SOURCE_FILE" ] && [ ! -s "$SOURCE_FILE" ]; then
    echo "{\"decision\":\"block\",\"reason\":\"BLOCKED: source file $SOURCE_FILE is empty (0 bytes). Refusing to overwrite $DB_FILE with empty file.\"}"
    exit 0
  fi

  # Check if command would truncate/redirect into .db (> file.db)
  if echo "$COMMAND" | grep -qE ">\s*[^ ]*${DB_FILE}"; then
    echo "{\"decision\":\"block\",\"reason\":\"BLOCKED: command would redirect/truncate $DB_FILE. Use sqlite3 commands instead.\"}"
    exit 0
  fi
done

# Check if command is potentially destructive
DESTRUCTIVE_PATTERNS="DROP|DELETE|ALTER|UPDATE|INSERT|REPLACE|rm |mv |cp.*\.db|sqlite3.*<|executescript|migrate|ensure_schema"
IS_DESTRUCTIVE=$(echo "$COMMAND" | grep -iE "$DESTRUCTIVE_PATTERNS" || true)

if [ -z "$IS_DESTRUCTIVE" ]; then
  exit 0
fi

# Backup each .db file found
BACKUP_DIR="$HOME/.genome-toolkit-backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKED_UP=""

for DB_FILE in $DB_FILES; do
  # Resolve path
  RESOLVED=""
  if [ -f "$DB_FILE" ]; then
    RESOLVED="$DB_FILE"
  elif [ -f "$(eval echo "$DB_FILE")" ]; then
    RESOLVED="$(eval echo "$DB_FILE")"
  fi

  if [ -n "$RESOLVED" ] && [ -f "$RESOLVED" ]; then
    BASENAME=$(basename "$RESOLVED")
    BACKUP_PATH="$BACKUP_DIR/${BASENAME%.db}-${TIMESTAMP}.db"

    if cp "$RESOLVED" "$BACKUP_PATH" 2>/dev/null; then
      SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
      BACKED_UP="${BACKED_UP}${BASENAME} -> ${BACKUP_PATH} (${SIZE})\n"
    else
      # Backup failed — block the operation
      echo "{\"decision\":\"block\",\"reason\":\"Failed to backup $RESOLVED before destructive operation\"}"
      exit 0
    fi
  fi
done

if [ -n "$BACKED_UP" ]; then
  MSG=$(printf "DB backup created before destructive operation:\n${BACKED_UP}")
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"$MSG\"}}"
fi
