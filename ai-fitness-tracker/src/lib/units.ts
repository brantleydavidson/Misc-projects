/**
 * Unit conversion + formatting utilities.
 * All internal storage is metric (kg, cm, ml, km).
 * Display converts based on user preferences.
 */

import type { UserProfile } from '../types';

// ── Weight ──────────────────────────────────────────────────────────
const KG_TO_LBS = 2.20462;

export function kgToLbs(kg: number): number {
  return Math.round(kg * KG_TO_LBS * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round((lbs / KG_TO_LBS) * 10) / 10;
}

export function displayWeight(kg: number, profile: UserProfile): string {
  if (profile.unit_weight === 'kg') return `${Math.round(kg * 10) / 10} kg`;
  return `${kgToLbs(kg)} lbs`;
}

export function weightUnit(profile: UserProfile): string {
  return profile.unit_weight === 'kg' ? 'kg' : 'lbs';
}

export function displayWeightValue(kg: number, profile: UserProfile): number {
  if (profile.unit_weight === 'kg') return Math.round(kg * 10) / 10;
  return kgToLbs(kg);
}

// ── Height ──────────────────────────────────────────────────────────
export function cmToInches(cm: number): number {
  return Math.round(cm / 2.54 * 10) / 10;
}

export function inchesToCm(inches: number): number {
  return Math.round(inches * 2.54 * 10) / 10;
}

export function cmToFeetInches(cm: number): string {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${feet}'${inches}"`;
}

export function displayHeight(cm: number, profile: UserProfile): string {
  if (profile.unit_height === 'cm') return `${Math.round(cm)} cm`;
  return cmToFeetInches(cm);
}

// ── Distance ────────────────────────────────────────────────────────
const KM_TO_MI = 0.621371;

export function kmToMi(km: number): number {
  return Math.round(km * KM_TO_MI * 100) / 100;
}

export function miToKm(mi: number): number {
  return Math.round(mi / KM_TO_MI * 100) / 100;
}

export function displayDistance(km: number, profile: UserProfile): string {
  if (profile.unit_distance === 'km') return `${Math.round(km * 100) / 100} km`;
  return `${kmToMi(km)} mi`;
}

// ── Water ───────────────────────────────────────────────────────────
const ML_TO_OZ = 0.033814;

export function mlToOz(ml: number): number {
  return Math.round(ml * ML_TO_OZ * 10) / 10;
}

export function ozToMl(oz: number): number {
  return Math.round(oz / ML_TO_OZ);
}

export function displayWater(ml: number, profile: UserProfile): string {
  if (profile.unit_water === 'ml' || profile.unit_water === undefined) {
    if (ml >= 1000) return `${(ml / 1000).toFixed(1)}L`;
    return `${Math.round(ml)} ml`;
  }
  return `${mlToOz(ml)} oz`;
}

export function displayWaterTarget(liters: number, profile: UserProfile): string {
  if (profile.unit_water === 'oz') return `${mlToOz(liters * 1000)} oz`;
  return `${liters}L`;
}

export function waterIncrements(profile: UserProfile): { ml: number; label: string }[] {
  if (profile.unit_water === 'oz') {
    return [
      { ml: 237, label: '+8 oz' },   // ~8oz
      { ml: 473, label: '+16 oz' },  // ~16oz
      { ml: 710, label: '+24 oz' },  // ~24oz
    ];
  }
  return [
    { ml: 250, label: '+250ml' },
    { ml: 500, label: '+500ml' },
    { ml: 750, label: '+750ml' },
  ];
}

// ── Date formatting ─────────────────────────────────────────────────
export function formatDate(dateStr: string, profile: UserProfile): string {
  const d = new Date(dateStr + 'T00:00:00');
  const fmt = profile.date_format || 'MM/DD/YYYY';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  if (fmt === 'DD/MM/YYYY') return `${dd}/${mm}/${yyyy}`;
  if (fmt === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
  return `${mm}/${dd}/${yyyy}`;
}

export function formatTime(time24: string, profile: UserProfile): string {
  if (profile.time_format === '24h') return time24;
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Defaults for US-based app ───────────────────────────────────────
export function getDefaultPreferences(): Partial<UserProfile> {
  return {
    unit_weight: 'lbs',
    unit_height: 'in',
    unit_distance: 'mi',
    unit_water: 'oz',
    unit_temperature: 'F',
    date_format: 'MM/DD/YYYY',
    time_format: '12h',
    weekly_weigh_in_day: 1,
    display_theme: 'dark',
  };
}
