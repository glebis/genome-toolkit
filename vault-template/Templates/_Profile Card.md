---
type: profile
created_date: '{{date}}'
last_updated: '{{date}}'
demographics:
  age: {{age}}
  sex: {{sex}}
  location: {{location}}
medications: []
diagnoses: []
goals: []
assessments:
  gad7_score: null
  gad7_severity: null
  phq2_score: null
  phq2_flag: null
  pss4_score: null
  sleep_duration: null
  sleep_quality: null
  exercise_frequency: null
  caffeine_cups: null
  alcohol_units: null
  cannabis_current: null
  bristol_scale: null
  morning_stiffness: null
  med_satisfaction: null
ancestry: null
prior_testing: []
tags:
  - profile
  - assessment
---

# Profile Card

> Last updated: {{date}}

## Demographics

| Field | Value |
|-------|-------|
| Age | {{age}} |
| Sex | {{sex}} |
| Location | {{location}} |
| Ancestry | {{ancestry}} |

## Current Medications

| Medication | Dose | Purpose | Key Gene |
|-----------|------|---------|----------|
{{#medications}}
| {{name}} | {{dose}} | {{purpose}} | {{gene}} |
{{/medications}}

## Active Diagnoses

{{#diagnoses}}
- {{.}}
{{/diagnoses}}

## Health Goals

{{#goals}}
- {{display}}
{{/goals}}

## Assessment Scores

### GAD-7 (Anxiety)
- **Score**: {{gad7_score}} / 21
- **Severity**: {{gad7_severity}}
- **Gene context**: FKBP5 C;T (prolonged cortisol), SLC6A4 C;T (anxiety risk), COMT Val/Met (intermediate)

### PHQ-2 (Depression Screen)
- **Score**: {{phq2_score}} / 6
- **Flag**: {{phq2_flag}}
- **Gene context**: BDNF Val/Val (protective), DRD2 A1/A2 (reward sensitivity)

### PSS-4 (Perceived Stress)
- **Score**: {{pss4_score}} / 16
- **Gene context**: CRHR1 T;T (HPA sensitization), NR3C1 (GR)

### Physiological

| Metric | Value | Status | Gene Link |
|--------|-------|--------|-----------|
| Sleep duration | {{sleep_duration}}h | {{sleep_status}} | CYP1A2, FKBP5 |
| Sleep quality | {{sleep_quality}}/5 | | PER3, CLOCK |
| Exercise | {{exercise_frequency}} | | BDNF, DRD2 |
| Caffeine | {{caffeine_cups}} cups | | CYP1A2 |
| Alcohol | {{alcohol_units}}/week | | PNPLA3, OPRM1 |
| GI (Bristol) | {{bristol_scale}} | | ATG16L1, FUT2 |
| Morning stiffness | {{morning_stiffness}} | | HLA-B27 |
| Med satisfaction | {{med_satisfaction}}/5 | | CYP2D6 |

## Concerns

> {{concerns}}

## Family History

{{#family_history}}
- {{.}}
{{/family_history}}

---

## Reassessment Schedule

- GAD-7 + PHQ-2: every 30 days (or at medication change)
- PSS-4: every 30 days
- Full profile update: every 90 days or after significant change
- Biomarker comparison: after each lab result (/biomarker)
