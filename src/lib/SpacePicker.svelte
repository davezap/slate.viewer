<script lang="ts">
  // metatrash.com: Change Space. Lists the spaces the person can open (from the site's session
  // answer) and the web-readable spaces this browser visited, with a filter; picking one opens
  // it at /app/owner/slug/.
  import { onMount, tick } from 'svelte';
  import {
    forgetSpace, groupSpaces, pickerSession, spaceAddress, visitedSpaces,
    type PickerSession, type PickerSpace, type VisitedSpace,
  } from './siteSpaces';

  interface Props {
    /** The Change Space button's box: the picker opens under it. */
    anchor: DOMRect;
    /** The open space (owner/slug or public), ticked in the list. */
    current: string | null;
    onClose: () => void;
  }
  let { anchor, current, onClose }: Props = $props();

  let session = $state<PickerSession | null>(null);
  let failed = $state('');
  let visited = $state<VisitedSpace[]>(visitedSpaces());
  let filter = $state('');
  let active = $state(0);
  let box = $state<HTMLDivElement>();
  let input = $state<HTMLInputElement>();

  const groups = $derived(session ? groupSpaces(session, visited, filter, current) : null);
  const sections = $derived(groups ? ([
    ['Recent', groups.recent],
    ['Public', groups.public],
    ['Your spaces', groups.yours],
    ['Shared with you', groups.shared],
    ['Visited', groups.visited],
  ] as [string, PickerSpace[]][]).filter(([, list]) => list.length) : []);
  /** Every row in order, for the arrow keys. */
  const rows = $derived(sections.flatMap(([label, list]) => list.map(s => ({ label, s }))));

  // Under the button, kept on screen; a phone gets the full width.
  const style = $derived.by(() => {
    const width = Math.min(380, window.innerWidth - 16);
    const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
    return `top: ${Math.round(anchor.bottom + 6)}px; left: ${Math.round(left)}px; width: ${width}px;`;
  });

  onMount(() => {
    void pickerSession().then(s => (session = s), error => (failed = error instanceof Error ? error.message : String(error)));
    void tick().then(() => input?.focus());
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (box && target && !box.contains(target) && !target.closest('[data-space-picker]')) onClose();
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  });

  $effect(() => { void filter; active = 0; });

  function open(s: PickerSpace) {
    if (s.space === current) { onClose(); return; }
    location.href = spaceAddress(s.space);
  }

  function forget(event: MouseEvent, s: PickerSpace) {
    event.stopPropagation();
    forgetSpace(s.space);
    visited = visitedSpaces();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (!rows.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); active = (active + 1) % rows.length; scrollActive(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); active = (active - 1 + rows.length) % rows.length; scrollActive(); }
    else if (event.key === 'Enter') { event.preventDefault(); open(rows[active].s); }
  }

  function scrollActive() {
    void tick().then(() => box?.querySelector('.row.active')?.scrollIntoView({ block: 'nearest' }));
  }

  const indexOf = (label: string, s: PickerSpace) => rows.findIndex(r => r.label === label && r.s.space === s.space);
</script>

<div class="picker" bind:this={box} {style} role="dialog" aria-label="Change space" tabindex="-1" onkeydown={onKeydown}>
  <input
    bind:this={input}
    bind:value={filter}
    type="search"
    placeholder="Find a space"
    aria-label="Find a space"
    aria-controls="space-picker-list"
    autocomplete="off"
    spellcheck="false"
  />
  <div class="list" id="space-picker-list" role="listbox" aria-label="Spaces">
    {#if failed}
      <p class="note">Your spaces can't be listed just now: {failed}</p>
    {:else if !session}
      <p class="note">Loading your spaces…</p>
    {:else if !rows.length}
      <p class="note">{filter ? 'No space matches.' : 'No spaces yet.'}</p>
    {:else}
      {#each sections as [label, list] (label)}
        {#if label === 'Visited'}<hr />{/if}
        <div class="label">{label}</div>
        {#each list as s (label + s.space)}
          {@const i = indexOf(label, s)}
          <div
            class="row"
            class:active={i === active}
            class:current={s.space === current}
            role="option"
            tabindex="-1"
            aria-selected={i === active}
            onclick={() => open(s)}
            onkeydown={() => {}}
            onpointermove={() => (active = i)}
          >
            <span class="tick" aria-hidden="true">{s.space === current ? '✓' : ''}</span>
            <span class="what">
              <!-- A visited space's name may be unknown here: its slug stands in for it. -->
              <span class="name">{s.name === s.space && s.owner ? s.space.slice(s.owner.length + 1) : s.name}</span>
              {#if s.owner}<span class="address">{s.space}</span>{/if}
            </span>
            <span class="pills">
              {#if label !== 'Visited'}
                <span class="pill">{s.access === 'read_write' ? 'can edit' : 'read only'}</span>
              {/if}
              {#if s.web && s.owner}<span class="pill web" title="Anyone can read it on the website">public</span>{/if}
            </span>
            {#if label === 'Visited'}
              <button class="forget" title="Forget this space" aria-label="Forget {s.name}" onclick={event => forget(event, s)}>×</button>
            {:else if s.owned}
              <a class="gear" href="/account/mine" title="Sharing and settings (in your account for now)" aria-label="Settings for {s.name}" onclick={event => event.stopPropagation()}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3a1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
              </a>
            {/if}
          </div>
        {/each}
      {/each}
    {/if}
  </div>
  {#if session?.signedIn}
    <div class="foot">
      <a href="/account#new-space">New space</a>
      {#if session.waiting}
        <a href="/account" class="waiting">Invitations <span class="count">{session.waiting}</span></a>
      {/if}
      <a href="/account" class="all">All spaces in your account</a>
    </div>
  {/if}
</div>

<style>
  .picker {
    position: fixed; z-index: 4000; box-sizing: border-box; display: flex; flex-direction: column; max-height: min(520px, calc(100vh - 70px));
    padding: 8px; background: var(--side-input); color: var(--side-fg); outline: none;
    border: 1px solid var(--side-border); border-radius: 8px; box-shadow: 0 10px 30px rgb(0 0 0 / .2);
    font: 13px/1.4 Inter, "Segoe UI", system-ui, sans-serif;
  }
  input {
    flex: none; box-sizing: border-box; width: 100%; margin-bottom: 6px; padding: 6px 8px; font: inherit; color: inherit;
    background: var(--side-bg); border: 1px solid var(--side-border); border-radius: 6px; outline: none;
  }
  input:focus { border-color: var(--side-accent); }
  .list { flex: 1; min-height: 0; overflow: auto; }
  .label { padding: 8px 8px 3px; color: var(--side-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  hr { margin: 8px 4px 2px; border: 0; border-top: 1px solid var(--side-border); }
  .row { display: flex; align-items: center; gap: 6px; min-height: 34px; padding: 3px 6px; border-radius: 5px; cursor: pointer; }
  .row.active { background: var(--side-accent-soft); }
  .tick { flex: none; width: 14px; color: var(--side-accent); font-weight: 700; text-align: center; }
  .what { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name, .address { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row.current .name { font-weight: 600; }
  .address { color: var(--side-muted); font: 11.5px/1.3 Consolas, "Cascadia Mono", ui-monospace, monospace; }
  .pills { flex: none; display: flex; gap: 4px; }
  .pill { padding: 1px 7px; color: var(--side-muted); font-size: 11px; border: 1px solid var(--side-border); border-radius: 9px; white-space: nowrap; }
  .pill.web { color: var(--side-accent); border-color: var(--side-accent); }
  .gear, .forget {
    flex: none; display: grid; place-items: center; width: 26px; height: 26px; padding: 0; color: var(--side-muted);
    background: none; border: 0; border-radius: 5px; font: inherit; font-size: 16px; text-decoration: none; cursor: pointer;
  }
  .gear:hover, .forget:hover { background: var(--side-hover); color: var(--side-fg); }
  .gear svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .note { margin: 10px 8px; color: var(--side-muted); }
  .foot {
    flex: none; display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; padding: 8px 8px 2px; border-top: 1px solid var(--side-border); font-size: 12px;
  }
  .foot a { color: var(--side-accent); text-decoration: none; }
  .foot a:hover { text-decoration: underline; }
  .foot .all { margin-left: auto; color: var(--side-muted); }
  .count { display: inline-block; min-width: 16px; padding: 0 4px; margin-left: 2px; color: #fff; background: var(--side-accent); border-radius: 8px; font-size: 11px; text-align: center; }
</style>
