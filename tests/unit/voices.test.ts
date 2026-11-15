import { afterEach, describe, expect, it, vi } from 'vitest';
import { voicesFor } from '@/stores/audio';

const voice = (name: string, voiceURI: string, lang = 'en-US', localService = true) => ({ name, voiceURI, lang, localService, default: false }) as SpeechSynthesisVoice;

describe('reading voices', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('offers real voices only, best recordings first', () => {
    vi.stubGlobal('window', { speechSynthesis: {} });
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [
        voice('Bad News', 'com.apple.speech.synthesis.voice.BadNews'),
        voice('Zarvox', 'com.apple.speech.synthesis.voice.Zarvox'),
        voice('Grandpa', 'com.apple.eloquence.en-US.Grandpa'),
        voice('Daniel', 'com.apple.voice.super-compact.en-GB.Daniel', 'en-GB'),
        voice('Samantha', 'com.apple.voice.compact.en-US.Samantha'),
        voice('Ava (Premium)', 'com.apple.voice.premium.en-US.Ava'),
        voice('Thomas', 'com.apple.voice.compact.fr-FR.Thomas', 'fr-FR'),
      ],
    });
    expect(voicesFor('en').map((v) => v.name)).toEqual(['Ava (Premium)', 'Samantha', 'Daniel']);
    expect(voicesFor('fr').map((v) => v.name)).toEqual(['Thomas']);
  });
});
