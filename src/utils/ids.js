import { v4 as uuidv4 } from 'uuid';

export const newId = (prefix) => `${prefix}_${uuidv4().replace(/-/g, '')}`;

export const newKeyId = () => newId('key');
export const newDocId = () => newId('doc');
export const newChunkId = () => newId('chk');
export const newSessionId = () => newId('ses');
export const newMessageId = () => newId('msg');
export const newJobId = () => newId('job');
export const newAdminId = () => newId('adm');

export const generateApiKey = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pk_live_${hex}`;
};
