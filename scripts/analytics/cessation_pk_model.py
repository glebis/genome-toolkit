#!/usr/bin/env python3
"""
Cannabis Cessation Pharmacokinetic Model
=========================================
One-compartment PK model predicting how caffeine, sertraline, and melatonin
plasma levels change over a 21-day cannabis cessation period, based on
personal CYP genotype (CYP1A2 rs762551 A;C, CYP2C19 *1/*1).

Background:
- Cannabis smoke induces CYP1A2 ~1.5-3x via AhR pathway
- CBD inhibits CYP2C19 (Ki ~1 uM), phenoconverting normal -> poor metabolizer
- On cessation, CYP1A2 de-induces (tau ~2 days), CYP2C19 recovers (tau ~1.5 days)

Model: illustrative, NOT clinical-grade. Do not use for dosing decisions.

Author: Generated for Gleb Kalinin's genomics vault
Date: 2026-03-23
"""

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path
import json

# ============================================================================
# OUTPUT DIRECTORY
# ============================================================================
OUTPUT_DIR = Path(__file__).parent.parent / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================================
# ENZYME KINETICS: TIME-VARYING CYP ACTIVITY DURING CESSATION
# ============================================================================

# CYP1A2 parameters
# Genotype baseline (A;C, intermediate/slow in non-smoker): activity = 1.0
# Induced state (daily cannabis smoking): activity ~2.0x baseline
# De-induction tau: ~2 days (protein half-life ~40h -> tau = t_half / ln2 ~ 58h ~ 2.4 days)
CYP1A2_BASELINE = 1.0      # genotype-predicted activity (non-induced)
CYP1A2_INDUCED = 2.0       # activity while smoking daily (1.5-3x, using 2x)
CYP1A2_TAU_DAYS = 2.0      # de-induction time constant (days)

# CYP2C19 parameters
# Genotype baseline (*1/*1, normal metabolizer): activity = 1.0
# Inhibited state (CBD present): activity ~0.35 (poor metabolizer phenoconversion)
# Recovery tau: ~1.5 days (CBD half-life ~18-32h, using ~24h -> tau ~ 1.5 days)
CYP2C19_BASELINE = 1.0     # genotype-predicted activity (no CBD)
CYP2C19_INHIBITED = 0.35   # activity with daily CBD exposure (~poor metabolizer)
CYP2C19_TAU_DAYS = 1.5     # recovery time constant (days)


def cyp1a2_activity(t_days):
    """
    CYP1A2 relative activity as function of days since cessation.
    Exponential decay from induced state back to genotype baseline.
    activity(t) = baseline + (induced - baseline) * exp(-t / tau)
    At t=0 (cessation start): activity = induced (2.0)
    As t -> inf: activity -> baseline (1.0)
    """
    return CYP1A2_BASELINE + (CYP1A2_INDUCED - CYP1A2_BASELINE) * np.exp(-t_days / CYP1A2_TAU_DAYS)


def cyp2c19_activity(t_days):
    """
    CYP2C19 relative activity as function of days since cessation.
    Exponential recovery from inhibited state back to genotype baseline.
    activity(t) = baseline - (baseline - inhibited) * exp(-t / tau)
    At t=0: activity = inhibited (0.35)
    As t -> inf: activity -> baseline (1.0)
    """
    return CYP2C19_BASELINE - (CYP2C19_BASELINE - CYP2C19_INHIBITED) * np.exp(-t_days / CYP2C19_TAU_DAYS)


# ============================================================================
# DRUG PARAMETERS
# ============================================================================

class Drug:
    """One-compartment PK model parameters for a single drug."""
    def __init__(self, name, dose_mg, frequency_h, bioavailability, vd_L,
                 baseline_half_life_h, cyp_enzyme, dose_times_h=None):
        self.name = name
        self.dose_mg = dose_mg
        self.frequency_h = frequency_h
        self.bioavailability = bioavailability
        self.vd_L = vd_L  # volume of distribution (L)
        self.baseline_half_life_h = baseline_half_life_h
        self.cyp_enzyme = cyp_enzyme  # 'CYP1A2' or 'CYP2C19'
        # Optional: specific dose times within each 24h period (hours from midnight)
        self.dose_times_h = dose_times_h

    def half_life_at_time(self, t_days):
        """
        Half-life adjusted for current enzyme activity.
        Higher enzyme activity -> shorter half-life (faster clearance).
        half_life = baseline_half_life / enzyme_activity
        """
        if self.cyp_enzyme == 'CYP1A2':
            activity = cyp1a2_activity(t_days)
        elif self.cyp_enzyme == 'CYP2C19':
            activity = cyp2c19_activity(t_days)
        else:
            activity = 1.0
        return self.baseline_half_life_h / activity

    def ke_at_time(self, t_days):
        """Elimination rate constant at given time. ke = ln(2) / t_half"""
        return np.log(2) / self.half_life_at_time(t_days)


# Drug definitions
CAFFEINE = Drug(
    name="Caffeine (200mg morning)",
    dose_mg=200,
    frequency_h=24,
    bioavailability=0.99,  # near-complete oral absorption
    vd_L=37,              # ~0.5-0.7 L/kg, using 70kg * 0.53
    baseline_half_life_h=5.5,  # A;C genotype baseline (non-induced, non-smoker): 5-6h
    cyp_enzyme='CYP1A2',
    dose_times_h=[8.0],   # 8 AM dose
)

SERTRALINE = Drug(
    name="Sertraline (50mg daily)",
    dose_mg=50,
    frequency_h=24,
    bioavailability=0.44,  # ~44% oral bioavailability (first-pass metabolism)
    vd_L=1400,            # ~20 L/kg, highly lipophilic
    baseline_half_life_h=26,  # *1/*1 normal metabolizer: 22-36h, using 26h
    cyp_enzyme='CYP2C19',
    dose_times_h=[9.0],   # 9 AM dose
)

MELATONIN = Drug(
    name="Melatonin (1mg evening)",
    dose_mg=1.0,
    frequency_h=24,
    bioavailability=0.15,  # ~15% oral bioavailability (extensive first-pass)
    vd_L=35,              # ~0.5 L/kg
    baseline_half_life_h=0.75,  # 45 min baseline for A;C genotype
    cyp_enzyme='CYP1A2',
    dose_times_h=[22.0],  # 10 PM dose
)


# ============================================================================
# SIMULATION ENGINE
# ============================================================================

def simulate_pk(drug, total_days=21, dt_h=0.1, pre_cessation_days=3):
    """
    Simulate plasma concentration over time using one-compartment model
    with time-varying elimination rate.

    First simulates pre_cessation_days at induced/inhibited state to reach
    approximate steady state, then 21 days of cessation.

    Returns:
        t_hours: array of time points (hours, 0 = cessation start)
        concentrations: array of plasma concentrations (mg/L)
        half_lives: array of half-lives at each time point (hours)
        enzyme_activities: array of relative enzyme activities
    """
    # Total simulation: pre-cessation + cessation period
    total_h = (pre_cessation_days + total_days) * 24
    n_steps = int(total_h / dt_h)

    t_hours = np.linspace(-pre_cessation_days * 24, total_days * 24, n_steps)
    concentrations = np.zeros(n_steps)
    half_lives = np.zeros(n_steps)
    enzyme_activities = np.zeros(n_steps)

    C = 0.0  # initial concentration

    for i in range(n_steps):
        t_h = t_hours[i]
        t_days = t_h / 24.0

        # Before cessation (t < 0): enzyme at induced/inhibited state
        if t_days < 0:
            if drug.cyp_enzyme == 'CYP1A2':
                activity = CYP1A2_INDUCED
            else:
                activity = CYP2C19_INHIBITED
            hl = drug.baseline_half_life_h / activity
        else:
            activity = cyp1a2_activity(t_days) if drug.cyp_enzyme == 'CYP1A2' else cyp2c19_activity(t_days)
            hl = drug.baseline_half_life_h / activity

        ke = np.log(2) / hl

        # Check if a dose is administered at this time step
        # Convert absolute time to time-of-day
        # t_h is hours from cessation. Absolute hour = t_h (shifted so t=0 is midnight of day 0)
        # We assume cessation starts at midnight of day 0
        abs_hour = t_h
        hour_of_day = abs_hour % 24
        if hour_of_day < 0:
            hour_of_day += 24

        dose_added = False
        for dose_time in drug.dose_times_h:
            if abs(hour_of_day - dose_time) < dt_h / 2:
                # Check we haven't already dosed at a very close time
                # Add dose: instantaneous absorption (simplified)
                dose_conc = (drug.dose_mg * drug.bioavailability) / drug.vd_L
                C += dose_conc
                dose_added = True

        # Elimination step (Euler method)
        C = C * np.exp(-ke * dt_h)
        C = max(C, 0)

        concentrations[i] = C
        half_lives[i] = hl
        enzyme_activities[i] = activity

    return t_hours, concentrations, half_lives, enzyme_activities


def compute_daily_metrics(t_hours, concentrations, total_days=21):
    """Compute daily peak and trough concentrations."""
    days = []
    peaks = []
    troughs = []
    aucs = []

    for day in range(total_days + 1):
        mask = (t_hours >= day * 24) & (t_hours < (day + 1) * 24)
        if np.any(mask):
            day_conc = concentrations[mask]
            day_t = t_hours[mask]
            days.append(day)
            peaks.append(np.max(day_conc))
            troughs.append(np.min(day_conc))
            # Trapezoidal AUC for the day
            aucs.append(np.trapezoid(day_conc, day_t))

    return np.array(days), np.array(peaks), np.array(troughs), np.array(aucs)


# ============================================================================
# PLOTTING
# ============================================================================

def plot_enzyme_activity(output_dir):
    """Plot CYP enzyme activity over cessation period."""
    t_days = np.linspace(0, 21, 500)
    cyp1a2 = [cyp1a2_activity(t) for t in t_days]
    cyp2c19 = [cyp2c19_activity(t) for t in t_days]

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(t_days, cyp1a2, 'b-', linewidth=2, label='CYP1A2 (de-induction)')
    ax.plot(t_days, cyp2c19, 'r-', linewidth=2, label='CYP2C19 (recovery from inhibition)')
    ax.axhline(y=1.0, color='gray', linestyle='--', alpha=0.5, label='Genotype baseline (1.0)')
    ax.axhspan(0.9, 1.1, alpha=0.1, color='green', label='Normal range')

    # Mark key timepoints
    ax.axvline(x=3, color='orange', linestyle=':', alpha=0.7)
    ax.axvline(x=7, color='orange', linestyle=':', alpha=0.7)
    ax.axvline(x=14, color='orange', linestyle=':', alpha=0.7)
    ax.text(3, 2.05, 'Day 3', ha='center', fontsize=8, color='orange')
    ax.text(7, 2.05, 'Day 7', ha='center', fontsize=8, color='orange')
    ax.text(14, 2.05, 'Day 14', ha='center', fontsize=8, color='orange')

    ax.set_xlabel('Days since cannabis cessation')
    ax.set_ylabel('Relative enzyme activity')
    ax.set_title('CYP Enzyme Activity During Cannabis Cessation\n(CYP1A2 rs762551 A;C, CYP2C19 *1/*1)')
    ax.legend(loc='right')
    ax.set_xlim(0, 21)
    ax.set_ylim(0, 2.3)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    filepath = output_dir / 'enzyme_activity_cessation.png'
    fig.savefig(filepath, dpi=150)
    plt.close(fig)
    print(f"Saved: {filepath}")
    return filepath


def plot_drug_pk(drug, t_hours, concentrations, half_lives, enzyme_activities,
                 output_dir, filename):
    """Plot drug PK profile during cessation."""
    fig, axes = plt.subplots(3, 1, figsize=(12, 10), sharex=True)

    t_days = t_hours / 24.0
    mask = t_days >= -1  # show from 1 day before cessation

    # Panel 1: Plasma concentration
    ax = axes[0]
    ax.plot(t_days[mask], concentrations[mask] * 1000, 'b-', linewidth=0.8)  # mg/L -> ug/L
    ax.axvline(x=0, color='red', linestyle='--', alpha=0.7, label='Cessation start')
    ax.set_ylabel('Plasma concentration (ug/L)')
    ax.set_title(f'{drug.name} — Plasma Concentration During Cessation')
    ax.legend()
    ax.grid(True, alpha=0.3)

    # Add danger window shading
    if drug.cyp_enzyme == 'CYP1A2':
        ax.axvspan(2, 10, alpha=0.1, color='red', label='Danger window (rising levels)')
    elif drug.cyp_enzyme == 'CYP2C19':
        ax.axvspan(0, 5, alpha=0.1, color='blue', label='Level drop window')
    ax.legend()

    # Panel 2: Half-life
    ax = axes[1]
    ax.plot(t_days[mask], half_lives[mask], 'g-', linewidth=1.5)
    ax.axvline(x=0, color='red', linestyle='--', alpha=0.7)
    ax.set_ylabel('Half-life (hours)')
    ax.set_title(f'{drug.name} — Effective Half-life')
    ax.grid(True, alpha=0.3)

    # Panel 3: Enzyme activity
    ax = axes[2]
    ax.plot(t_days[mask], enzyme_activities[mask], 'm-', linewidth=1.5)
    ax.axvline(x=0, color='red', linestyle='--', alpha=0.7)
    ax.axhline(y=1.0, color='gray', linestyle='--', alpha=0.5)
    ax.set_ylabel('Relative enzyme activity')
    ax.set_xlabel('Days since cessation')
    ax.set_title(f'{drug.cyp_enzyme} Activity')
    ax.grid(True, alpha=0.3)

    fig.tight_layout()
    filepath = output_dir / filename
    fig.savefig(filepath, dpi=150)
    plt.close(fig)
    print(f"Saved: {filepath}")
    return filepath


def plot_daily_comparison(drugs_data, output_dir):
    """Plot daily peak concentration as % of pre-cessation baseline for all drugs."""
    fig, ax = plt.subplots(figsize=(10, 6))

    colors = {'Caffeine': 'brown', 'Sertraline': 'blue', 'Melatonin': 'purple'}

    for name, data in drugs_data.items():
        days, peaks, troughs, aucs = data['daily_metrics']
        # Normalize to day 0 (pre-cessation steady state)
        if peaks[0] > 0:
            normalized = (peaks / peaks[0]) * 100
        else:
            normalized = peaks * 0
        color = colors.get(name, 'black')
        ax.plot(days, normalized, 'o-', color=color, linewidth=2, markersize=4, label=name)

    ax.axhline(y=100, color='gray', linestyle='--', alpha=0.5, label='Pre-cessation baseline')
    ax.axvspan(2, 10, alpha=0.08, color='red')
    ax.text(6, 105, 'Primary adjustment\nwindow', ha='center', fontsize=9, color='red', alpha=0.7)

    ax.set_xlabel('Days since cessation')
    ax.set_ylabel('Daily peak concentration (% of pre-cessation)')
    ax.set_title('Relative Drug Level Changes During Cannabis Cessation\n(CYP1A2 A;C + CYP2C19 *1/*1)')
    ax.legend()
    ax.set_xlim(0, 21)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    filepath = output_dir / 'cessation_comparison.png'
    fig.savefig(filepath, dpi=150)
    plt.close(fig)
    print(f"Saved: {filepath}")
    return filepath


def plot_caffeine_detail(t_hours, concentrations, output_dir):
    """Detailed caffeine plot showing individual dose peaks across cessation."""
    fig, ax = plt.subplots(figsize=(12, 5))
    t_days = t_hours / 24.0

    # Show days 0-7 in detail (the critical window)
    mask = (t_days >= -0.5) & (t_days <= 8)
    ax.plot(t_days[mask], concentrations[mask] * 1000, 'b-', linewidth=1)
    ax.fill_between(t_days[mask], 0, concentrations[mask] * 1000, alpha=0.15, color='blue')

    # Mark approximate toxicity-concern threshold
    # Caffeine: plasma > 15 mg/L associated with adverse effects in slow metabolizers
    # At 200mg dose: Cmax ~ 200*0.99/37 = 5.35 mg/L -> 5350 ug/L
    # But with accumulation from slower clearance, trough rises

    ax.axvline(x=0, color='red', linestyle='--', alpha=0.7, label='Cessation start')
    ax.set_xlabel('Days since cessation')
    ax.set_ylabel('Caffeine plasma concentration (ug/L)')
    ax.set_title('Caffeine Levels: Days 0-8 of Cannabis Cessation (200mg/day at 8 AM)\nNote rising trough levels as CYP1A2 de-induces')
    ax.legend()
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    filepath = output_dir / 'caffeine_pk_cessation.png'
    fig.savefig(filepath, dpi=150)
    plt.close(fig)
    print(f"Saved: {filepath}")
    return filepath


# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 60)
    print("Cannabis Cessation PK Model")
    print("CYP1A2 rs762551 A;C | CYP2C19 *1/*1")
    print("=" * 60)

    drugs = [CAFFEINE, SERTRALINE, MELATONIN]
    drugs_data = {}

    for drug in drugs:
        print(f"\nSimulating: {drug.name}")
        t_h, conc, hl, ea = simulate_pk(drug, total_days=21, dt_h=0.05, pre_cessation_days=5)
        days, peaks, troughs, aucs = compute_daily_metrics(t_h, conc)

        short_name = drug.name.split('(')[0].strip()
        drugs_data[short_name] = {
            't_hours': t_h,
            'concentrations': conc,
            'half_lives': hl,
            'enzyme_activities': ea,
            'daily_metrics': (days, peaks, troughs, aucs),
        }

        # Print daily summary
        print(f"  {'Day':>4} | {'Peak (ug/L)':>12} | {'Trough (ug/L)':>14} | {'Half-life (h)':>14}")
        print(f"  {'-'*4}-+-{'-'*12}-+-{'-'*14}-+-{'-'*14}")
        for j, d in enumerate(days):
            if d <= 21:
                # Get half-life at noon of that day
                t_noon = d * 24 + 12
                idx = np.argmin(np.abs(t_h - t_noon))
                print(f"  {d:4d} | {peaks[j]*1000:12.2f} | {troughs[j]*1000:14.2f} | {hl[idx]:14.1f}")

    # Generate plots
    print("\nGenerating plots...")

    plot_enzyme_activity(OUTPUT_DIR)

    # Individual drug plots
    filenames = {
        'Caffeine': 'caffeine_pk_cessation_full.png',
        'Sertraline': 'sertraline_pk_cessation.png',
        'Melatonin': 'melatonin_pk_cessation.png',
    }
    for name, data in drugs_data.items():
        drug_obj = {'Caffeine': CAFFEINE, 'Sertraline': SERTRALINE, 'Melatonin': MELATONIN}[name]
        plot_drug_pk(drug_obj, data['t_hours'], data['concentrations'],
                     data['half_lives'], data['enzyme_activities'],
                     OUTPUT_DIR, filenames[name])

    # Caffeine detail plot
    plot_caffeine_detail(drugs_data['Caffeine']['t_hours'],
                         drugs_data['Caffeine']['concentrations'],
                         OUTPUT_DIR)

    # Comparison plot
    plot_daily_comparison(drugs_data, OUTPUT_DIR)

    # Print clinical summary
    print("\n" + "=" * 60)
    print("CLINICAL SUMMARY (illustrative, not for dosing decisions)")
    print("=" * 60)

    # Caffeine
    caff_d = drugs_data['Caffeine']['daily_metrics']
    caff_peak_d0 = caff_d[1][0] * 1000  # day 0 peak in ug/L
    caff_peak_d7 = caff_d[1][min(7, len(caff_d[1])-1)] * 1000
    caff_peak_d14 = caff_d[1][min(14, len(caff_d[1])-1)] * 1000
    print(f"\nCAFFEINE (200mg/day):")
    print(f"  Day 0 peak:  {caff_peak_d0:.1f} ug/L (induced CYP1A2)")
    print(f"  Day 7 peak:  {caff_peak_d7:.1f} ug/L ({(caff_peak_d7/caff_peak_d0-1)*100:+.0f}%)")
    print(f"  Day 14 peak: {caff_peak_d14:.1f} ug/L ({(caff_peak_d14/caff_peak_d0-1)*100:+.0f}%)")
    print(f"  RECOMMENDATION: Reduce to 100mg/day by day 3. Monitor anxiety.")

    # Sertraline
    sert_d = drugs_data['Sertraline']['daily_metrics']
    sert_peak_d0 = sert_d[1][0] * 1000
    sert_peak_d3 = sert_d[1][min(3, len(sert_d[1])-1)] * 1000
    sert_peak_d7 = sert_d[1][min(7, len(sert_d[1])-1)] * 1000
    print(f"\nSERTRALINE (50mg/day):")
    print(f"  Day 0 peak:  {sert_peak_d0:.1f} ug/L (CYP2C19 inhibited by CBD)")
    print(f"  Day 3 peak:  {sert_peak_d3:.1f} ug/L ({(sert_peak_d3/sert_peak_d0-1)*100:+.0f}%)")
    print(f"  Day 7 peak:  {sert_peak_d7:.1f} ug/L ({(sert_peak_d7/sert_peak_d0-1)*100:+.0f}%)")
    print(f"  RECOMMENDATION: Inform prescriber. Levels may drop ~40-60%. Monitor mood.")

    # Melatonin
    mel_d = drugs_data['Melatonin']['daily_metrics']
    mel_peak_d0 = mel_d[1][0] * 1000
    mel_peak_d7 = mel_d[1][min(7, len(mel_d[1])-1)] * 1000
    print(f"\nMELATONIN (1mg evening):")
    print(f"  Day 0 peak:  {mel_peak_d0:.1f} ug/L (induced CYP1A2)")
    print(f"  Day 7 peak:  {mel_peak_d7:.1f} ug/L ({(mel_peak_d7/mel_peak_d0-1)*100:+.0f}%)")
    print(f"  RECOMMENDATION: Reduce to 0.5mg at cessation, 0.3mg by day 7.")

    print(f"\nPlots saved to: {OUTPUT_DIR}")
    print("\nDISCLAIMER: This model is illustrative. It uses simplified one-compartment")
    print("kinetics with population-average parameters adjusted for genotype. Individual")
    print("variation, protein binding, active metabolites, and drug-drug interactions")
    print("beyond CYP effects are not modeled. Do not use for clinical dosing decisions.")


if __name__ == '__main__':
    main()
