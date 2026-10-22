// Why a check-in was flagged (managers and the owner only; workers never see these) and why it was refused.
export const flags = {
  OFF_SITE_REQUEST: {
    label: 'Off-site request',
    description: 'The worker was outside the workplace and asked you to accept this anyway.',
  },
  DIFFERENT_SITE: { label: 'Different site', description: 'Checked in at another workplace than the one on the schedule.' },
  UNSCHEDULED: { label: 'No shift', description: 'There was no scheduled shift at this time.' },
  NETWORK_MATCH: { label: 'Workplace internet', description: 'The phone was connected to the workplace internet.' },
  NETWORK_MISMATCH: { label: 'Other internet', description: 'The phone was not on the workplace internet connection.' },
  ACCURACY_ZERO: {
    label: 'Fake GPS suspected',
    description: 'The phone reported a GPS accuracy that real GPS never reports. Typical of fake-location apps.',
  },
  ACCURACY_TOO_PERFECT: { label: 'Unreal GPS precision', description: 'The GPS precision was better than real phones achieve.' },
  NO_JITTER: { label: 'Frozen location', description: 'Several GPS readings were exactly identical. Real GPS always moves a little.' },
  ROUND_COORDINATES: { label: 'Typed coordinates', description: 'The location has too few decimals, as if it was typed in by hand.' },
  MATCHES_SITE_CENTER: {
    label: 'Exact site pin',
    description: 'The location is exactly the workplace pin. Real GPS never lands on it so precisely.',
  },
  DUPLICATE_POSITION: { label: 'Same spot as a coworker', description: "Exactly the same coordinates as another worker's check-in today." },
  REPEATED_POSITION: { label: 'Same spot as before', description: 'Exactly the same coordinates as one of this worker’s earlier check-ins.' },
  POSITION_JUMP: { label: 'Jumping location', description: 'The GPS readings jumped around in a way a real phone does not.' },
  IMPOSSIBLE_TRAVEL: { label: 'Impossible travel', description: 'The phone moved too far, too fast since its previous location.' },
  MOVING_FAST: { label: 'In a vehicle', description: 'The phone was moving fast during the check.' },
  API_TAMPERED: { label: 'Tampered browser', description: 'The location feature of the browser was replaced by an extension or script.' },
  AUTOMATION: { label: 'Automated browser', description: 'The browser is being controlled by automation software.' },
  EMULATED_DEVICE: { label: 'Fake phone', description: 'A computer pretending to be a phone.' },
  DESKTOP_DEVICE: { label: 'Computer, not a phone', description: 'The punch came from a computer instead of a phone.' },
  CLOCK_SKEW: { label: 'Phone clock changed', description: 'The phone clock was more than 5 minutes off. The server time was used.' },
  SELFIE_DUPLICATE: { label: 'Reused photo', description: 'The photo is byte-for-byte identical to an earlier one.' },
  NEW_DEVICE: { label: 'New phone', description: 'First punch from a newly approved phone.' },
  RAPID_RETRIES: { label: 'Many failed tries', description: 'Several rejected attempts right before this one.' },
  STALE_LOCATION: { label: 'Old location', description: 'The phone sent a location that was not fresh.' },
};

export const rejectReasons = {
  OUTSIDE_GEOFENCE: 'Outside the workplace',
  LOW_ACCURACY: 'GPS not precise enough',
  STALE_LOCATION: 'Old location',
  NO_LOCATION: 'No location',
  NETWORK_REQUIRED: 'Not on workplace internet',
  NO_SHIFT: 'No shift right now',
  NO_SITES: 'No workplace set up',
  HIGH_RISK: 'Blocked as suspicious',
  TOO_SOON: 'Too soon after previous punch',
  rejected: 'Rejected',
};
