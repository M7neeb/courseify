<script lang="ts" module>
  // One voice at a time across the page: the id of the text being read, or null.
  let speaking = $state<{ id: number | null }>({ id: null });
  let nextId = 0;

  export function canReadAloud(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  }
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import { speechChunks, speechLang, speechText } from '../core/speech.ts';
  import { t } from '../i18n/i18n.ts';

  let { markdown, lang }: { markdown: string; lang: string } = $props();

  const id = nextId++;
  const active = $derived(speaking.id === id);

  function stop() {
    if (speaking.id === id) speaking.id = null;
    window.speechSynthesis.cancel();
  }

  function voiceFor(code: string): SpeechSynthesisVoice | undefined {
    const voices = window.speechSynthesis.getVoices();
    const base = code.slice(0, 2);
    return voices.find((v) => v.lang === code && v.localService) ?? voices.find((v) => v.lang === code) ?? voices.find((v) => v.lang.startsWith(base));
  }

  function start() {
    const synth = window.speechSynthesis;
    synth.cancel();
    const chunks = speechChunks(speechText(markdown));
    if (chunks.length === 0) return;
    const code = speechLang(lang);
    const voice = voiceFor(code);
    speaking.id = id;
    chunks.forEach((chunk, i) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = code;
      if (voice) utterance.voice = voice;
      if (i === chunks.length - 1) {
        utterance.onend = () => {
          if (speaking.id === id) speaking.id = null;
        };
      }
      // Cancelled by Stop, by another text starting, or by the page closing.
      utterance.onerror = () => {
        if (speaking.id === id) speaking.id = null;
      };
      synth.speak(utterance);
    });
  }

  // Leaving the lesson must not leave the voice talking.
  onDestroy(() => {
    if (speaking.id === id) stop();
  });
</script>

<button type="button" class="cf-btn cf-btn-ghost cf-btn-small cf-btn-icon" aria-pressed={active} onclick={() => (active ? stop() : start())}>
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    {#if active}
      <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
    {:else}
      <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z" fill="currentColor" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    {/if}
  </svg>
  {active ? t('text.stopReading') : t('text.readAloud')}
</button>
