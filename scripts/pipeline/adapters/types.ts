import type { License, Reference } from '../../../lib/content/types';

export interface ImportedSection {
  heading?: string;
  /** Paragraphs in Reader markup (**bold**, *italic*); markup characters from the source are escaped. */
  paragraphs: string[];
}

export interface Imported {
  url: string;
  title: string;
  authors: string[];
  publisher: string;
  year?: number;
  license: License;
  licenseUrl?: string;
  group: 1 | 2 | 3;
  sections: ImportedSection[];
  references?: Reference[];
  /** Page that states the licence/terms at import time (kept as evidence). */
  termsUrl?: string;
}

export interface AdapterContext {
  url: string;
  publisher: string;
  group: 1 | 2 | 3;
  /** Licence fixed by the domain table, when the source itself does not state one. */
  license?: License;
}
