'use client';
// ─────────────────────────────────────────────────────────────────
// Hotel / PMS — the real vertical (replaces the static room-grid mockup).
// Module-gated. Tabs: Dashboard, Rooms (live grid + status), Reservations
// (book → check-in → check-out / cancel), Housekeeping, and Setup (room
// types + rooms). Wired through API.hotel (/api/v1/hotel).
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import type { Theme } from '@/lib/theme';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar } from '@/components/shell';
import { API } from '@/lib/api';

const { useState: useS, useEffect: useE, useCallback: useCb } = React;

const ROOM_TONE: any = { available: 'green', occupied: 'red', reserved: 'blue', cleaning: 'amber', checkout: 'violet', maintenance: 'gray', blocked: 'gray' };
const RES_TONE: any = { confirmed: 'blue', checked_in: 'green', checked_out: 'gray', cancelled: 'red', no_show: 'red' };
const HK_TONE: any = { pending: 'amber', in_progress: 'blue', done: 'green', inspected: 'green' };
const ROOM_STATUSES = ['available', 'cleaning', 'maintenance', 'blocked', 'occupied', 'reserved'];
const CHARGE_TYPES = ['restaurant', 'laundry', 'minibar', 'transport', 'spa', 'telephone', 'damage', 'service_charge', 'other'];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const dstr = (d: any) => (d ? String(d).slice(0, 10) : '—');

export function Hotel({ T }: { T: Theme }) {
  const [enabled, setEnabled] = useS<any>(null);   // null = loading
  const [tab, setTab] = useS<any>('dashboard');
  const [dash, setDash] = useS<any>(null);
  const [rooms, setRooms] = useS<any>({ rooms: [], stats: {} });
  const [res, setRes] = useS<any>({ reservations: [], summary: {} });
  const [resFilter, setResFilter] = useS('');
  const [tasks, setTasks] = useS<any[]>([]);
  const [roomTypes, setRoomTypes] = useS<any[]>([]);
  const [newRes, setNewRes] = useS(false);
  const [newType, setNewType] = useS(false);
  const [newRoom, setNewRoom] = useS(false);
  const [roomAct, setRoomAct] = useS<any>(null);   // room awaiting a status change
  const [folioId, setFolioId] = useS<any>(null);   // open folio
  const [corporate, setCorporate] = useS<any[]>([]);
  const [newCorp, setNewCorp] = useS(false);
  const [invoiceAcct, setInvoiceAcct] = useS<any>(null);
  const [show, node] = useToast();

  useE(() => { API.module.list().then((ms: any) => setEnabled(!!(ms.find((m: any) => m.key === 'hotel') || {}).enabled)).catch(() => setEnabled(false)); }, []);

  const reloadDash = useCb(() => API.hotel.dashboard().then(setDash).catch(() => {}), []);
  const reloadRooms = useCb(() => API.hotel.rooms().then(setRooms).catch(() => {}), []);
  const reloadRes = useCb(() => API.hotel.reservations(resFilter ? { status: resFilter } : undefined).then(setRes).catch(() => {}), [resFilter]);
  const reloadTasks = useCb(() => API.hotel.housekeeping().then(setTasks).catch(() => {}), []);
  const reloadTypes = useCb(() => API.hotel.roomTypes().then(setRoomTypes).catch(() => {}), []);
  const reloadCorporate = useCb(() => API.hotel.corporate().then(setCorporate).catch(() => {}), []);

  useE(() => { if (!enabled) return; reloadDash(); reloadRooms(); reloadTypes(); }, [enabled, reloadDash, reloadRooms, reloadTypes]);
  useE(() => { if (enabled && tab === 'reservations') reloadRes(); }, [enabled, tab, reloadRes]);
  useE(() => { if (enabled && tab === 'housekeeping') reloadTasks(); }, [enabled, tab, reloadTasks]);
  useE(() => { if (enabled && tab === 'corporate') reloadCorporate(); }, [enabled, tab, reloadCorporate]);

  async function enableModule() { try { await API.module.setEnabled('hotel', true); setEnabled(true); show('Hotel module enabled'); } catch (e: any) { show(e.message); } }
  const refreshAll = () => { reloadDash(); reloadRooms(); reloadRes(); reloadTasks(); };

  async function changeRoomStatus(room: any, status: any) {
    try { await API.hotel.setRoomStatus(room.id, status); setRoomAct(null); show(`Room ${room.number} → ${status}`); reloadRooms(); reloadDash(); }
    catch (e: any) { show(e.message); }
  }
  async function checkin(r: any) { try { const m: any = await API.hotel.checkin(r.id); show(m.message || 'Checked in'); refreshAll(); } catch (e: any) { show(e.message); } }
  async function checkout(r: any) {
    try { const m: any = await API.hotel.checkout(r.id); show(m.message || 'Checked out'); refreshAll(); }
    catch (e: any) { show(e.message || 'Settle the folio balance first'); }
  }
  async function cancelRes(r: any) {
    if (typeof window !== 'undefined' && !window.confirm(`Cancel reservation ${r.reservationNumber}?`)) return;
    try { const m: any = await API.hotel.cancelReservation(r.id); show(m.message || 'Cancelled'); refreshAll(); } catch (e: any) { show(e.message); }
  }
  async function hkAdvance(t: any, status: any) { try { await API.hotel.updateHousekeeping(t.id, status); show('Task updated'); reloadTasks(); reloadRooms(); } catch (e: any) { show(e.message); } }

  if (enabled === null) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paperAlt, fontFamily: T.fMono, fontSize: 12.5, color: T.inkSub }}>Loading…</div>;
  if (enabled === false) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.paperAlt }}>
      <Topbar T={T} title="Hotel" subtitle="Property management" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{ width: 76, height: 76, borderRadius: 20, background: T.accent.soft, color: T.accent.base, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, margin: '0 auto 20px' }}>🏨</div>
          <div style={{ fontFamily: T.fDisplay, fontSize: 24, fontWeight: T.dispWeight, color: T.ink, marginBottom: 8 }}>Hotel module</div>
          <div style={{ fontSize: 13.5, color: T.inkSub, lineHeight: 1.6, marginBottom: 22 }}>A full property-management front desk: live room grid, reservations with check-in / check-out, guest folios, and housekeeping. Paid add-on ($29/mo).</div>
          <Btn T={T} kind="accent" onClick={enableModule}>Enable Hotel · $29/mo</Btn>
        </div>
      </div>
      {node}
    </div>
  );

  const tabs = [['dashboard', 'Dashboard'], ['rooms', 'Rooms', (rooms.stats || {}).total], ['reservations', 'Reservations'], ['housekeeping', 'Housekeeping'], ['corporate', 'Corporate'], ['setup', 'Setup']];

  // group rooms by floor for the grid
  const byFloor: any = {};
  for (const r of (rooms.rooms || [])) { const f = r.floor == null ? '—' : r.floor; (byFloor[f] = byFloor[f] || []).push(r); }
  const floors = Object.keys(byFloor).sort();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.paperAlt }}>
      <Topbar T={T} title="Hotel" subtitle="Front desk & property management"
        right={<Btn T={T} kind="accent" onClick={() => setNewRes(true)}>+ New reservation</Btn>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: T.paper, padding: 4, borderRadius: 10, width: 'fit-content', border: `1px solid ${T.line}` }}>
            {tabs.map(([id, lbl, n]: any) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: tab === id ? 700 : 500, background: tab === id ? T.accent.base : 'transparent', color: tab === id ? T.accent.on : T.inkMid }}>{lbl}{n ? <span style={{ opacity: 0.7 }}> · {n}</span> : ''}</button>
            ))}
          </div>

          {tab === 'dashboard' && (
            <Dashboard T={T} dash={dash} />
          )}

          {tab === 'rooms' && (<>
            <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap', fontSize: 12 }}>
              {[['Total', rooms.stats.total, T.ink], ['Occupied', rooms.stats.occupied, T.red], ['Available', rooms.stats.available, T.green], ['Cleaning', rooms.stats.cleaning, T.amber], ['Reserved', rooms.stats.reserved, T.blue]].map(([k, v, c]: any) => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.inkSub }}><span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />{k}: <b style={{ color: T.ink, fontFamily: T.fMono }}>{v ?? 0}</b></span>
              ))}
            </div>
            {floors.length === 0 && <Panel T={T}><div style={empty(T)}>No rooms yet — add room types and rooms in the <b>Setup</b> tab.</div></Panel>}
            {floors.map((f) => (
              <div key={f} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkSub, marginBottom: 8 }}>Floor {f}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 10 }}>
                  {byFloor[f].map((rm: any) => {
                    const guest = (rm.reservations && rm.reservations[0] && rm.reservations[0].guest) || null;
                    return (
                      <button key={rm.id} onClick={() => setRoomAct(rm)} style={{ textAlign: 'left', background: T.card, border: `1px solid ${T.line}`, borderLeft: `3px solid ${toneColor(T, ROOM_TONE[rm.status])}`, borderRadius: T.r, padding: '11px 13px', cursor: 'pointer', boxShadow: T.sh1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: T.fMono, fontSize: 16, fontWeight: 700, color: T.ink }}>{rm.number}</span>
                          <Badge T={T} tone={ROOM_TONE[rm.status] || 'gray'}>{rm.status}</Badge>
                        </div>
                        <div style={{ fontSize: 11, color: T.inkSub, marginTop: 4 }}>{(rm.roomType && rm.roomType.name) || '—'}</div>
                        {guest ? <div style={{ fontSize: 11, color: T.inkMid, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>👤 {guest.name}</div> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </>)}

          {tab === 'reservations' && (<>
            <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap', fontSize: 12.5, color: T.inkSub }}>
              <span>Arrivals today: <b style={{ color: T.ink, fontFamily: T.fMono }}>{(res.summary || {}).arrivals_today ?? 0}</b></span>
              <span>Departures: <b style={{ color: T.ink, fontFamily: T.fMono }}>{(res.summary || {}).departures_today ?? 0}</b></span>
              <span>In-house: <b style={{ color: T.green, fontFamily: T.fMono }}>{(res.summary || {}).in_house ?? 0}</b></span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {[['', 'All'], ['confirmed', 'Confirmed'], ['checked_in', 'In-house'], ['checked_out', 'Departed'], ['cancelled', 'Cancelled']].map(([id, lbl]) => (
                <button key={id} onClick={() => setResFilter(id)} style={{ padding: '6px 13px', borderRadius: 99, border: `1px solid ${resFilter === id ? T.accent.base : T.line}`, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: resFilter === id ? 700 : 500, background: resFilter === id ? T.accent.soft : T.paper, color: resFilter === id ? T.accent.text : T.inkMid }}>{lbl}</button>
              ))}
            </div>
            <Panel T={T} pad={false}>
              <table style={tbl}><thead><tr>{['Reservation', 'Guest', 'Room', 'Stay', 'Total', 'Balance', 'Status', ''].map((h, i) => <th key={i} style={th(T, i >= 4 && i <= 5)}>{h}</th>)}</tr></thead>
                <tbody>{(res.reservations || []).map((r: any) => (
                  <tr key={r.id}>
                    <td style={td(T)}><b style={{ fontFamily: T.fMono, fontSize: 12.5, color: T.ink }}>{r.reservationNumber}</b><span style={{ display: 'block', fontSize: 10.5, color: T.inkMute }}>{r.nights}n · {(r.bookingSource || '').replace('_', ' ')}</span></td>
                    <td style={td(T)}><b style={{ color: T.ink }}>{(r.guest && r.guest.name) || '—'}</b>{r.guest && r.guest.phone ? <span style={{ display: 'block', fontSize: 11, color: T.inkSub, fontFamily: T.fMono }}>{r.guest.phone}</span> : null}</td>
                    <td style={td(T)}>{r.room ? <>{r.room.number}<span style={{ color: T.inkMute, fontSize: 11 }}> · {r.room.roomType && r.room.roomType.name}</span></> : '—'}</td>
                    <td style={td(T)}><span style={{ fontFamily: T.fMono, fontSize: 11.5 }}>{dstr(r.checkInDate)} → {dstr(r.checkOutDate)}</span></td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{money(r.totalRoomCharge)}</td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: Number((r.folio && r.folio.balance) || 0) > 0 ? T.redText : T.inkSub }}>{r.folio ? money(r.folio.balance) : '—'}</td>
                    <td style={td(T)}><Badge T={T} tone={RES_TONE[r.status] || 'gray'}>{(r.status || '').replace('_', ' ')}</Badge></td>
                    <td style={{ ...td(T), textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.status === 'confirmed' && <button onClick={() => checkin(r)} style={mini(T)}>Check in</button>}
                      {r.folio && r.folio.id && <button onClick={() => setFolioId(r.folio.id)} style={{ ...mini(T), marginLeft: 6 }}>Folio</button>}
                      {r.status === 'checked_in' && <button onClick={() => checkout(r)} style={{ ...mini(T), marginLeft: 6 }}>Check out</button>}
                      {r.status === 'confirmed' && <button onClick={() => cancelRes(r)} style={{ ...mini(T), marginLeft: 6, color: T.redText }}>Cancel</button>}
                    </td>
                  </tr>
                ))}{(res.reservations || []).length === 0 && <tr><td colSpan={8} style={empty(T)}>No reservations{resFilter ? ' in this status' : ''}.</td></tr>}</tbody></table>
            </Panel>
          </>)}

          {tab === 'housekeeping' && (
            <Panel T={T} pad={false}>
              <table style={tbl}><thead><tr>{['Room', 'Task', 'Assigned', 'Status', ''].map((h, i) => <th key={i} style={th(T)}>{h}</th>)}</tr></thead>
                <tbody>{tasks.map((t: any) => (
                  <tr key={t.id}>
                    <td style={td(T)}><b style={{ color: T.ink, fontFamily: T.fMono }}>{t.room && t.room.number}</b><span style={{ color: T.inkMute, fontSize: 11 }}> {t.room && t.room.roomType && t.room.roomType.name}</span></td>
                    <td style={td(T)}>{(t.type || '').replace('_', ' ')}</td>
                    <td style={td(T)}><span style={{ color: T.inkSub }}>{(t.assignedTo && t.assignedTo.name) || 'Unassigned'}</span></td>
                    <td style={td(T)}><Badge T={T} tone={HK_TONE[t.status] || 'gray'}>{(t.status || '').replace('_', ' ')}</Badge></td>
                    <td style={{ ...td(T), textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {t.status === 'pending' && <button onClick={() => hkAdvance(t, 'in_progress')} style={mini(T)}>Start</button>}
                      {t.status === 'in_progress' && <button onClick={() => hkAdvance(t, 'done')} style={mini(T)}>Mark done</button>}
                      {(t.status === 'done' || t.status === 'inspected') && <span style={{ fontSize: 12, color: T.green }}>✓ clean</span>}
                    </td>
                  </tr>
                ))}{tasks.length === 0 && <tr><td colSpan={5} style={empty(T)}>No housekeeping tasks 🎉</td></tr>}</tbody></table>
            </Panel>
          )}

          {tab === 'corporate' && (<>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><Btn T={T} kind="ghost" onClick={() => setNewCorp(true)}>+ Corporate account</Btn></div>
            <Panel T={T} pad={false}>
              <table style={tbl}><thead><tr>{['Company', 'Contact', 'Credit limit', 'Terms', 'Rate', ''].map((h, i) => <th key={i} style={th(T, i >= 2 && i <= 4)}>{h}</th>)}</tr></thead>
                <tbody>{corporate.map((a: any) => (
                  <tr key={a.id}>
                    <td style={td(T)}><b style={{ color: T.ink }}>{a.companyName}</b></td>
                    <td style={td(T)}>{a.contactPerson || '—'}{a.phone ? <span style={{ display: 'block', fontSize: 11, color: T.inkSub, fontFamily: T.fMono }}>{a.phone}</span> : null}</td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{money(a.creditLimit || 0)}</td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{a.paymentTermsDays}d</td>
                    <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono, color: T.inkSub }}>{a.negotiatedRate ? money(a.negotiatedRate) : '—'}</td>
                    <td style={{ ...td(T), textAlign: 'right' }}><button onClick={() => setInvoiceAcct(a)} style={mini(T)}>Invoice</button></td>
                  </tr>
                ))}{corporate.length === 0 && <tr><td colSpan={6} style={empty(T)}>No corporate accounts yet.</td></tr>}</tbody></table>
            </Panel>
          </>)}

          {tab === 'setup' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
              <Panel T={T} title="Room types" action={<Btn T={T} kind="ghost" onClick={() => setNewType(true)}>+ Add</Btn>} pad={false}>
                <table style={tbl}><thead><tr>{['Name', 'Rooms', 'Max', 'Base rate'].map((h, i) => <th key={i} style={th(T, i >= 1)}>{h}</th>)}</tr></thead>
                  <tbody>{roomTypes.map((rt: any) => (
                    <tr key={rt.id}>
                      <td style={td(T)}><b style={{ color: T.ink }}>{rt.name}</b></td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{(rt._count && rt._count.rooms) ?? 0}</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{rt.maxOccupancy}</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{money(rt.baseRate)}</td>
                    </tr>
                  ))}{roomTypes.length === 0 && <tr><td colSpan={4} style={empty(T)}>No room types yet.</td></tr>}</tbody></table>
              </Panel>
              <Panel T={T} title="Rooms" action={<Btn T={T} kind="ghost" onClick={() => setNewRoom(true)} >+ Add</Btn>} pad={false}>
                <table style={tbl}><thead><tr>{['Room', 'Type', 'Floor', 'Status'].map((h, i) => <th key={i} style={th(T, i === 2)}>{h}</th>)}</tr></thead>
                  <tbody>{(rooms.rooms || []).map((rm: any) => (
                    <tr key={rm.id}>
                      <td style={td(T)}><b style={{ color: T.ink, fontFamily: T.fMono }}>{rm.number}</b></td>
                      <td style={td(T)}>{(rm.roomType && rm.roomType.name) || '—'}</td>
                      <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{rm.floor ?? '—'}</td>
                      <td style={td(T)}><Badge T={T} tone={ROOM_TONE[rm.status] || 'gray'}>{rm.status}</Badge></td>
                    </tr>
                  ))}{(rooms.rooms || []).length === 0 && <tr><td colSpan={4} style={empty(T)}>No rooms yet.</td></tr>}</tbody></table>
              </Panel>
            </div>
          )}
        </div>
      </div>

      {newRes && <ReservationModal T={T} rooms={rooms.rooms || []} onClose={() => setNewRes(false)} onSaved={() => { setNewRes(false); show('Reservation created'); refreshAll(); }} />}
      {newType && <RoomTypeModal T={T} onClose={() => setNewType(false)} onSaved={() => { setNewType(false); show('Room type added'); reloadTypes(); }} />}
      {newRoom && <RoomModal T={T} roomTypes={roomTypes} onClose={() => setNewRoom(false)} onSaved={() => { setNewRoom(false); show('Room added'); reloadRooms(); reloadTypes(); }} />}
      {roomAct && <RoomActionModal T={T} room={roomAct} onClose={() => setRoomAct(null)} onPick={(s: any) => changeRoomStatus(roomAct, s)} />}
      {folioId && <FolioModal T={T} folioId={folioId} onClose={() => setFolioId(null)} onChanged={() => { reloadRes(); reloadDash(); }} show={show} />}
      {newCorp && <CorporateModal T={T} onClose={() => setNewCorp(false)} onSaved={() => { setNewCorp(false); show('Corporate account added'); reloadCorporate(); }} />}
      {invoiceAcct && <InvoiceModal T={T} account={invoiceAcct} onClose={() => setInvoiceAcct(null)} />}
      {node}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────
function Dashboard({ T, dash }: { T: Theme; dash: any }) {
  if (!dash) return <Panel T={T}><div style={empty(T)}>Loading dashboard…</div></Panel>;
  const cards = [
    ['Occupancy', (dash.occupancy_pct ?? 0) + '%', T.accent.base],
    ['In-house', dash.in_house ?? 0, T.green],
    ['Arrivals today', dash.arrivals_today ?? 0, T.blue],
    ['Departures today', dash.departures_today ?? 0, T.violet],
    ['Revenue today', money0(dash.room_revenue_today || 0), T.green],
    ['Revenue (month)', money0(dash.room_revenue_month || 0), T.accent.base],
    ['Housekeeping', dash.pending_housekeeping ?? 0, T.amber],
    ['Unpaid folios', dash.unpaid_folios ?? 0, dash.unpaid_folios ? T.red : T.green],
  ];
  return (<>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 18 }}>
      {cards.map(([k, v, c]: any, i: number) => (
        <div key={i} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '15px 18px', boxShadow: T.sh1, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c }} />
          <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>{k}</div>
          <div style={{ fontFamily: T.fMono, fontWeight: 500, fontSize: 24, color: T.ink, marginTop: 7 }}>{v}</div>
        </div>
      ))}
    </div>
    <Panel T={T} title="Recent reservations" pad={false}>
      <table style={tbl}><thead><tr>{['Reservation', 'Guest', 'Room', 'Status'].map((h, i) => <th key={i} style={th(T)}>{h}</th>)}</tr></thead>
        <tbody>{(dash.recent_reservations || []).map((r: any) => (
          <tr key={r.id}>
            <td style={td(T)}><b style={{ fontFamily: T.fMono, fontSize: 12.5, color: T.ink }}>{r.reservationNumber}</b></td>
            <td style={td(T)}>{(r.guest && r.guest.name) || '—'}</td>
            <td style={td(T)}>{(r.room && r.room.number) || '—'}</td>
            <td style={td(T)}><Badge T={T} tone={RES_TONE[r.status] || 'gray'}>{(r.status || '').replace('_', ' ')}</Badge></td>
          </tr>
        ))}{(dash.recent_reservations || []).length === 0 && <tr><td colSpan={4} style={empty(T)}>No reservations yet.</td></tr>}</tbody></table>
    </Panel>
  </>);
}

// ── New reservation ───────────────────────────────────────────────
function ReservationModal({ T, rooms, onClose, onSaved }: { T: Theme; rooms: any[]; onClose: () => void; onSaved: () => void }) {
  const free = rooms.filter((r: any) => r.status === 'available');
  const [f, setF] = useS<any>({ roomId: '', guestName: '', guestPhone: '', checkInDate: today(), checkOutDate: addDays(today(), 1), adults: 1, children: 0, ratePerNight: '', depositPaid: '', specialRequests: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const room = rooms.find((r: any) => r.id === f.roomId);
  const baseRate = room && room.roomType ? Number(room.roomType.baseRate) : 0;
  const nights = Math.max(0, Math.round((new Date(f.checkOutDate).getTime() - new Date(f.checkInDate).getTime()) / 86400000));
  const rate = Number(f.ratePerNight) > 0 ? Number(f.ratePerNight) : baseRate;
  const est = rate * nights;

  async function save() {
    if (!f.roomId) { setErr('Select a room.'); return; }
    if (!f.guestName.trim()) { setErr('Guest name is required.'); return; }
    if (nights < 1) { setErr('Check-out must be after check-in.'); return; }
    setBusy(true); setErr(null);
    try {
      await API.hotel.createReservation({
        roomId: f.roomId, guestName: f.guestName.trim(), guestPhone: f.guestPhone || undefined,
        checkInDate: f.checkInDate, checkOutDate: f.checkOutDate,
        adults: Number(f.adults) || 1, children: Number(f.children) || 0,
        ratePerNight: Number(f.ratePerNight) > 0 ? Number(f.ratePerNight) : undefined,
        depositPaid: Number(f.depositPaid) > 0 ? Number(f.depositPaid) : 0,
        specialRequests: f.specialRequests || undefined,
      });
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not create reservation.'); } finally { setBusy(false); }
  }

  return (
    <Modal T={T} title="New reservation" subtitle="Book a room for a guest" width={600} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Booking…' : `Book${est > 0 ? ' · ' + money(est) : ''}`}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Room" full>
          <SelectField T={T} value={f.roomId} options={['', ...free.map((r: any) => r.id)]} onChange={(v: any) => set('roomId', v)}
            render={(v: any) => { if (!v) return free.length ? 'Select an available room…' : 'No available rooms'; const r = rooms.find((x: any) => x.id === v); return r ? `${r.number} · ${(r.roomType && r.roomType.name) || ''} · ${money(r.roomType ? r.roomType.baseRate : 0)}/night` : v; }} />
        </Field>
        <Field T={T} label="Guest name"><TextField T={T} value={f.guestName} onChange={(v: any) => set('guestName', v)} placeholder="Full name" /></Field>
        <Field T={T} label="Guest phone"><TextField T={T} value={f.guestPhone} onChange={(v: any) => set('guestPhone', v)} placeholder="optional" /></Field>
        <Field T={T} label="Check-in"><TextField T={T} type="date" value={f.checkInDate} onChange={(v: any) => set('checkInDate', v)} /></Field>
        <Field T={T} label="Check-out"><TextField T={T} type="date" value={f.checkOutDate} onChange={(v: any) => set('checkOutDate', v)} /></Field>
        <Field T={T} label="Adults"><TextField T={T} type="number" value={f.adults} onChange={(v: any) => set('adults', v)} /></Field>
        <Field T={T} label="Children"><TextField T={T} type="number" value={f.children} onChange={(v: any) => set('children', v)} /></Field>
        <Field T={T} label={`Rate / night${baseRate ? ' (base ' + money(baseRate) + ')' : ''}`}><TextField T={T} type="number" value={f.ratePerNight} onChange={(v: any) => set('ratePerNight', v)} placeholder={baseRate ? String(baseRate) : '0'} /></Field>
        <Field T={T} label="Deposit paid"><TextField T={T} type="number" value={f.depositPaid} onChange={(v: any) => set('depositPaid', v)} placeholder="0" /></Field>
        <Field T={T} label="Special requests" full><TextField T={T} value={f.specialRequests} onChange={(v: any) => set('specialRequests', v)} placeholder="optional" /></Field>
      </FormGrid>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.inkSub }}>
        <span>{nights} night{nights === 1 ? '' : 's'} × {money(rate)}</span><b style={{ fontFamily: T.fMono, color: T.ink }}>{money(est)}</b>
      </div>
      {err && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

// ── Room type / room creation ─────────────────────────────────────
function RoomTypeModal({ T, onClose, onSaved }: { T: Theme; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useS<any>({ name: '', baseRate: '', maxOccupancy: 2, bedConfiguration: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.name.trim()) { setErr('Name is required.'); return; }
    if (!(Number(f.baseRate) >= 0)) { setErr('Enter a base rate.'); return; }
    setBusy(true); setErr(null);
    try { await API.hotel.createRoomType({ name: f.name.trim(), baseRate: Number(f.baseRate) || 0, maxOccupancy: Number(f.maxOccupancy) || 2, bedConfiguration: f.bedConfiguration || undefined }); onSaved(); }
    catch (e: any) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="New room type" width={480} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add room type'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Name" full><TextField T={T} value={f.name} onChange={(v: any) => set('name', v)} placeholder="e.g. Deluxe Double" /></Field>
        <Field T={T} label="Base rate / night"><TextField T={T} type="number" value={f.baseRate} onChange={(v: any) => set('baseRate', v)} placeholder="0" /></Field>
        <Field T={T} label="Max occupancy"><TextField T={T} type="number" value={f.maxOccupancy} onChange={(v: any) => set('maxOccupancy', v)} /></Field>
        <Field T={T} label="Bed configuration" full><TextField T={T} value={f.bedConfiguration} onChange={(v: any) => set('bedConfiguration', v)} placeholder="e.g. 1 queen + 1 sofa" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function RoomModal({ T, roomTypes, onClose, onSaved }: { T: Theme; roomTypes: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useS<any>({ roomTypeId: '', number: '', floor: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.roomTypeId) { setErr('Pick a room type.'); return; }
    if (!f.number.trim()) { setErr('Room number is required.'); return; }
    setBusy(true); setErr(null);
    try { await API.hotel.createRoom({ roomTypeId: f.roomTypeId, number: f.number.trim(), floor: f.floor !== '' ? Number(f.floor) : undefined }); onSaved(); }
    catch (e: any) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="New room" width={460} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy || roomTypes.length === 0}>{busy ? 'Saving…' : 'Add room'}</Btn></>}>
      {roomTypes.length === 0
        ? <div style={{ fontSize: 13, color: T.inkSub }}>Add a room type first.</div>
        : <FormGrid>
            <Field T={T} label="Room type" full><SelectField T={T} value={f.roomTypeId} options={['', ...roomTypes.map((rt: any) => rt.id)]} onChange={(v: any) => set('roomTypeId', v)} render={(v: any) => v ? (roomTypes.find((rt: any) => rt.id === v) || {}).name : 'Select type…'} /></Field>
            <Field T={T} label="Room number"><TextField T={T} value={f.number} onChange={(v: any) => set('number', v)} placeholder="e.g. 101" /></Field>
            <Field T={T} label="Floor"><TextField T={T} type="number" value={f.floor} onChange={(v: any) => set('floor', v)} placeholder="optional" /></Field>
          </FormGrid>}
      {err && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function RoomActionModal({ T, room, onClose, onPick }: { T: Theme; room: any; onClose: () => void; onPick: (s: string) => void }) {
  const guest = (room.reservations && room.reservations[0] && room.reservations[0].guest) || null;
  return (
    <Modal T={T} title={`Room ${room.number}`} subtitle={`${(room.roomType && room.roomType.name) || ''}${guest ? ' · ' + guest.name : ''}`} width={420} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn></>}>
      <div style={{ fontSize: 12, color: T.inkSub, marginBottom: 10 }}>Current status: <Badge T={T} tone={ROOM_TONE[room.status] || 'gray'}>{room.status}</Badge></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {ROOM_STATUSES.filter((s) => s !== room.status).map((s) => (
          <button key={s} onClick={() => onPick(s)} style={{ padding: '10px 12px', borderRadius: T.r, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid, cursor: 'pointer', fontFamily: T.fBody, fontSize: 13, fontWeight: 600, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: toneColor(T, ROOM_TONE[s]) }} />{s}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.inkMute, marginTop: 12 }}>Setting a room to cleaning or checkout opens a housekeeping task automatically.</div>
    </Modal>
  );
}

// ── Corporate account + month-end invoice ─────────────────────────
function CorporateModal({ T, onClose, onSaved }: { T: Theme; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useS<any>({ companyName: '', contactPerson: '', phone: '', email: '', creditLimit: '', paymentTermsDays: 30, negotiatedRate: '' });
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.companyName.trim()) { setErr('Company name is required.'); return; }
    setBusy(true); setErr(null);
    try {
      await API.hotel.createCorporate({
        companyName: f.companyName.trim(), contactPerson: f.contactPerson || undefined, phone: f.phone || undefined, email: f.email || undefined,
        creditLimit: Number(f.creditLimit) || 0, paymentTermsDays: Number(f.paymentTermsDays) || 30,
        negotiatedRate: Number(f.negotiatedRate) > 0 ? Number(f.negotiatedRate) : undefined,
      });
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Modal T={T} title="New corporate account" subtitle="Negotiated-rate company billing" width={520} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} kind="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add account'}</Btn></>}>
      <FormGrid>
        <Field T={T} label="Company name" full><TextField T={T} value={f.companyName} onChange={(v: any) => set('companyName', v)} placeholder="e.g. Dahabshiil Group" /></Field>
        <Field T={T} label="Contact person"><TextField T={T} value={f.contactPerson} onChange={(v: any) => set('contactPerson', v)} placeholder="optional" /></Field>
        <Field T={T} label="Phone"><TextField T={T} value={f.phone} onChange={(v: any) => set('phone', v)} placeholder="optional" /></Field>
        <Field T={T} label="Email"><TextField T={T} type="email" value={f.email} onChange={(v: any) => set('email', v)} placeholder="optional" /></Field>
        <Field T={T} label="Credit limit"><TextField T={T} type="number" value={f.creditLimit} onChange={(v: any) => set('creditLimit', v)} placeholder="0" /></Field>
        <Field T={T} label="Payment terms (days)"><TextField T={T} type="number" value={f.paymentTermsDays} onChange={(v: any) => set('paymentTermsDays', v)} /></Field>
        <Field T={T} label="Negotiated nightly rate"><TextField T={T} type="number" value={f.negotiatedRate} onChange={(v: any) => set('negotiatedRate', v)} placeholder="optional" /></Field>
      </FormGrid>
      {err && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function InvoiceModal({ T, account, onClose }: { T: Theme; account: any; onClose: () => void }) {
  const now = new Date();
  const [month, setMonth] = useS(String(now.getMonth() + 1));
  const [year, setYear] = useS(String(now.getFullYear()));
  const [inv, setInv] = useS<any>(null);
  const [busy, setBusy] = useS(false); const [err, setErr] = useS<any>(null);
  const run = useCb(() => { setBusy(true); setErr(null); API.hotel.corporateInvoice(account.id, { month, year }).then(setInv).catch((e: any) => setErr(e.message)).finally(() => setBusy(false)); }, [account.id, month, year]);
  useE(() => { run(); }, [run]);
  return (
    <Modal T={T} title={`Invoice · ${account.companyName}`} subtitle="Month-end statement of stays" width={600} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn></>}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 14 }}>
        <div style={{ width: 110 }}><Field T={T} label="Month"><TextField T={T} type="number" value={month} onChange={setMonth} /></Field></div>
        <div style={{ width: 120 }}><Field T={T} label="Year"><TextField T={T} type="number" value={year} onChange={setYear} /></Field></div>
        <Btn T={T} kind="ghost" onClick={run} disabled={busy}>{busy ? '…' : 'Run'}</Btn>
      </div>
      {err && <div style={{ padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
      {inv && (<>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {[['Charges', money(inv.total_charges || 0)], ['Payments', money(inv.total_payments || 0)], ['Balance due', money(inv.balance_due || 0)]].map(([k, v]: any, i: number) => (
            <div key={i} style={{ flex: 1, minWidth: 120, background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '12px 14px' }}>
              <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{k}</div>
              <div style={{ fontFamily: T.fMono, fontSize: 18, color: k === 'Balance due' && Number(inv.balance_due) > 0 ? T.redText : T.ink, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: T.inkSub, marginBottom: 8 }}>{(inv.reservations || []).length} stay(s) · {inv.period && `${inv.period.from} → ${inv.period.to}`}</div>
        <Panel T={T} pad={false}>
          <table style={tbl}><thead><tr>{['Guest', 'Room', 'Stay', 'Charge'].map((h, i) => <th key={i} style={th(T, i === 3)}>{h}</th>)}</tr></thead>
            <tbody>{(inv.reservations || []).map((r: any) => (
              <tr key={r.id}>
                <td style={td(T)}>{(r.guest && r.guest.name) || '—'}</td>
                <td style={td(T)}>{(r.room && r.room.number) || '—'}</td>
                <td style={td(T)}><span style={{ fontFamily: T.fMono, fontSize: 11.5 }}>{dstr(r.checkInDate)} → {dstr(r.checkOutDate)}</span></td>
                <td style={{ ...td(T), textAlign: 'right', fontFamily: T.fMono }}>{money(r.totalRoomCharge || 0)}</td>
              </tr>
            ))}{(inv.reservations || []).length === 0 && <tr><td colSpan={4} style={empty(T)}>No stays in this period.</td></tr>}</tbody></table>
        </Panel>
      </>)}
    </Modal>
  );
}

// ── Folio: charges + payments → balance ───────────────────────────
function FolioModal({ T, folioId, onClose, onChanged, show }: { T: Theme; folioId: any; onClose: () => void; onChanged: () => void; show: (m: string) => void }) {
  const [folio, setFolio] = useS<any>(null);
  const [busy, setBusy] = useS(false);
  const [pane, setPane] = useS<any>(null);   // 'charge' | 'payment'
  const [c, setC] = useS<any>({ type: 'restaurant', description: '', quantity: '1', unitAmount: '' });
  const [p, setP] = useS<any>({ provider: 'cash', amount: '' });
  const [err, setErr] = useS<any>(null);

  const reload = useCb(() => API.hotel.folio(folioId).then(setFolio).catch((e: any) => setErr(e.message)), [folioId]);
  useE(() => { reload(); }, [reload]);

  async function addCharge() {
    if (!c.description.trim() || !(Number(c.unitAmount) > 0)) { setErr('Description and amount are required.'); return; }
    setBusy(true); setErr(null);
    try { await API.hotel.addCharge(folioId, { type: c.type, description: c.description.trim(), quantity: Number(c.quantity) || 1, unitAmount: Number(c.unitAmount), chargeDate: today() }); setC({ type: 'restaurant', description: '', quantity: '1', unitAmount: '' }); setPane(null); reload(); onChanged(); show('Charge posted'); }
    catch (e: any) { setErr(e.message || 'Could not post charge.'); } finally { setBusy(false); }
  }
  async function recordPayment() {
    if (!(Number(p.amount) > 0)) { setErr('Enter a payment amount.'); return; }
    setBusy(true); setErr(null);
    try { await API.hotel.folioPayment(folioId, { provider: p.provider, amount: Number(p.amount) }); setP({ provider: 'cash', amount: '' }); setPane(null); reload(); onChanged(); show('Payment recorded'); }
    catch (e: any) { setErr(e.message || 'Could not record payment.'); } finally { setBusy(false); }
  }

  const balance = folio ? Number(folio.balance || 0) : 0;
  return (
    <Modal T={T} title={folio ? `Folio ${folio.folioNumber || ''}` : 'Folio'} subtitle={(folio && folio.guest && folio.guest.name) || ''} width={620} onClose={onClose}
      footer={<><div style={{ flex: 1 }} /><Btn T={T} kind="ghost" onClick={onClose}>Close</Btn></>}>
      {!folio ? <div style={empty(T)}>Loading folio…</div> : (<>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          {[['Charges', money(folio.totalCharges || 0)], ['Payments', money(folio.totalPayments || 0)], ['Balance', money(balance)]].map(([k, v]: any, i: number) => (
            <div key={i} style={{ flex: 1, minWidth: 120, background: T.card, border: `1px solid ${T.line}`, borderRadius: T.rLg, padding: '12px 14px' }}>
              <div style={{ fontSize: 10.5, color: T.inkSub, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{k}</div>
              <div style={{ fontFamily: T.fMono, fontSize: 18, color: k === 'Balance' && balance > 0 ? T.redText : T.ink, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Btn T={T} kind="ghost" onClick={() => { setPane(pane === 'charge' ? null : 'charge'); setErr(null); }}>+ Charge</Btn>
          <Btn T={T} kind="ghost" onClick={() => { setPane(pane === 'payment' ? null : 'payment'); setErr(null); }}>+ Payment</Btn>
        </div>
        {pane === 'charge' && (
          <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, padding: 12, marginBottom: 12 }}>
            <FormGrid>
              <Field T={T} label="Type"><SelectField T={T} value={c.type} options={CHARGE_TYPES} onChange={(v: any) => setC((s: any) => ({ ...s, type: v }))} render={(v: any) => v.replace('_', ' ')} /></Field>
              <Field T={T} label="Amount"><TextField T={T} type="number" value={c.unitAmount} onChange={(v: any) => setC((s: any) => ({ ...s, unitAmount: v }))} placeholder="0.00" /></Field>
              <Field T={T} label="Quantity"><TextField T={T} type="number" value={c.quantity} onChange={(v: any) => setC((s: any) => ({ ...s, quantity: v }))} /></Field>
              <Field T={T} label="Description" full><TextField T={T} value={c.description} onChange={(v: any) => setC((s: any) => ({ ...s, description: v }))} placeholder="e.g. Dinner — table 4" /></Field>
            </FormGrid>
            <div style={{ marginTop: 10, textAlign: 'right' }}><Btn T={T} kind="accent" onClick={addCharge} disabled={busy}>{busy ? 'Posting…' : 'Post charge'}</Btn></div>
          </div>
        )}
        {pane === 'payment' && (
          <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, padding: 12, marginBottom: 12 }}>
            <FormGrid>
              <Field T={T} label="Method"><SelectField T={T} value={p.provider} options={['cash', 'zaad']} onChange={(v: any) => setP((s: any) => ({ ...s, provider: v }))} render={(v: any) => v === 'cash' ? 'Cash' : 'Zaad'} /></Field>
              <Field T={T} label="Amount"><TextField T={T} type="number" value={p.amount} onChange={(v: any) => setP((s: any) => ({ ...s, amount: v }))} placeholder={balance > 0 ? String(balance) : '0.00'} /></Field>
            </FormGrid>
            <div style={{ marginTop: 10, textAlign: 'right' }}><Btn T={T} kind="accent" onClick={recordPayment} disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</Btn></div>
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, margin: '4px 0 6px' }}>Charges</div>
        <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden', marginBottom: 12 }}>
          {(folio.charges || []).map((ch: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}>
              <span style={{ color: T.ink }}>{ch.description}<span style={{ color: T.inkMute }}> · {(ch.type || '').replace('_', ' ')}{Number(ch.quantity) > 1 ? ` ×${ch.quantity}` : ''}</span></span>
              <span style={{ fontFamily: T.fMono, color: T.ink }}>{money(ch.totalAmount)}</span>
            </div>
          ))}
          {(folio.charges || []).length === 0 && <div style={{ padding: 14, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>No charges yet.</div>}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.inkSub, margin: '4px 0 6px' }}>Payments</div>
        <div style={{ border: `1px solid ${T.line}`, borderRadius: T.r, overflow: 'hidden' }}>
          {(folio.payments || []).map((pm: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}>
              <span style={{ color: T.inkMid }}>{String(pm.provider || '').toUpperCase()}</span>
              <span style={{ fontFamily: T.fMono, color: T.green }}>−{money(pm.amount)}</span>
            </div>
          ))}
          {(folio.payments || []).length === 0 && <div style={{ padding: 14, textAlign: 'center', color: T.inkMute, fontSize: 12.5 }}>No payments yet.</div>}
        </div>
      </>)}
      {err && <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: T.r, background: T.redSoft, color: T.redText, fontSize: 12.5 }}>⚠ {err}</div>}
    </Modal>
  );
}

function toneColor(T: Theme, tone: string): string {
  const map: any = { green: T.green, red: T.red, blue: T.blue, amber: T.amber, violet: T.violet, gray: T.lineMid };
  return map[tone] || T.lineMid;
}

const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th = (T: Theme, right?: boolean): React.CSSProperties => ({ textAlign: right ? 'right' : 'left', padding: '11px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` });
const td = (T: Theme): React.CSSProperties => ({ padding: '12px 18px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: T.inkMid });
const empty = (T: Theme): React.CSSProperties => ({ padding: 40, textAlign: 'center', color: T.inkMute, fontSize: 13 });
function mini(T: Theme): React.CSSProperties { return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${T.line}`, background: T.paper, color: T.inkMid }; }
