'use client';
/**
 * HRM — small helpers shared across the HRM screens — avatars and the
 * filter/table chrome, plus the constant tables the modals render from.
 *
 * Split out of hrm-screen.tsx; see that file for the screen itself.
 */
import React from 'react';
import { money, money0 } from '@/lib/theme';
import { Btn, Badge, Panel, Modal, Field, TextField, SelectField, FormGrid, useToast } from '@/components/kit';
import { Topbar, useSession } from '@/components/shell';
import { API } from '@/lib/api';
import { LuUsers, LuPrinter, LuSettings, LuTriangleAlert, LuSearch, LuCheck, LuClock, LuHourglass, LuBanknote, LuListTodo, LuX, LuPlay } from 'react-icons/lu';
import { BUSINESS } from '@/lib/data';
import { todayLocal } from '@/lib/business-settings';
const { useState: useStateHr, useEffect: useEffectHr } = React;

// Doubles as the edit form: pass `employee` to load it and PUT instead of POST.
// The reference's Essentials-and-HRM settings, as a real tab rather than two
// modals hanging off other tabs.
export const SETTINGS_SECTIONS = ['Leave', 'Payroll', 'Attendance', 'Sales Targets', 'Essentials'];

export const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Bulk import. The CSV is parsed here and posted as rows, the same way sale
// invoices are imported, so the server can report which lines failed and why.
export const IMPORT_COLS = [
  ['1', 'Email', 'Required', 'Email id of the user'],
  ['2', 'Clock in time', 'Required', 'Clock in time in "Y-m-d H:i:s" format (2026-07-29 03:44:29)'],
  ['3', 'Clock out time', 'Optional', 'Clock out time in "Y-m-d H:i:s" format (2026-07-29 03:44:29)'],
  ['4', 'Clock in note', 'Optional', ''],
  ['5', 'Clock out note', 'Optional', ''],
  ['6', 'IP Address', 'Optional', ''],
];

export function hrInitials(name: any) { const p = String(name || '').trim().split(/\s+/); return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')) || '?'; }

export function hrAvatar(T: any, name: any, size: number): React.CSSProperties {
  const palette = ['#C8843C', '#3E7CB1', '#5B8A4C', '#A8557C', '#4D8B8B', '#B5793F'];
  let h = 0; for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return { width: size, height: size, flexShrink: 0, borderRadius: '50%', background: palette[h % palette.length], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fBody, fontSize: size * 0.4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' };
}

export function hrFilterSel(T: any): React.CSSProperties { return { padding: '8px 11px', fontSize: 12.5, fontFamily: T.fBody, color: T.ink, background: T.paper, border: `1.5px solid ${T.line}`, borderRadius: T.r, outline: 'none', cursor: 'pointer' }; }

export function hrMini(T: any, kind?: any): React.CSSProperties { const danger = kind === true, accent = kind === 'accent'; return { padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: T.fBody, fontSize: 12, fontWeight: 600, border: `1px solid ${accent ? T.accent.base : danger ? T.redSoft : T.line}`, background: accent ? T.accent.base : danger ? T.redSoft : T.paper, color: accent ? T.accent.on : danger ? T.redText : T.inkMid }; }
