// Which sources the pipeline may import, and under which licence (docs/05 §2).
// A domain that is not listed here is refused. Licences read from the source itself win over the
// table when the adapter can read them (OpenStax, eLife, PLOS, Wikipedia).
import type { License } from '../../lib/content/types';

export type Group = 1 | 2 | 3;
export interface SourceRule {
  adapter: 'openstax' | 'wikipedia' | 'elife' | 'plos' | 'readability' | 'gutenberg' | 'conversation';
  group: Group;
  license?: License; // fixed licence for the whole domain
  publisher: string;
  note?: string;
}

export const SOURCES: Record<string, SourceRule> = {
  'openstax.org': { adapter: 'openstax', group: 1, publisher: 'OpenStax', note: 'Licence read per book; most books are CC BY-NC-SA 4.0 and are refused.' },
  'en.wikipedia.org': { adapter: 'wikipedia', group: 2, license: 'CC-BY-SA-4.0', publisher: 'Wikipedia' },
  'simple.wikipedia.org': { adapter: 'wikipedia', group: 2, license: 'CC-BY-SA-4.0', publisher: 'Simple English Wikipedia' },
  'vi.wikipedia.org': { adapter: 'wikipedia', group: 2, license: 'CC-BY-SA-4.0', publisher: 'Wikipedia tiếng Việt' },
  'elifesciences.org': { adapter: 'elife', group: 1, publisher: 'eLife' },
  'journals.plos.org': { adapter: 'plos', group: 1, publisher: 'PLOS' },
  'ourworldindata.org': { adapter: 'readability', group: 1, license: 'CC-BY-4.0', publisher: 'Our World in Data' },
  'kids.frontiersin.org': { adapter: 'readability', group: 1, license: 'CC-BY-4.0', publisher: 'Frontiers for Young Minds' },
  'science.nasa.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'NASA' },
  'www.nasa.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'NASA' },
  'spaceplace.nasa.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'NASA Space Place' },
  'oceanservice.noaa.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'NOAA' },
  'www.noaa.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'NOAA' },
  'www.usgs.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'U.S. Geological Survey' },
  'www.nps.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'National Park Service' },
  'www.nimh.nih.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'National Institute of Mental Health' },
  'www.nhlbi.nih.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'National Heart, Lung, and Blood Institute' },
  'www.nia.nih.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'National Institute on Aging' },
  'newsinhealth.nih.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'NIH News in Health' },
  'www.cdc.gov': { adapter: 'readability', group: 1, license: 'PD', publisher: 'CDC' },
  'globalvoices.org': { adapter: 'readability', group: 1, license: 'CC-BY-3.0', publisher: 'Global Voices' },
  'learningenglish.voanews.com': {
    adapter: 'readability',
    group: 1,
    license: 'PD',
    publisher: 'VOA Learning English',
    note: 'Text only; AP/Reuters photos are not public domain. Check the current terms before importing.',
  },
  'www.gutenberg.org': { adapter: 'gutenberg', group: 1, license: 'PD', publisher: 'Project Gutenberg' },
  'standardebooks.org': { adapter: 'readability', group: 1, license: 'PD', publisher: 'Standard Ebooks' },
  'theconversation.com': { adapter: 'conversation', group: 3, license: 'CC-BY-ND-4.0', publisher: 'The Conversation' },
};

export function ruleFor(url: string): SourceRule | null {
  const host = new URL(url).hostname.toLowerCase();
  return SOURCES[host] ?? SOURCES[host.replace(/^www\./, '')] ?? null;
}

/** Map a licence name or URL found in a source to our identifiers. Unknown or NC licences return null. */
export function normalizeLicense(text: string | undefined | null): License | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  if (/-nc|noncommercial|non-commercial/.test(t)) return null;
  if (/publicdomain|public domain|cc0|zero\/1\.0/.test(t)) return 'PD';
  if (/by-sa|sharealike|share-alike/.test(t)) return /4\.0/.test(t) || !/\d\.\d/.test(t) ? 'CC-BY-SA-4.0' : null;
  if (/by-nd|noderiv/.test(t)) return 'CC-BY-ND-4.0';
  if (/licenses\/by\/4\.0|cc by 4\.0|attribution 4\.0/.test(t)) return 'CC-BY-4.0';
  if (/licenses\/by\/3\.0|cc by 3\.0|attribution 3\.0/.test(t)) return 'CC-BY-3.0';
  if (/creative ?commons attribution|cc[- ]by\b/.test(t)) return 'CC-BY-4.0';
  return null;
}
