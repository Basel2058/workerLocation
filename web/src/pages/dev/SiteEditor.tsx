import { useQueryClient } from '@tanstack/react-query';
import { LocateFixed, Search, Trash2, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Site } from '../../../../shared/types';
import { Dialog, useConfirm } from '../../components/Dialog';
import { SitePicker } from '../../components/maps';
import { useToast } from '../../components/Toast';
import { Button, Field, Input, Switch, Textarea } from '../../components/ui';
import { del, errorMessage, get, patch, post } from '../../lib/api';

interface Draft {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  networks: string;
  requireNetwork: boolean;
  active: boolean;
}

const empty: Draft = { name: '', address: '', lat: null, lng: null, radiusM: 150, networks: '', requireNetwork: false, active: true };

/** Create or edit a workplace: the pin and circle on the map are where check-ins are allowed. */
export function SiteEditor({
  open,
  companyId,
  site,
  others,
  onClose,
}: {
  open: boolean;
  companyId: number;
  site: Site | null;
  others: Site[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Draft>(empty);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResults([]);
    setQuery('');
    setD(
      site
        ? {
            name: site.name,
            address: site.address,
            lat: site.lat,
            lng: site.lng,
            radiusM: site.radiusM,
            networks: site.networks.join('\n'),
            requireNetwork: site.requireNetwork,
            active: site.active,
          }
        : empty,
    );
  }, [open, site]);

  const set = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));

  const search = async () => {
    setError(null);
    try {
      const res = await get<Array<{ name: string; lat: number; lng: number }>>(`/api/dev/geocode?q=${encodeURIComponent(query)}`);
      setResults(res);
      if (res.length === 0) setError('No places found. Try another search or tap the map.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError('Location is not available in this browser.');
    navigator.geolocation.getCurrentPosition(
      (p) => set({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError('Could not get your location. Allow location for this site and try again.'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const addMyIp = async () => {
    try {
      const { ip } = await get<{ ip: string }>('/api/dev/my-ip');
      const list = d.networks.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!list.includes(ip)) set({ networks: [...list, ip].join('\n') });
      toast.info(`Added ${ip}. Only do this while connected to the workplace Wi-Fi.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const save = async () => {
    if (d.lat === null || d.lng === null) return;
    setBusy(true);
    setError(null);
    const body = {
      name: d.name.trim(),
      address: d.address.trim(),
      lat: d.lat,
      lng: d.lng,
      radiusM: d.radiusM,
      networks: d.networks.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      requireNetwork: d.requireNetwork,
      active: d.active,
    };
    try {
      if (site) await patch(`/api/dev/sites/${site.id}`, body);
      else await post('/api/dev/sites', { ...body, companyId });
      toast.success(site ? 'Workplace saved' : 'Workplace added');
      await qc.invalidateQueries({ queryKey: ['dev'] });
      await qc.invalidateQueries({ queryKey: ['m'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!site) return;
    if (!(await confirm({ title: `Delete ${site.name}?`, body: 'Only possible when nobody ever checked in there. Otherwise turn it off.', confirmText: 'Delete', variant: 'danger' }))) return;
    try {
      await del(`/api/dev/sites/${site.id}`);
      toast.success('Workplace deleted');
      await qc.invalidateQueries({ queryKey: ['dev'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const valid = d.name.trim().length > 0 && d.lat !== null && d.lng !== null && d.radiusM >= 20;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={site ? `Edit ${site.name}` : 'Add a workplace'}
      description="Workers can only check in inside the circle."
      footer={
        <>
          {site && (
            <Button variant="dangerSoft" icon={Trash2} className="mr-auto" onClick={() => void remove()}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" loading={busy} disabled={!valid} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <Input
                className="pl-9"
                placeholder="Search an address"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && query.trim().length >= 3 && void search()}
              />
            </div>
            <Button onClick={() => void search()} disabled={query.trim().length < 3}>
              Search
            </Button>
            <Button icon={LocateFixed} onClick={useMyLocation} title="Use where I am now">
              <span className="hidden sm:inline">I’m here</span>
            </Button>
          </div>
          {results.length > 0 && (
            <div className="max-h-40 divide-y divide-line overflow-y-auto rounded-xl ring-1 ring-line">
              {results.map((r) => (
                <button
                  key={`${r.lat},${r.lng}`}
                  onClick={() => {
                    set({ lat: r.lat, lng: r.lng, address: d.address || r.name.slice(0, 300) });
                    setResults([]);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
          <SitePicker
            value={d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng, radiusM: d.radiusM } : null}
            onChange={(p) => set(p)}
            others={others.filter((o) => o.id !== site?.id)}
            className="h-[340px] lg:h-[460px]"
          />
          <p className="text-xs text-muted">
            Tap the map to place the workplace, or drag the pin.
            {d.lat !== null && d.lng !== null && (
              <span className="tabular ml-1">
                ({d.lat.toFixed(6)}, {d.lng.toFixed(6)})
              </span>
            )}
          </p>
        </div>
        <div className="space-y-4">
          <Field label="Name">
            <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Main warehouse" />
          </Field>
          <Field label="Address" optional>
            <Input value={d.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label={`Allowed area: ${d.radiusM} m around the pin`} hint="100–200 m works for most places. Bigger is easier for workers but easier to cheat.">
            <input
              type="range"
              min={20}
              max={1000}
              step={10}
              value={Math.min(1000, d.radiusM)}
              onChange={(e) => set({ radiusM: Number(e.target.value) })}
              className="w-full accent-[var(--color-brand)]"
            />
          </Field>
          <Field
            label="Workplace internet (optional)"
            hint="Public IP addresses of the workplace Wi-Fi, one per line. Check-ins from them are trusted more, even with weak GPS indoors."
          >
            <Textarea rows={3} value={d.networks} onChange={(e) => set({ networks: e.target.value })} placeholder="203.0.113.10" className="font-mono text-sm" />
          </Field>
          <Button size="sm" variant="ghost" icon={Wifi} className="-mt-2" onClick={() => void addMyIp()}>
            Add my current address
          </Button>
          <Switch
            checked={d.requireNetwork}
            onChange={(v) => set({ requireNetwork: v })}
            label="Require workplace internet"
            description="Only accept check-ins from the addresses above."
            disabled={!d.networks.trim()}
          />
          <Switch checked={d.active} onChange={(v) => set({ active: v })} label="Active" description="Turned-off workplaces keep their history." />
          {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        </div>
      </div>
    </Dialog>
  );
}
