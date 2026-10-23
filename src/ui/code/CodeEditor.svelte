<script lang="ts">
  // A small code editor: a monospace text area where Tab indents, Shift+Tab takes the indent back
  // and Enter keeps the indentation of the line above (one more level after a ":" or "{").
  let {
    value = $bindable(''),
    label,
    readonly = false,
    rows
  }: { value?: string; label: string; readonly?: boolean; rows?: number } = $props();

  const INDENT = '    ';
  const lineCount = $derived(Math.max(4, Math.min(24, (rows ?? value.split('\n').length + 1))));

  function edit(area: HTMLTextAreaElement, start: number, end: number, insert: string, caret: number) {
    area.setRangeText(insert, start, end, 'end');
    area.selectionStart = area.selectionEnd = caret;
    value = area.value;
  }

  function onkeydown(event: KeyboardEvent) {
    if (readonly) return;
    const area = event.currentTarget as HTMLTextAreaElement;
    const { selectionStart: start, selectionEnd: end, value: text } = area;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (event.shiftKey) {
        const line = text.slice(lineStart);
        const remove = line.startsWith(INDENT) ? INDENT.length : (/^ +/.exec(line)?.[0].length ?? 0);
        if (remove > 0) edit(area, lineStart, lineStart + remove, '', Math.max(lineStart, start - remove));
      } else {
        edit(area, start, end, INDENT, start + INDENT.length);
      }
    } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const line = text.slice(lineStart, start);
      const indent = /^\s*/.exec(line)?.[0] ?? '';
      const more = /[:{[(]\s*$/.test(line) ? INDENT : '';
      const insert = '\n' + indent + more;
      edit(area, start, end, insert, start + insert.length);
    }
  }
</script>

<textarea
  class="code-editor"
  aria-label={label}
  bind:value
  {readonly}
  rows={lineCount}
  spellcheck="false"
  autocomplete="off"
  autocapitalize="off"
  wrap="off"
  {onkeydown}
></textarea>
