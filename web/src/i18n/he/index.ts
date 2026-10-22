import type { Translation } from '../../../../shared/i18n';
import type { Messages } from '../en';
import { auth } from './auth';
import { common } from './common';
import { dev } from './dev';
import { flags, rejectReasons } from './flags';
import { format } from './format';
import { manager } from './manager';
import { ui } from './ui';
import { worker } from './worker';

const he: Translation<Messages> = { common, ui, auth, format, flags, rejectReasons, worker, manager, dev };
export default he;
