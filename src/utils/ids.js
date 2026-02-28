import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export const newId = (prefix) => `${prefix}_${uuidv4().replace(/-/g, '')}`;

export const newKeyId = () => newId('key');
export const newDocId = () => newId('doc');
export const newChunkId = () => newId('chk');
export const newSessionId = () => newId('ses');
export const newMessageId = () => newId('msg');
export const newJobId = () => newId('job');
export const newAdminId = () => newId('adm');

export const generateApiKey = () => {
  const hex = crypto.randomBytes(24).toString('hex');
  return `pk_live_${hex}`;
};
