// Fills the database with a realistic demo company so every screen has something to show.
//   npm run seed:demo              (keeps an existing demo company)
//   npm run seed:demo -- --reset   (deletes and recreates it)
// Location and time zone: DEMO_LAT, DEMO_LNG, DEMO_TZ (default: central London).

import { hashPassword } from '../server/src/auth/password';
import { loadConfig } from '../server/src/config';
import { openDatabase, type DB } from '../server/src/db';
import { msg, storeMsg } from '../server/src/i18n';
import { randomToken } from '../server/src/lib/crypto';
import { addDays, addMinutes, nowIso, todayLocal, zonedToUtc } from '../server/src/lib/time';

const DEMO_NAME = 'Demo Construction Co.';
const LAT = Number(process.env.DEMO_LAT ?? 51.5072);
const LNG = Number(process.env.DEMO_LNG ?? -0.1276);
const TZ = process.env.DEMO_TZ ?? 'Europe/London';

const config = loadConfig();
const db = openDatabase(config.dbFile);
const reset = process.argv.includes('--reset');

function insert(db: DB, table: string, row: Record<string, unknown>): number {
  const keys = Object.keys(row);
  return Number(
    db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...Object.values(row))
      .lastInsertRowid,
  );
}

let seed = 42;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const jitter = (scale: number) => (rand() - 0.5) * scale;

async function main() {
  const existing = db.prepare('SELECT id FROM companies WHERE name = ?').get(DEMO_NAME) as { id: number } | undefined;
  if (existing && !reset) {
    console.log(`"${DEMO_NAME}" already exists. Run with --reset to recreate it.`);
    return;
  }
  if (existing) {
    db.prepare('DELETE FROM companies WHERE id = ?').run(existing.id);
    db.prepare('DELETE FROM security_events WHERE company_id = ?').run(existing.id);
    db.prepare("DELETE FROM users WHERE username IN ('demo.manager')").run();
  }

  const now = nowIso();
  const pw = async (p: string) => hashPassword(p);

  if (!db.prepare("SELECT 1 FROM users WHERE role = 'developer'").get()) {
    insert(db, 'users', {
      role: 'developer',
      username: 'developer',
      password_hash: await pw('developer123'),
      full_name: 'App Owner',
      created_at: now,
      updated_at: now,
    });
    console.log('Developer: developer / developer123');
  }

  const companyId = insert(db, 'companies', {
    name: DEMO_NAME,
    timezone: TZ,
    settings: JSON.stringify({ selfieMode: 'always' }),
    notes: 'Demo data created by scripts/seed-demo.ts',
    created_at: now,
    updated_at: now,
  });

  const sites = [
    { name: 'Riverside Tower', lat: LAT, lng: LNG, radius: 150, address: 'Main building site' },
    { name: 'North Yard', lat: LAT + 0.018, lng: LNG - 0.012, radius: 200, address: 'Storage and workshop' },
    { name: 'Canal Street Houses', lat: LAT - 0.011, lng: LNG + 0.021, radius: 120, address: 'Renovation project' },
  ].map((s) => ({
    ...s,
    id: insert(db, 'sites', {
      company_id: companyId,
      name: s.name,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      radius_m: s.radius,
      networks: '[]',
      created_at: now,
      updated_at: now,
    }),
  }));

  const managerId = insert(db, 'users', {
    company_id: companyId,
    role: 'manager',
    username: 'demo.manager',
    password_hash: await pw('manager123'),
    full_name: 'Sarah Mitchell',
    phone: '+44 7700 900100',
    created_at: now,
    updated_at: now,
  });

  const names = [
    'Omar Haddad',
    'James Carter',
    'Lina Khoury',
    'Daniel Novak',
    'Priya Shah',
    'Marco Rossi',
    'Aisha Bello',
    'Tom Fletcher',
    'Yusuf Demir',
    'Elena Popescu',
  ];
  interface DemoWorker {
    id: number;
    name: string;
    deviceId: number | null;
    site: (typeof sites)[number];
  }
  const workers: DemoWorker[] = [];
  for (const [i, name] of names.entries()) {
    const username = name.split(' ')[0]!.toLowerCase();
    db.prepare('DELETE FROM users WHERE username = ?').run(username);
    const id = insert(db, 'users', {
      company_id: companyId,
      role: 'worker',
      username,
      password_hash: await pw('worker123'),
      full_name: name,
      phone: `+44 7700 9001${String(i + 10).padStart(2, '0')}`,
      employee_code: `W-${1001 + i}`,
      created_at: now,
      updated_at: now,
    });
    const withoutPhone = i === 6;
    const deviceId = withoutPhone ? null : insert(db, 'devices', {
      user_id: id,
      company_id: companyId,
      key_id: `demo-${randomToken(12)}`,
      public_key: '{}',
      status: 'active',
      label: i % 3 === 0 ? 'iPhone · Safari' : i % 3 === 1 ? 'SM-A546B · Chrome' : 'Pixel 8 · Chrome',
      user_agent: 'demo',
      created_at: addMinutes(now, -60 * 24 * 30),
      decided_at: addMinutes(now, -60 * 24 * 30),
      last_used_at: now,
    });
    workers.push({ id, name, deviceId, site: sites[i % sites.length]! });
  }

  const today = todayLocal(TZ);
  const point = (site: { lat: number; lng: number }) => ({
    lat: site.lat + jitter(0.0012),
    lng: site.lng + jitter(0.0016),
    acc: 6 + rand() * 18,
  });

  function punch(w: (typeof workers)[number], type: 'in' | 'out', at: string, extra: Record<string, unknown> = {}) {
    const p = point(w.site);
    return insert(db, 'punches', {
      company_id: companyId,
      worker_id: w.id,
      device_id: w.deviceId,
      type,
      result: 'accepted',
      at,
      site_id: w.site.id,
      lat: p.lat,
      lng: p.lng,
      accuracy: p.acc,
      distance_m: Math.round(rand() * 60),
      samples: '[]',
      client: '{}',
      ip: '203.0.113.10',
      flags: '[]',
      created_at: at,
      ...extra,
    });
  }

  function shift(w: (typeof workers)[number], date: string, start: string, end: string, note = '') {
    return insert(db, 'shifts', {
      company_id: companyId,
      site_id: w.site.id,
      worker_id: w.id,
      starts_at: zonedToUtc(date, start, TZ),
      ends_at: zonedToUtc(date, end, TZ),
      note,
      created_by: managerId,
      created_at: now,
      updated_at: now,
    });
  }

  function entry(w: (typeof workers)[number], shiftId: number | null, inAt: string, outAt: string | null, status = outAt ? 'closed' : 'open') {
    const inId = punch(w, 'in', inAt, { shift_id: shiftId });
    const outId = outAt ? punch(w, 'out', outAt, { shift_id: shiftId }) : null;
    const id = insert(db, 'time_entries', {
      company_id: companyId,
      worker_id: w.id,
      site_id: w.site.id,
      shift_id: shiftId,
      in_punch_id: inId,
      out_punch_id: outId,
      clock_in_at: inAt,
      clock_out_at: outAt,
      status,
      created_at: inAt,
      updated_at: outAt ?? inAt,
    });
    db.prepare('UPDATE punches SET entry_id = ? WHERE id IN (?, ?)').run(id, inId, outId);
    return { id, inId, outId };
  }

  // Past two weeks: regular day shifts with realistic arrival times.
  for (let d = -14; d <= -1; d++) {
    const date = addDays(today, d);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday === 0) continue;
    for (const [i, w] of workers.entries()) {
      if (weekday === 6 && i % 2 === 0) continue;
      const id = shift(w, date, '07:00', '15:30');
      if (rand() < 0.06) continue; // absent
      const late = rand() < 0.15 ? 6 + Math.round(rand() * 25) : -Math.round(rand() * 12);
      const start = zonedToUtc(date, '07:00', TZ);
      entry(w, id, addMinutes(start, late), addMinutes(zonedToUtc(date, '15:30', TZ), Math.round(jitter(30))));
    }
  }

  // Today: a mix of states for the live board, relative to the current time.
  const nowMs = Date.now();
  const at = (minutesFromNow: number) => new Date(Math.floor(nowMs / 60_000 + minutesFromNow) * 60_000).toISOString();
  // Shifts start on the quarter hour, like real schedules.
  const quarter = (minutesFromNow: number) =>
    new Date(Math.round((nowMs + minutesFromNow * 60_000) / 900_000) * 900_000).toISOString();
  const shiftAround = (w: (typeof workers)[number], startOffset: number, hours: number, note = '') =>
    insert(db, 'shifts', {
      company_id: companyId,
      site_id: w.site.id,
      worker_id: w.id,
      starts_at: quarter(startOffset),
      ends_at: quarter(startOffset + hours * 60),
      note,
      created_by: managerId,
      created_at: now,
      updated_at: now,
    });
  const who = (first: string) => workers.find((w) => w.name.startsWith(first))!;
  const [omar, james, lina, daniel, priya, marco, aisha, tom, yusuf, elena] = [
    'Omar', 'James', 'Lina', 'Daniel', 'Priya', 'Marco', 'Aisha', 'Tom', 'Yusuf', 'Elena',
  ].map(who) as Array<(typeof workers)[number]>;
  // Remove today's regular shifts for these people; they get the scenario shifts below.
  db.prepare('DELETE FROM shifts WHERE company_id = ? AND starts_at >= ?').run(companyId, zonedToUtc(today, '00:00', TZ));

  // On site, on time.
  entry(omar!, shiftAround(omar!, -180, 8), at(-184), null);
  entry(james!, shiftAround(james!, -180, 8), at(-176), null);
  entry(daniel!, shiftAround(daniel!, -120, 8, 'Bring the laser level'), at(-122), null);
  // On site but late.
  entry(lina!, shiftAround(lina!, -180, 8), at(-158), null);
  // Not arrived yet (late).
  shiftAround(priya!, -35, 8);
  shiftAround(marco!, -70, 6);
  // Upcoming.
  shiftAround(aisha!, 90, 6);
  shiftAround(yusuf!, 150, 5);
  // Checked out early.
  const tomShift = shiftAround(tom!, -420, 6);
  entry(tom!, tomShift, at(-424), at(-95));
  // Off-site check-in waiting for review.
  const elenaShift = shiftAround(elena!, -60, 8);
  const off = { lat: LAT + 0.031, lng: LNG - 0.02 };
  const reviewPunch = insert(db, 'punches', {
    company_id: companyId,
    worker_id: elena!.id,
    device_id: elena!.deviceId,
    type: 'in',
    result: 'review',
    reason: 'OFF_SITE_REQUEST',
    at: at(-55),
    site_id: elena!.site.id,
    shift_id: elenaShift,
    lat: off.lat,
    lng: off.lng,
    accuracy: 11,
    distance_m: 3600,
    samples: '[]',
    client: '{}',
    ip: '198.51.100.23',
    flags: JSON.stringify(['OFF_SITE_REQUEST']),
    note: 'Picking up tiles from the supplier for Canal Street',
    review_status: 'pending',
    created_at: at(-55),
  });
  const elenaEntry = insert(db, 'time_entries', {
    company_id: companyId,
    worker_id: elena!.id,
    site_id: elena!.site.id,
    shift_id: elenaShift,
    in_punch_id: reviewPunch,
    clock_in_at: at(-55),
    status: 'open',
    created_at: at(-55),
    updated_at: at(-55),
  });
  db.prepare('UPDATE punches SET entry_id = ? WHERE id = ?').run(elenaEntry, reviewPunch);

  // Yesterday: one forgotten check-out.
  const yShift = db.prepare('SELECT id, starts_at FROM shifts WHERE worker_id = ? AND starts_at >= ? ORDER BY starts_at DESC LIMIT 1').get(
    marco!.id,
    zonedToUtc(addDays(today, -1), '00:00', TZ),
  ) as { id: number; starts_at: string } | undefined;
  if (yShift) {
    db.prepare('DELETE FROM time_entries WHERE shift_id = ?').run(yShift.id);
    db.prepare('DELETE FROM punches WHERE shift_id = ?').run(yShift.id);
    entry(marco!, yShift.id, addMinutes(yShift.starts_at, -3), null, 'incomplete');
  }

  // A new phone waiting for approval and a blocked attempt with a fake-GPS pattern.
  insert(db, 'devices', {
    user_id: yusuf!.id,
    company_id: companyId,
    key_id: `demo-${randomToken(12)}`,
    public_key: '{}',
    status: 'pending',
    label: 'Redmi Note 13 · Chrome',
    user_agent: 'demo',
    request_note: 'My old phone broke',
    created_at: at(-30),
  });
  const suspicious = storeMsg(msg('Blocked a suspicious check-in by {name}.', { name: priya!.name }));
  insert(db, 'security_events', {
    at: at(-12),
    company_id: companyId,
    user_id: priya!.id,
    kind: 'suspicious_punch',
    severity: 'high',
    // Stored like the server does, so it shows in each reader's language.
    message: suspicious.english,
    message_i18n: suspicious.i18n,
    details: JSON.stringify({ flags: ['ACCURACY_ZERO', 'NO_JITTER', 'MATCHES_SITE_CENTER'], score: 115 }),
    ip: '198.51.100.77',
  });

  // Upcoming shifts for the rest of the week and next week.
  for (let d = 1; d <= 9; d++) {
    const date = addDays(today, d);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday === 0) continue;
    for (const [i, w] of workers.entries()) {
      if (weekday === 6 && i % 2 === 1) continue;
      shift(w, date, i % 4 === 3 ? '10:00' : '07:00', i % 4 === 3 ? '18:30' : '15:30', d === 1 && i === 0 ? 'Crane delivery at 8:00' : '');
    }
  }

  console.log(`\nDemo company "${DEMO_NAME}" is ready (${TZ}, sites near ${LAT}, ${LNG}).`);
  console.log('  Manager:  demo.manager / manager123');
  console.log(`  Workers:  ${names.map((n) => n.split(' ')[0]!.toLowerCase()).join(', ')} — password worker123`);
  console.log('  Tip: aisha has no phone yet — sign in as aisha on a real phone; the first phone is approved automatically.');
  console.log('       To check in for real, run with DEMO_LAT/DEMO_LNG/DEMO_TZ set to your own location.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
