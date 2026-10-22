import {
  DEFAULT_COMPANY_SETTINGS,
  type Company,
  type CompanySettings,
  type Site,
} from '../../../shared/types';
import { parseJson, type DB } from '../db';
import type { CompanyRow, SiteRow } from '../db/rows';
import { notFound } from '../lib/errors';

export function companySettings(row: Pick<CompanyRow, 'settings'>): CompanySettings {
  return { ...DEFAULT_COMPANY_SETTINGS, ...parseJson<Partial<CompanySettings>>(row.settings, {}) };
}

export function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    active: !!row.active,
    notes: row.notes,
    settings: companySettings(row),
    createdAt: row.created_at,
  };
}

export function toSite(row: SiteRow): Site {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    radiusM: row.radius_m,
    networks: parseJson<string[]>(row.networks, []),
    requireNetwork: !!row.require_network,
    active: !!row.active,
  };
}

export function getCompany(db: DB, id: number): CompanyRow {
  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as CompanyRow | undefined;
  if (!row) throw notFound('Company not found.');
  return row;
}

export function getSite(db: DB, companyId: number, id: number): SiteRow {
  const row = db.prepare('SELECT * FROM sites WHERE id = ? AND company_id = ?').get(id, companyId) as
    | SiteRow
    | undefined;
  if (!row) throw notFound('Site not found.');
  return row;
}

export function listSites(db: DB, companyId: number, activeOnly = false): SiteRow[] {
  return db
    .prepare(`SELECT * FROM sites WHERE company_id = ? ${activeOnly ? 'AND active = 1' : ''} ORDER BY name COLLATE NOCASE`)
    .all(companyId) as SiteRow[];
}
