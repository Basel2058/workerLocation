import { auth } from './auth';
import { common } from './common';
import { dev } from './dev';
import { flags, rejectReasons } from './flags';
import { format } from './format';
import { manager } from './manager';
import { ui } from './ui';
import { worker } from './worker';

/** The English catalog: the source of every key, and the fallback for missing translations. */
const en = { common, ui, auth, format, flags, rejectReasons, worker, manager, dev };
export default en;
export type Messages = typeof en;
