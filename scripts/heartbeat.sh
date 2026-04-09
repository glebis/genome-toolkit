#!/bin/bash
# Genome Heartbeat — daily health + triage briefing
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"
export PYTHONPATH="$PROJECT_DIR"

: "${GENOME_VAULT_ROOT:?Set GENOME_VAULT_ROOT to your vault path}"

RESULT=$(python3 -c "
import sys
sys.path.insert(0, '$PROJECT_DIR')
from pathlib import Path
import os
from datetime import date
from genome_toolkit.triage.domain.score import TriageBucket
from genome_toolkit.triage.application.triage_use_case import RunTriageSession
from genome_toolkit.triage.infrastructure.vault.task_parser import VaultTaskRepository
from genome_toolkit.triage.infrastructure.vault.findings_parser import VaultFindingsRepository
from genome_toolkit.triage.infrastructure.scripts.lab_adapter import VaultLabSignalRepository
from genome_toolkit.triage.infrastructure.persistence.session_store import MarkdownSessionRepository

vault = Path(os.environ['GENOME_VAULT_ROOT'])
report = RunTriageSession(
    VaultTaskRepository(vault), VaultFindingsRepository(vault),
    VaultLabSignalRepository(vault), MarkdownSessionRepository(vault)
).execute()

total = report.total_items
do_now = report.bucket_counts.get(TriageBucket.DO_NOW, 0)
this_week = report.bucket_counts.get(TriageBucket.THIS_WEEK, 0)
overdue = sum(1 for si in report.scored_items if si.item.due and si.item.due < date.today())
suggestions = len(report.suggestions)

# Top items
top = []
for si in report.scored_items[:3]:
    top.append(si.item.text[:45])

print(f'{total}|{do_now}|{this_week}|{overdue}|{suggestions}|{chr(10).join(top)}')
" 2>/dev/null)

if [ -z "$RESULT" ]; then
    osascript -e 'display notification "Heartbeat error" with title "Genome" sound name "Basso"'
    exit 1
fi

IFS='|' read -r TOTAL DO_NOW THIS_WEEK OVERDUE SUGGESTIONS TOP <<< "$RESULT"

# Main notification
MSG="$TOTAL items | $DO_NOW urgent | $THIS_WEEK this week | $OVERDUE overdue"
osascript -e "display notification \"$MSG\" with title \"Genome Daily\" sound name \"Ping\""

# Assessment check
LAST_GAD=$(ls -t "${GENOME_VAULT_ROOT}/Assessments"/*GAD-7* 2>/dev/null | head -1)
if [ -n "$LAST_GAD" ]; then
    DAYS=$((( $(date +%s) - $(stat -f %m "$LAST_GAD") ) / 86400 ))
    if [ $DAYS -gt 14 ]; then
        MSG="$MSG | GAD-7 due ($DAYS days ago)"
    fi
fi

LOG_DIR="${GENOME_VAULT_ROOT}/data"
mkdir -p "$LOG_DIR"
echo "$(date '+%Y-%m-%d %H:%M'): $MSG" >> "${LOG_DIR}/heartbeat.log"
