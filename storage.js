// storage.js
// Single Responsibility: read/write the blocklist in chrome.storage.local.
// This module knows nothing about locking rules or DNR enforcement — it
// just persists whatever list it's given, migrating older entries on read.
import { migrateEntry } from "./lockModel.js";

export async function getBlocklist() {
  const { blocklist } = await chrome.storage.local.get("blocklist");
  const list = Array.isArray(blocklist) ? blocklist : [];
  return list.map(migrateEntry);
}

export async function setBlocklist(list) {
  await chrome.storage.local.set({ blocklist: list });
}
