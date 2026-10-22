import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Bluetooth, Check, ChevronDown, Copy, Download, Headphones, LoaderCircle, Plus, Redo2, RotateCcw, SlidersHorizontal, Trash2, Undo2, Unplug, X } from 'lucide-react';
import { copyBands, exportApo, exportPreset, FILTER_NAMES, flatBands, formatFrequency, isFilterType, parsePreset, sameBands, validateBands, validatePreamp } from './eq';
import type { Band, EqSettings, Preset } from './eq';
import { Graph } from './Graph';
import { LiveEqWriter } from './liveEq';
import { COMPARISON_KEY, activeComparison, makeComparison, readComparison } from './comparison';
import { HARDWARE_BACKUP_KEY, hardwareTarget, readHardwareBackup } from './hardware';
import { parseEq, parseEqEnabled } from './protocol';
import type { QScale } from './protocol';
import { bluetoothSupport, BridgeRequestError, connectBrowser, DemoTransport, errorMessage, LinuxBridge } from './transport';
import type { BridgeDevice, LiveConnection, LogEntry, Transport } from './transport';
import { DRAFT_KEY, LIBRARY_KEY, MAX_BACKUP_SIZE, exportLibrary, mergeLibrary, parseLibrary, readDraft, readLibrary } from './storage';
import { PwaControl } from './PwaControl';
import { APP_VERSION } from './build';
import { DraculaMark, DraculaPortrait, ListeningChamber, ThemeControl, ThemeWords } from './ThemeControl';
const WEB_URL = 'https://massiveadam.github.io/fiiofixer/';
const REPO_URL = 'https://github.com/massiveadam/fiiofixer';
const localHelper = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

type Dialog = 'connect' | 'import' | 'export' | 'save' | 'help' | 'library' | null;
type Connection = { kind: 'offline' } | { kind: 'connected'; transport: Transport };
type Activity = 'idle' | 'connecting' | 'scanning' | 'reading' | 'applying';
interface Snapshot { bands: Band[]; preampDb: number | null; at: string; raw: Uint8Array | null }
function download(filename: string, content: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function App() {
  const [library] = useState(() => readLibrary(localStorage));
  const [presets, setPresets] = useState(library.presets);
  const [removedPreset, setRemovedPreset] = useState<Preset | null>(null);
  const [initialDraft] = useState(() => readDraft(localStorage));
  const [bands, setBands] = useState(initialDraft.draft.bands);
  const [preampDb, setPreampDb] = useState(initialDraft.draft.preampDb);
  const [selected, setSelected] = useState(initialDraft.draft.selected);
  const [profileName, setProfileName] = useState(initialDraft.draft.name);
  const [connection, setConnection] = useState<Connection>({ kind: 'offline' });
  const [activity, setActivity] = useState<Activity>('idle');
  const [snapshot, setSnapshotState] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const [comparison, setComparison] = useState(() => readComparison(localStorage));
  const [playbackMode, setPlaybackMode] = useState<'eq' | 'flat' | null>(null);
  const [eqEnabled, setEqEnabled] = useState<boolean | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState(library.error ?? initialDraft.error ?? (initialDraft.restored ? 'Draft restored.' : ''));
  const [error, setError] = useState<string | null>(library.error ?? initialDraft.error);
  const [past, setPast] = useState<EqSettings[]>([]);
  const [future, setFuture] = useState<EqSettings[]>([]);
  const [presetName, setPresetName] = useState('');
  const [importText, setImportText] = useState('');
  const [importName, setImportName] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [qScale, setQScale] = useState<QScale>(100);
  const [method, setMethod] = useState<'linux' | 'browser'>(() => localHelper && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent) ? 'linux' : 'browser');
  const [devices, setDevices] = useState<BridgeDevice[]>([]);
  const [hardwareBackup, setHardwareBackup] = useState(() => readHardwareBackup(localStorage));
  const [demoVerified, setDemoVerified] = useState(false);
  const [liveState, setLiveState] = useState<'off' | 'on' | 'stopping'>('off');
  const [livePending, setLivePending] = useState(false);
  const liveWriter = useRef<LiveEqWriter | null>(null);
  const liveConnection = useRef<LiveConnection | null>(null);
  const session = useRef<Transport | null>(null);
  const bridge = useRef(new LinuxBridge());
  const busyRef = useRef(false);
  const bandsRef = useRef(bands);
  bandsRef.current = bands;
  const preampRef = useRef(preampDb);
  preampRef.current = preampDb;
  const draftTouched = useRef(initialDraft.restored);
  const [savedDraft, setSavedDraft] = useState(JSON.stringify(initialDraft.draft));
  const draftText = JSON.stringify({ name: profileName, bands, preampDb, selected });
  useEffect(() => {
    if (draftText === savedDraft) return;
    try { localStorage.setItem(DRAFT_KEY, draftText); setSavedDraft(draftText); }
    catch { setError('Draft could not be saved. Export it before closing this app.'); }
  }, [draftText, savedDraft]);
  const modalRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const busy = activity !== 'idle';
  const isDemo = connection.kind === 'connected' && connection.transport.kind === 'demo';
  const changed = snapshot ? !sameBands(bands, snapshot.bands) || preampDb !== (snapshot.preampDb ?? 0) : draftTouched.current;
  const current = bands[selected];
  function setSnapshot(next: Snapshot | null): void { snapshotRef.current = next; setSnapshotState(next); }
  function clearComparison(): void {
    setComparison(null);
    try { localStorage.removeItem(COMPARISON_KEY); } catch { /* A stale record is ignored unless its exact flat frame is on the same device. */ }
  }
  const log = (entry: LogEntry): void => setLogs(previous => [...previous.slice(-199), entry]);
  useEffect(() => {
    const leave = (): void => { void liveWriter.current?.stop(); session.current?.disconnect(); };
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('pagehide', leave); leave(); };
  }, []);
  useEffect(() => {
    if (dialog) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modalRef.current?.showModal();
      modalRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input,textarea')?.focus();
    }
    else { modalRef.current?.close(); opener.current?.focus(); }
  }, [dialog]);

  function checkpoint(): void { setPast(previous => [...previous.slice(-49), { bands: copyBands(bandsRef.current), preampDb: preampRef.current }]); setFuture([]); }
  function edit(index: number, patch: Partial<Band>): void {
    setBands(previous => previous.map((band, i) => i === index ? { ...band, ...patch } : band));
    draftTouched.current = true; setDemoVerified(false);
  }
  function replaceDraft(next: Band[], name: string, preamp = 0): void {
    checkpoint(); setBands(copyBands(next)); setPreampDb(preamp); setProfileName(name); draftTouched.current = true; setDemoVerified(false);
  }
  function disconnect(): void {
    const transport = session.current;
    if (!liveWriter.current && !liveConnection.current) { transport?.disconnect(); return; }
    void run('applying', async () => { try { await stopLive(); } finally { transport?.disconnect(); } });
  }
  function lostConnection(): void {
    setEqEnabled(null);
    setPlaybackMode(null);
    void liveWriter.current?.stop(); liveWriter.current = null; liveConnection.current = null;
    setLiveState('off'); setLivePending(false);
    session.current = null; setConnection({ kind: 'offline' }); setSnapshot(null); setDemoVerified(false);
    setNotice('Disconnected. Draft kept.');
  }
  async function run(activity: Activity, action: () => Promise<void>): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true; setActivity(activity); setError(null);
    try { await action(); }
    catch (e) { const message = errorMessage(e); setError(message); setNotice(message); }
    finally { busyRef.current = false; setActivity('idle'); }
  }
  async function readDevice(transport: Transport, initial = false): Promise<void> {
    const raw = transport.kind === 'demo' ? null : await transport.request([0x03, 0x0d], [1, 0, 9]);
    const next = transport.kind === 'demo' ? await transport.read() : { bands: parseEq(raw ?? new Uint8Array(), qScale), preampDb: null };
    const enabled = transport.kind === 'demo' ? null : parseEqEnabled(await transport.request([3, 1], [1]));
    if (session.current !== transport) return;
    setEqEnabled(enabled);
    const comparing = transport.kind === 'linux' && raw ? activeComparison(comparison,transport.deviceId,raw) : null;
    setPlaybackMode(raw ? comparing ? 'flat' : 'eq' : null);
    setSnapshot({ ...next, at: new Date().toISOString(), raw });
    if (initial && comparing) {
      // Reading our temporary Flat curve must not replace a saved/edited EQ.
      if (!initialDraft.restored && !draftTouched.current) {
        setBands(parseEq(comparing.eq,qScale)); setProfileName('Headphone EQ');
      }
    } else if (initial) {
      if (!sameBands(bandsRef.current, next.bands) || preampRef.current !== (next.preampDb ?? 0)) checkpoint();
      setBands(copyBands(next.bands)); setPreampDb(next.preampDb ?? 0);
      setProfileName(transport.kind === 'demo' ? 'Demo starting point' : 'Headphone EQ');
      draftTouched.current = false;
    }
    setNotice(transport.kind === 'demo' ? 'Demo EQ loaded.' : enabled === false ? 'Headphone EQ is off. Choose EQ or Flat to enable it.' : initial ? 'Headphone EQ loaded.' : 'EQ read.');
  }
  async function attach(transport: Transport): Promise<void> {
    session.current = transport; setConnection({ kind: 'connected', transport });
    try {
      if (transport.kind !== 'demo') await transport.request([0, 2], [1]);
      await readDevice(transport, true); setDialog(null);
    }
    catch (e) { transport.disconnect(); throw e; }
  }
  async function connect(): Promise<void> {
    if (method === 'linux') {
      await run('scanning', async () => {
        const found = await bridge.current.scan(); setDevices(found);
        if (!found.length) throw new Error('No EH11 found. Turn it on, close FiiO Control, then scan again.');
      });
    } else await run('connecting', async () => { await attach(await connectBrowser(log, lostConnection)); });
  }
  async function demo(): Promise<void> {
    await run('connecting', async () => { session.current?.disconnect(); await attach(new DemoTransport(log, lostConnection)); });
  }
  async function apply(): Promise<void> {
    const transport = session.current;
    if (!transport || transport.kind === 'browser') return;
    await run('applying', async () => {
      const expected = { bands: validateBands(bandsRef.current), preampDb: validatePreamp(preampRef.current) };
      if (transport.kind === 'linux') {
        const target = hardwareTarget(expected, qScale);
        const baseline = snapshot?.raw;
        if (!baseline) throw new Error('Read the headphone EQ before applying.');
        const backup = activeComparison(comparison,transport.deviceId,baseline)?.eq ?? baseline;
        const previousBackup = localStorage.getItem(HARDWARE_BACKUP_KEY);
        try { localStorage.setItem(HARDWARE_BACKUP_KEY, JSON.stringify(Array.from(backup))); }
        catch { throw new Error('Could not save the original EQ backup. Export your EQ and free browser storage before applying.'); }
        setHardwareBackup(backup);
        let raw: Uint8Array;
        try { raw = await transport.apply(baseline, target); }
        catch (error) {
          setEqEnabled(null);
          // A rejected request sent no writes. Preserve the existing restore point.
          if (error instanceof BridgeRequestError && error.status >= 400 && error.status < 500) {
            if (previousBackup === null) localStorage.removeItem(HARDWARE_BACKUP_KEY);
            else localStorage.setItem(HARDWARE_BACKUP_KEY, previousBackup);
            setHardwareBackup(readHardwareBackup(localStorage));
          }
          throw error;
        }
        if (session.current !== transport) return;
        const next = parseEq(raw, qScale);
        setEqEnabled(true);
        setPlaybackMode('eq'); clearComparison();
        setSnapshot({ bands: next, preampDb: null, raw, at: new Date().toISOString() });
        setBands(copyBands(next));
        setNotice('Applied. Full EQ readback verified.');
        return;
      }
      const next = await transport.apply(expected);
      if (session.current !== transport) return;
      if (!sameBands(expected.bands, next.bands) || expected.preampDb !== next.preampDb) throw new Error('Demo readback does not match the draft.');
      setSnapshot({ ...next, at: new Date().toISOString(), raw: null }); setDemoVerified(true);
      setNotice('Demo verified. No headphones changed.');
    });
  }

  async function stopLive(): Promise<void> {
    const writer = liveWriter.current, active = liveConnection.current;
    liveWriter.current = null; liveConnection.current = null;
    setLiveState('stopping');
    try { await writer?.stop(); await active?.stop(); }
    finally { setLiveState('off'); setLivePending(false); }
  }

  async function selectPlayback(mode: 'eq' | 'flat'): Promise<void> {
    const transport = session.current;
    if (!transport || transport.kind !== 'linux' || !snapshotRef.current?.raw || liveState === 'stopping') return;
    await run('applying', async () => {
      let attempted = false;
      try {
        if (liveWriter.current || liveConnection.current) await stopLive();
        if (session.current !== transport) return;
        const baseline = snapshotRef.current?.raw;
        if (!baseline) throw new Error('Read headphone EQ before comparing.');
        let target: Uint8Array;
        if (mode === 'flat') {
          const next = activeComparison(comparison,transport.deviceId,baseline) ?? makeComparison(transport.deviceId, baseline);
          try {
            localStorage.setItem(COMPARISON_KEY, JSON.stringify({ deviceId: next.deviceId, eq: Array.from(next.eq) }));
            localStorage.setItem(HARDWARE_BACKUP_KEY,JSON.stringify(Array.from(next.eq)));
          }
          catch { throw new Error('Could not save your EQ. Free browser storage before comparing.'); }
          setComparison(next); setHardwareBackup(next.eq); target = next.flat;
        } else target = activeComparison(comparison,transport.deviceId,baseline)?.eq ?? baseline;
        attempted = true;
        const raw = await transport.apply(baseline, target);
        if (session.current !== transport) return;
        setSnapshot({ bands: parseEq(raw, qScale), preampDb: null, raw, at: new Date().toISOString() });
        setEqEnabled(true); setPlaybackMode(mode);
        if (mode === 'eq') {
          // Reconnection loads the actual flat device curve. Restore the saved
          // curve in the editor too, unless a new draft has since been made.
          if (sameBands(bandsRef.current, parseEq(baseline,qScale))) setBands(parseEq(raw,qScale));
          clearComparison();
        }
        setNotice(mode === 'flat' ? 'Flat filters. Headphone EQ stays on.' : 'Your EQ restored.');
      } catch (error) { if (attempted) setEqEnabled(null); throw error; }
    });
  }

  async function toggleHeadphoneEq(): Promise<void> {
    const transport = session.current;
    if (!transport || transport.kind !== 'linux' || eqEnabled === null || liveState !== 'off') return;
    await run('applying',async () => {
      try { setEqEnabled(await transport.setEqEnabled(!eqEnabled)); }
      catch (error) { setEqEnabled(null); throw error; }
    });
  }

  async function toggleLive(): Promise<void> {
    if (liveState === 'on') {
      await run('applying', async () => { await stopLive(); setNotice('Live EQ off. Last heard EQ kept.'); });
      return;
    }
    const transport = session.current;
    if (!transport || transport.kind !== 'linux') return;
    await run('reading', async () => {
      hardwareTarget({ bands: bandsRef.current, preampDb: preampRef.current }, qScale);
      const baseline = snapshot?.raw;
      if (!baseline) throw new Error('Read EQ before starting Live EQ.');
      const backup = activeComparison(comparison,transport.deviceId,baseline)?.eq ?? baseline;
      const previousBackup = localStorage.getItem(HARDWARE_BACKUP_KEY);
      try { localStorage.setItem(HARDWARE_BACKUP_KEY, JSON.stringify(Array.from(backup))); }
      catch { throw new Error('Could not save the starting EQ backup. Free browser storage before starting Live EQ.'); }
      let active: LiveConnection;
      try { active = await transport.startLive(baseline); }
      catch (error) {
        if (previousBackup === null) localStorage.removeItem(HARDWARE_BACKUP_KEY);
        else localStorage.setItem(HARDWARE_BACKUP_KEY, previousBackup);
        throw error;
      }
      if (session.current !== transport) { await active.stop(); return; }
      setHardwareBackup(backup);
      setEqEnabled(true);
      liveConnection.current = active;
      liveWriter.current = new LiveEqWriter(baseline,
        (before, target) => active.apply(before, target),
        raw => {
          if (session.current !== transport) return;
          setSnapshot({ bands: parseEq(raw, qScale), preampDb: null, raw, at: new Date().toISOString() });
          setPlaybackMode('eq'); clearComparison();
        },
        error => {
          if (session.current !== transport) return;
          setEqEnabled(null);
          setSnapshot(null);
          const message = `Live EQ stopped. ${errorMessage(error)}`;
          setError(message); setNotice(message);
          void stopLive().catch(e => log({ time: new Date().toISOString(), direction: 'info', message: errorMessage(e) }));
        },
        setLivePending);
      setLiveState('on'); setNotice('Live EQ on. Edits go to your headphones.');
    });
  }

  useEffect(() => {
    if (liveState !== 'on' || !liveWriter.current) return;
    try { liveWriter.current.submit(hardwareTarget({ bands, preampDb }, qScale)); }
    catch (error) {
      const message = `Live EQ stopped. ${errorMessage(error)}`;
      void stopLive().then(() => { setError(message); setNotice(message); }).catch(e => setError(errorMessage(e)));
    }
  }, [bands, preampDb, qScale, liveState]);
  function undo(): void {
    const previous = past.at(-1); if (!previous) return;
    setFuture(next => [{ bands: copyBands(bands), preampDb }, ...next]); setPast(past.slice(0, -1)); setBands(previous.bands); setPreampDb(previous.preampDb); draftTouched.current = true; setDemoVerified(false);
  }
  function redo(): void {
    const next = future[0]; if (!next) return;
    setPast(previous => [...previous, { bands: copyBands(bands), preampDb }]); setFuture(future.slice(1)); setBands(next.bands); setPreampDb(next.preampDb); draftTouched.current = true; setDemoVerified(false);
  }
  function persist(next: Preset[]): boolean {
    if (next.length > 1000) { setError('A library supports up to 1,000 presets. Back up and remove unused presets first.'); return false; }
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(next)); setPresets(next); return true; }
    catch { setError('This browser could not save the preset. Export it to a file instead.'); return false; }
  }
  function save(event: FormEvent): void {
    event.preventDefault(); const name = presetName.trim(); if (!name) return;
    if (persist([...presets, { id: crypto.randomUUID(), name, bands: copyBands(bands), preampDb }])) { setProfileName(name); setDialog(null); setNotice(`Saved “${name}”.`); }
  }
  function removePreset(preset: Preset): void {
    if (persist(presets.filter(item => item.id !== preset.id))) { setRemovedPreset(preset); setNotice('Preset deleted.'); }
  }
  function undoRemove(): void {
    if (removedPreset && persist([...presets, removedPreset])) { setRemovedPreset(null); setNotice('Preset restored.'); }
  }
  function importPreset(event: FormEvent): void {
    event.preventDefault();
    try { const next = parsePreset(importText); replaceDraft(next.bands, importName || next.name, next.preampDb); setDialog(null); setImportText(''); setImportName(''); setError(null); setNotice('EQ imported.'); }
    catch (e) { setError(errorMessage(e)); }
  }
  function changeQScale(next: QScale): void {
    try {
      if (snapshot?.raw) {
        const decoded = parseEq(snapshot.raw, next);
        if (sameBands(bands, snapshot.bands)) setBands(copyBands(decoded));
        setSnapshot({ ...snapshot, bands: decoded });
      }
      setQScale(next); setError(null);
    } catch (e) { setError(errorMessage(e)); }
  }
  const draftStatus = eqEnabled === false ? 'Headphone EQ off' : eqEnabled === true && playbackMode === 'flat' ? 'Flat playback · EQ on' : liveState === 'on' ? (livePending ? 'Live EQ updating…' : 'Live EQ') : demoVerified && !changed ? 'Demo verified' : changed ? 'Local changes' : snapshot ? (isDemo ? 'Demo EQ loaded' : 'Headphone EQ loaded') : 'Local draft';
  async function restoreLibrary(file: File): Promise<void> {
    await run('reading', async () => {
      if (file.size > MAX_BACKUP_SIZE) throw new Error('Choose a library backup under 2 MB.');
      const incoming = parseLibrary(await file.text());
      const next = mergeLibrary(presets, incoming);
      if (persist(next)) { setNotice(`Added ${next.length - presets.length} presets. Existing presets kept.`); setDialog(null); }
    });
  }
  const openDialog = (next: Dialog): void => { setError(null); setDialog(next); };
  const saveDialog = (): void => { setPresetName(profileName === 'Untitled EQ' ? '' : profileName); openDialog('save'); };
  return <div className="app-shell">
    <header className="topbar">
      <a className="wordmark" href={import.meta.env.BASE_URL} aria-label="FiiOFixer home"><span className="brand-icon"><span className="light-brand"><Headphones size={21}/></span><span className="dracula-brand"><DraculaMark size={28}/></span></span>fiiofixer<span className="brand-note"><ThemeWords light="EH11 EQ" dark="After dark"/></span></a>
      <div className="header-actions"><PwaControl busy={busy || liveState !== 'off'} saved={draftText === savedDraft} onError={setError}/><button className="button" onClick={() => openDialog('help')}>Install & share</button><ThemeControl/></div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <section className="device-panel" aria-labelledby="device-title">
          <div className="section-heading"><h2 id="device-title">FiiO EH11</h2><span className={`status-pill ${connection.kind === 'connected' ? 'online' : ''}`}><i/>{isDemo ? 'Demo' : connection.kind === 'connected' ? 'Connected' : 'Offline'}</span></div>
          {connection.kind === 'offline' ? <div className="device-actions"><button className="button primary" onClick={() => { setDevices([]); openDialog('connect'); }} disabled={busy}><Bluetooth size={17}/>Connect</button><button className="text-button" onClick={() => void demo()} disabled={busy}>Try demo</button></div> : <><p className="connection-source">{isDemo ? 'No headphones connected.' : connection.transport.kind === 'linux' ? 'Linux Bluetooth' : 'Browser Bluetooth'}</p><button className="button" onClick={disconnect} disabled={busy}><Unplug size={16}/>Disconnect</button></>}
        </section>
        <section className="presets-panel" aria-labelledby="presets-title">
          <div className="section-heading"><h2 id="presets-title"><ThemeWords light="Presets" dark="Preset crypt"/></h2><button className="icon-button small" aria-label="Save a new preset" disabled={busy} onClick={saveDialog}><Plus size={18}/></button></div>
          <button className={`preset-row ${profileName === 'Flat' && sameBands(bands, flatBands()) && preampDb === 0 ? 'active' : ''}`} disabled={busy} onClick={() => { replaceDraft(flatBands(), 'Flat'); setNotice('Flat EQ loaded.'); }}><SlidersHorizontal size={16}/><span>Flat</span></button>
          {presets.map(preset => <div className={`saved-preset ${profileName === preset.name && sameBands(bands, preset.bands) && preampDb === preset.preampDb ? 'active' : ''}`} key={preset.id}><button className="preset-row" disabled={busy} onClick={() => { replaceDraft(preset.bands, preset.name, preset.preampDb); setNotice('Preset loaded.'); }}><span className="preset-icon"><span className="day-copy"><Headphones size={16}/></span><span className="night-copy"><DraculaMark size={20}/></span></span><span>{preset.name}</span></button><button className="icon-button small delete-preset" aria-label={`Delete ${preset.name}`} disabled={busy} onClick={() => removePreset(preset)}><Trash2 size={15}/></button></div>)}
          <div className="library-actions"><button className="button" disabled={busy} onClick={() => openDialog('import')}><ArrowDownToLine size={15}/>Import EQ</button><button className="text-button" disabled={busy} onClick={() => openDialog('library')}>Library backup</button></div>
        </section>
        <DraculaPortrait/>
      </aside>
      <main className="main-workbench">
        <ListeningChamber/>
        {isDemo && <div className="demo-banner"><span>Demo. Changes affect simulated EQ only.</span><button className="text-button" onClick={disconnect} disabled={busy}>Exit</button></div>}
        <section className="equalizer-panel" aria-labelledby="eq-title">
          <div className="eq-toolbar"><div><h1 id="eq-title">{profileName}</h1><span className={`draft-status ${demoVerified && !changed ? 'verified' : ''}`}><i/>{draftStatus}</span></div><div className="history-actions"><button className="icon-button" aria-label="Undo" onClick={undo} disabled={!past.length || busy}><Undo2 size={18}/></button><button className="icon-button" aria-label="Redo" onClick={redo} disabled={!future.length || busy}><Redo2 size={18}/></button><button className="icon-button" aria-label="Reset draft to flat" disabled={busy} onClick={() => replaceDraft(flatBands(), 'Flat')}><RotateCcw size={17}/></button></div></div>
          <Graph bands={bands} selected={selected} onSelect={setSelected} onChange={edit} onCommit={checkpoint} disabled={busy}/>
          <div className="band-strip" aria-label="Select an EQ band">{bands.map((band, index) => <button className={`band-tile ${!band.enabled ? 'band-disabled' : ''} ${selected === index ? 'active' : ''}`} key={index} aria-label={`Select band ${index + 1}`} aria-pressed={selected === index} onClick={() => setSelected(index)} disabled={busy}><span className="band-index">{index + 1}</span><strong>{formatFrequency(band.frequency)}<small> Hz</small></strong><span className="band-gain">{!band.enabled ? 'Off' : <>{band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)}</>}</span></button>)}</div>
          <div className="band-editor"><div className="band-editor-title"><span className="selected-band-number">{selected + 1}</span><h2>Band {selected + 1}</h2></div>
            <label className="filter-field">Filter type<div className="select-wrap"><select aria-label="Filter type" value={current.type} disabled={busy} onChange={event => { if (isFilterType(event.target.value)) { checkpoint(); edit(selected, { type: event.target.value }); } }}>{Object.entries(FILTER_NAMES).map(([value, label]) => <option key={value} value={value} disabled={liveState !== 'off' && (value === 'lowPass' || value === 'highPass')}>{label}</option>)}</select><ChevronDown size={14}/></div></label>
            <NumberControl label="Frequency" unit="Hz" value={current.frequency} min={20} max={20000} step={1} disabled={busy} onCommit={checkpoint} onChange={value => edit(selected, { frequency: value })}/>
            <NumberControl label="Gain" unit="dB" value={current.gain} min={-12} max={12} step={0.1} disabled={busy || current.type === 'lowPass' || current.type === 'highPass'} onCommit={checkpoint} onChange={value => edit(selected, { gain: value })}/>
            <NumberControl label="Q factor" value={current.q} min={0.01} max={100} step={0.01} disabled={busy} onCommit={checkpoint} onChange={value => edit(selected, { q: value })}/>
          </div>
          <div className="gain-slider"><span>-12 dB</span><input aria-label="Selected band gain" type="range" min="-12" max="12" step="0.1" value={Math.max(-12, Math.min(12, current.gain))} disabled={busy || current.type === 'lowPass' || current.type === 'highPass'} onPointerDown={checkpoint} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) checkpoint(); }} onChange={event => edit(selected, { gain: Number(event.target.value) })}/><span>+12 dB</span></div>
          <div className="preset-options"><label className="filter-toggle"><button type="button" role="switch" aria-label="Selected filter enabled" aria-checked={current.enabled} className={`toggle ${current.enabled ? 'on' : ''}`} disabled={busy || liveState !== 'off'} onClick={() => { checkpoint(); edit(selected, { enabled: !current.enabled }); }}><i/></button>Filter {current.enabled ? 'on' : 'off'}</label><NumberControl label="Preset preamp" unit="dB" value={preampDb} min={-100} max={40} step={0.1} disabled={busy || liveState !== 'off'} onCommit={checkpoint} onChange={value => { setPreampDb(value); draftTouched.current = true; setDemoVerified(false); }}/><p>Stored with preset; not sent to headphones.</p></div>
          <div className="eq-actions"><div className="playback-control" role="group" aria-label="Headphone playback"><button type="button" aria-pressed={eqEnabled === true && playbackMode === 'eq'} disabled={busy || (eqEnabled === true && playbackMode === 'eq') || !snapshot?.raw || liveState === 'stopping' || connection.kind !== 'connected' || connection.transport.kind !== 'linux'} onClick={() => void selectPlayback('eq')} title="Restore your EQ; keep headphone EQ enabled">EQ</button><button type="button" aria-pressed={eqEnabled === true && playbackMode === 'flat'} disabled={busy || (eqEnabled === true && playbackMode === 'flat' && liveState !== 'on') || !snapshot?.raw || liveState === 'stopping' || connection.kind !== 'connected' || connection.transport.kind !== 'linux'} onClick={() => void selectPlayback('flat')} title="Zero-gain filters with headphone EQ enabled">Flat</button></div><label className="live-control"><button type="button" role="switch" aria-label="Live EQ" aria-checked={liveState === 'on'} className={`toggle ${liveState === 'on' ? 'on' : ''}`} disabled={busy || liveState === 'stopping' || connection.kind !== 'connected' || connection.transport.kind !== 'linux'} onClick={() => void toggleLive()}><i/></button>Live EQ</label><p className="draft-note">{bands.some(band => Math.abs(band.gain) > 12) ? 'Imported gain exceeds the ±12 dB hardware range.' : liveState === 'on' ? (livePending ? 'Updating…' : 'Edits are live.') : isDemo ? (demoVerified && !changed ? 'Demo readback matches.' : 'Apply to test readback.') : connection.kind === 'connected' && connection.transport.kind === 'linux' ? eqEnabled === false ? 'Headphone EQ is off.' : 'EQ stays enabled in both.' : 'Connect with the Linux helper to apply EQ.'}</p><button className="button primary apply-button" onClick={() => void apply()} disabled={busy || liveState !== 'off' || connection.kind !== 'connected' || connection.transport.kind === 'browser' || (!changed && eqEnabled !== false)}>{activity === 'applying' ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} {activity === 'applying' ? 'Verifying…' : isDemo ? 'Apply in demo' : 'Apply to headphones'}</button></div>
        </section>
        <section className="utility-row" aria-label="EQ actions"><button className="button" disabled={busy || liveState !== 'off' || connection.kind === 'offline'} onClick={() => { const active = session.current; if (active) void run('reading', () => readDevice(active)); }}><ArrowDownToLine size={16}/>Read EQ</button><button className="button" disabled={busy || !snapshot || !changed} onClick={() => { if (snapshot) replaceDraft(snapshot.bands, isDemo ? 'Demo EQ' : 'Headphone EQ', snapshot.preampDb ?? 0); }}>Use read EQ</button><button className="button" disabled={busy || !hardwareBackup} onClick={() => { if (hardwareBackup) { replaceDraft(parseEq(hardwareBackup, qScale), 'Previous headphone EQ'); setNotice('Previous EQ loaded. Apply to restore.'); } }}>Previous EQ</button><span className="utility-spacer"/><button className="button" disabled={busy} onClick={saveDialog}><Plus size={16}/>Save preset</button><button className="button" onClick={() => openDialog('export')}><ArrowUpFromLine size={16}/>Export EQ</button></section>
        {(busy || error || notice) && <div className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{busy && <LoaderCircle className="spin" size={16}/>}<span>{busy ? ({ connecting: 'Connecting…', scanning: 'Scanning…', reading: 'Reading EQ…', applying: 'Verifying…', idle: notice }[activity]) : error ?? notice}</span>{removedPreset && !busy && <button className="text-button" onClick={undoRemove}>Undo delete</button>}</div>}
        <details className="diagnostics"><summary>Diagnostics<ChevronDown size={15}/></summary><div className="diagnostics-body"><p>Q uses the selected interpretation. Linux verifies the curve and headphone EQ activation; Q scaling and power-cycle persistence still need checking.</p><div className="diagnostic-tools"><label className="live-control"><button type="button" role="switch" aria-label="Headphone EQ enabled" aria-checked={eqEnabled === true} className={`toggle ${eqEnabled === true ? 'on' : ''}`} disabled={busy || eqEnabled === null || liveState !== 'off' || connection.kind !== 'connected' || connection.transport.kind !== 'linux'} onClick={() => void toggleHeadphoneEq()}><i/></button>EQ processing</label><label>Q interpretation<select aria-label="Q interpretation" value={qScale} disabled={busy || isDemo || liveState !== 'off'} onChange={event => changeQScale(event.target.value === '10' ? 10 : 100)}><option value="100">raw ÷ 100, current reference</option><option value="10">raw ÷ 10, older notes</option></select></label><button className="button" onClick={() => download('fiiofixer-diagnostics.json', JSON.stringify({ app: 'fiiofixer', version: APP_VERSION, generatedAt: new Date().toISOString(), hardwareWritesEnabled: connection.kind === 'connected' && connection.transport.kind === 'linux', mode: connection.kind === 'connected' ? connection.transport.kind : 'offline', qDivisor: qScale, headphoneEqEnabled: eqEnabled, snapshot: snapshot ? { at: snapshot.at, bands: snapshot.bands, raw: snapshot.raw ? Array.from(snapshot.raw) : null } : null, logs }, null, 2))}><ArrowDownToLine size={15}/>Download log</button></div><pre className="log-output" aria-label="Connection log">{logs.length ? logs.map(entry => `${entry.time.slice(11, 23)} ${entry.direction.padEnd(8)} ${entry.message}`).join('\n') : 'No Bluetooth traffic.'}</pre></div></details>
      </main>
    </div>
    <dialog aria-labelledby="dialog-title" ref={modalRef} className="modal" onCancel={() => setDialog(null)} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setDialog(null); } }}>
      <button className="icon-button modal-close" aria-label="Close dialog" disabled={busy} onClick={() => setDialog(null)}><X size={20}/></button>
      {dialog === 'connect' && <><h2 id="dialog-title">Connect EH11</h2><p>Turn on your EH11 and close FiiO Control.</p><label className="modal-label">Connection<select aria-label="Connection method" disabled={busy} value={method} onChange={event => { setMethod(event.target.value === 'linux' ? 'linux' : 'browser'); setDevices([]); setError(null); }}>{localHelper && <option value="linux">Linux Bluetooth helper</option>}<option value="browser">Browser Bluetooth</option></select></label>{method === 'browser' && bluetoothSupport() && <p>{bluetoothSupport()}</p>}{!localHelper && <p>Linux users can <a href={`${REPO_URL}/releases/latest`} target="_blank" rel="noreferrer">install the desktop package</a>.</p>}{devices.length > 0 && <div className="device-list">{devices.map(device => <button className="button" key={device.id} disabled={busy} onClick={() => void run('connecting', async () => { await attach(await bridge.current.connect(device, log, lostConnection)); })}><Headphones size={18}/>{device.name}<span>Connect</span></button>)}</div>}{error && <p className="modal-error" role="alert">{error}</p>}<button className="button primary modal-main" disabled={busy} onClick={() => void connect()}>{busy ? <LoaderCircle className="spin" size={17}/> : <Bluetooth size={17}/>} {busy ? 'Connecting…' : method === 'linux' ? 'Find EH11' : 'Choose EH11'}</button></>}
      {dialog === 'save' && <form onSubmit={save}><h2 id="dialog-title">Save preset</h2><label className="modal-label">Preset name<input autoFocus required maxLength={60} value={presetName} placeholder="Everyday" onChange={event => setPresetName(event.target.value)}/></label>{error && <p className="modal-error" role="alert">{error}</p>}<button className="button primary modal-main" type="submit">Save preset</button></form>}
      {dialog === 'export' && <><h2 id="dialog-title">Export EQ</h2><label className="modal-label">Squig.link / Equalizer APO<textarea className="export-preview" aria-label="Exported EQ text" readOnly rows={9} value={exportApo(bands, preampDb)}/></label><button className="button primary modal-main" onClick={() => download('fiiofixer-filters.txt', exportApo(bands, preampDb), 'text/plain')}><ArrowDownToLine size={16}/>Download .txt</button><div className="export-secondary"><button className="button" onClick={() => download('fiiofixer-eq.json', exportPreset(profileName, bands, preampDb))}>Download JSON</button><button className="button" onClick={() => { void navigator.clipboard.writeText(exportApo(bands, preampDb)).then(() => { setNotice('EQ copied.'); setDialog(null); }).catch(() => setError('Clipboard unavailable. Select the text or download it.')); }}><Copy size={15}/>Copy text</button></div>{error && <p className="modal-error" role="alert">{error}</p>}</>}
      {dialog === 'import' && <form onSubmit={importPreset}><h2 id="dialog-title">Import EQ</h2><p>Squig.link Filters.txt, Equalizer APO text, or a preset JSON. Up to 10 filters.</p><label className="file-import-label">Open file<input type="file" aria-label="Open preset file" accept=".txt,.json,.bin,text/plain,application/json,application/octet-stream" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.size > 100000) { setError('Choose a preset file under 100 KB.'); return; }
        if (file.name.toLowerCase().endsWith('.bin')) {
          void file.arrayBuffer().then(buffer => {
            const restored = parseEq(new Uint8Array(buffer), qScale);
            replaceDraft(restored, 'Hardware backup'); setDialog(null); setError(null); setNotice('Backup loaded. Apply to restore.');
          }).catch(e => setError(errorMessage(e)));
          return;
        }
        void file.text().then(text => { setImportText(text); setImportName(file.name.replace(/\.(txt|json)$/i, '').slice(0, 60)); setError(null); }).catch(() => setError('Could not read the file.'));
      }}/></label><label className="modal-label">Preset text<textarea autoFocus aria-label="Preset text" rows={8} maxLength={100000} required value={importText} onChange={event => setImportText(event.target.value)} placeholder={'Preamp: -3 dB\nFilter 1: ON PK Fc 100 Hz Gain -2 dB Q 0.71'}/></label>{error && <p className="modal-error" role="alert">{error}</p>}<button className="button primary modal-main" type="submit">Import EQ</button></form>}
      {dialog === 'library' && <><h2 id="dialog-title">Library backup</h2><p>Move saved presets to another browser or computer.</p><button className="button primary modal-main" onClick={() => download('fiiofixer-library.json', exportLibrary(presets))}><ArrowDownToLine size={16}/>Back up {presets.length} {presets.length === 1 ? 'preset' : 'presets'}</button><label className="file-import-label">Restore backup<input type="file" aria-label="Restore library backup" accept=".json,application/json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void restoreLibrary(file); event.target.value = ''; }}/></label><p>Restoring adds presets. Existing presets stay.</p>{error && <p className="modal-error" role="alert">{error}</p>}</>}
      {dialog === 'help' && <><h2 id="dialog-title">FiiOFixer</h2><h3>Install</h3><p>Use your browser menu's Install app or Add to home screen. The editor works offline after the first visit.</p><p><a className="button" href={`${REPO_URL}/releases/latest`} target="_blank" rel="noreferrer"><Download size={16}/>Linux desktop package</a></p><p>Linux Bluetooth needs the desktop package. Android Chrome connects directly from the shared link.</p><h3>Move presets</h3><p>Save your EQ, then use Library backup to transfer your saved presets. Drafts save automatically in this browser.</p><h3>Share</h3><p><a href={WEB_URL} target="_blank" rel="noreferrer">massiveadam.github.io/fiiofixer</a></p><button className="button" onClick={() => { void navigator.clipboard.writeText(WEB_URL).then(() => { setNotice('App link copied.'); setDialog(null); }).catch(() => setError('Clipboard unavailable. Copy the link above.')); }}><Copy size={15}/>Copy app link</button><h3>Dracula sound</h3><p>Switching to the Dracula theme plays a short organ sting on the output you choose, never the headphones, with a synthesized laugh by default. If the optional SoundBible clips are installed locally, the voice is “I Am Dracula” (personal use only) and the laugh is “Maniacal Laugh 2” by Timothy (CC BY-NC 3.0).</p><h3>Current limits</h3><p>Linux supports Live EQ and manual apply within ±12 dB using peaking and shelf filters. Preamp, filter bypass and pass filters are not supported on hardware. Android supports reads only. Q scaling and power-cycle persistence need checking.</p><p><a href={REPO_URL} target="_blank" rel="noreferrer">Source & setup</a> · <a href={`${import.meta.env.BASE_URL}third-party-notices.txt`} target="_blank" rel="noreferrer">Licenses</a> · v{APP_VERSION} · Independent project, not affiliated with FiiO.</p>{error && <p className="modal-error" role="alert">{error}</p>}</>}
    </dialog>
  </div>;
}

function NumberControl({ label, unit, value, min, max, step, disabled, onCommit, onChange }: { label: string; unit?: string; value: number; min: number; max: number; step: number; disabled: boolean; onCommit: () => void; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return <label className="number-field">{label}<span className="number-input"><input aria-label={label} type="number" min={min} max={max} step={step} value={text} disabled={disabled} onFocus={onCommit} onChange={event => {
    setText(event.target.value);
    const next = Number(event.target.value);
    if (event.target.value !== '' && Number.isFinite(next) && next >= min && next <= max) onChange(next);
  }} onBlur={() => setText(String(value))}/>{unit && <span>{unit}</span>}</span></label>;
}
