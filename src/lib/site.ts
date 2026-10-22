export const SITE_URL = 'https://prooftopartner.com';
export const SITE_NAME = 'Proof to Partner';
export const SITE_DESCRIPTION = 'Evidence-first business introductions, starting with a clearly defined commercial requirement.';
export type Breadcrumb = { name: string; path: string };
export const primaryNavigation = [
  { label: 'How it works', href: '/how-it-works/' },
  { label: 'For buyers', href: '/for-buyers/' },
  { label: 'For suppliers', href: '/for-suppliers/' },
  { label: 'About', href: '/about/' },
] as const;