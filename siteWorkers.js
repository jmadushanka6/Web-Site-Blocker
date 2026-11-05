// siteWorkers.js
// Single Responsibility: take away the service workers of blocked sites.
//
// Many sites install a service worker of their own (news sites often do,
// through plugins like SuperPWA, for push alerts or offline reading). Once a
// site has one, the worker can answer visits to that site itself, often
// from its cache. Those visits never reach the network, so the
// declarativeNetRequest rules in rules.js never see them and the site keeps
// opening even though it's blocked. Removing the worker sends the next
// visit back through the network, where the block applies. And because a
// blocked page never loads, the site can't install its worker again until
// the block is removed.
//
// Only the worker goes. The site's cookies, sign-ins and saved data are left
// alone. Removing it does end any push alerts the site was sending, until
// the site is unblocked and signs the user up again.
//
// chrome.browsingData can't match a site and all its subdomains at once, so
// each block clears the site's usual addresses (with and without "www.",
// over https and http) plus the address of any tab open on the site.

// The origins whose service workers to remove for `domain`: its usual
// addresses, plus the origins of `urls` (open tabs) that are on the site or
// one of its subdomains. Pure, so it can be unit-tested.
export function workerOriginsFor(domain, urls = []) {
  const origins = new Set();
  for (const host of [domain, "www." + domain]) {
    origins.add("https://" + host);
    origins.add("http://" + host);
  }
  for (const url of urls) {
    let u;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (u.hostname === domain || u.hostname.endsWith("." + domain)) origins.add(u.origin);
  }
  return [...origins];
}

// Removes the service workers of every site in `domains`. `urls` are the
// addresses of tabs open on those sites (see workerOriginsFor).
export async function clearSiteWorkers(domains, urls = []) {
  const origins = [...new Set(domains.flatMap((d) => workerOriginsFor(d, urls)))];
  if (origins.length === 0) return;
  await chrome.browsingData.remove({ origins }, { serviceWorkers: true });
}
