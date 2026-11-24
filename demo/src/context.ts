import { createContext, useContext } from 'react';
import { DICTS, fill, type Dict, type Industry, type Lang } from './i18n';

export interface Profile {
  company: string;
  workers: number;
  industry: Industry;
}

export interface Calc {
  minutes: number;
  wage: number;
}

export interface DemoState {
  lang: Lang;
  profile: Profile;
  calc: Calc;
}

export const WORK_DAYS = 22;

/** Monthly hours and money lost, from the visitor's own numbers. */
export function loss(profile: Profile, calc: Calc) {
  const hours = (profile.workers * calc.minutes * WORK_DAYS) / 60;
  return { hours, money: hours * calc.wage };
}

export const DemoContext = createContext<DemoState | null>(null);

export function useDemo() {
  const state = useContext(DemoContext);
  if (!state) throw new Error('useDemo outside DemoContext');
  const d: Dict = DICTS[state.lang];
  const rtl = d.dir === 'rtl';
  const t = (template: string, params: Record<string, string | number> = {}) => fill(template, params, rtl);
  const company = state.profile.company.trim() || d.common.defaultCompany;
  const site = d.sites[state.profile.industry];
  return { ...state, d, rtl, t, company, site };
}
