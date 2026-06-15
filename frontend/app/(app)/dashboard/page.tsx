'use client';
import { useRouter } from 'next/navigation';
import { useTheme, Topbar } from '@/components/shell';
import { Btn, Badge, StatCard, Panel, methodTone } from '@/components/kit';
import { money, money0, timeAgo } from '@/lib/theme';
import { DASH, BUSINESS, SALES } from '@/lib/data';

export default function DashboardPage() {
  const T = useTheme();
  const router = useRouter();
  return <Dashboard T={T} setScreen={(s: string) => router.push('/' + s)} />;
}

// ─────────────────────────────────────────────────────────────────
// Dashboard — hero metrics, hourly bars, payment split, top products,
// recent sales. Calm, scannable, warm.
// ─────────────────────────────────────────────────────────────────
function Dashboard({ T, setScreen }: { T: any; setScreen: (s: string) => void }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const maxH = Math.max(...DASH.hourly);
  const payTotal = DASH.byPayment.reduce((s: number, p: any) => s + p.value, 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.paperAlt }}>
      <Topbar T={T} title={`${greeting}, Amina`} subtitle={`${today} · ${BUSINESS.name}, ${BUSINESS.branch}`}
        right={<>
          <Btn T={T} kind="ghost">⤓ Export</Btn>
          <Btn T={T} kind="accent" onClick={() => setScreen('pos')}>⊞ New Sale</Btn>
        </>} />

      <div style={{ padding: 28, maxWidth: 1340, margin: '0 auto' }}>
        {/* low-stock alert */}
        {DASH.lowStock > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderRadius: T.r, background: T.amberSoft, border: `1px solid ${T.amber}33`, marginBottom: 20 }}>
            <span style={{ fontSize: 16 }}>⚠</span>
            <span style={{ fontSize: 13, color: T.amberText, fontWeight: 600 }}>{DASH.lowStock} products are running low on stock.</span>
            <button onClick={() => setScreen('products')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.amberText, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: T.fBody }}>Review stock →</button>
          </div>
        )}

        {/* hero metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 18 }}>
          <StatCard T={T} big label="Today's Revenue" value={money(DASH.salesToday)} trend={DASH.salesTrend} sub={`${DASH.txToday} transactions`} accent={T.green} />
          <StatCard T={T} big label="This Month" value={money0(DASH.salesMonth)} trend={DASH.monthTrend} sub="vs. last month" accent={T.navyLight} />
          <StatCard T={T} big label="Avg. Basket" value={money(DASH.avgBasket)} trend={DASH.basketTrend} sub="per transaction" accent={T.accent.base} />
          <StatCard T={T} big label="Stock Value" value={money0(DASH.stockValue)} sub={`${DASH.products} products`} accent={T.violet} />
        </div>

        {/* row: hourly chart + payment split */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 18 }}>
          <Panel T={T} title="Sales Today by Hour" pad={false} action={<span style={{ fontSize: 11.5, color: T.inkSub }}>8:00 – 21:00</span>}>
            <div style={{ padding: '22px 20px 16px', display: 'flex', alignItems: 'flex-end', gap: 8, height: 200 }}>
              {DASH.hourly.map((v: number, i: number) => {
                const peak = v === maxH;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, height: '100%', justifyContent: 'flex-end' }}>
                    <div title={money0(v * 9.3)} style={{
                      width: '100%', maxWidth: 26, height: `${(v / maxH) * 100}%`, borderRadius: '6px 6px 3px 3px',
                      background: peak ? `linear-gradient(to top, ${T.accent.base}, ${T.accent.bright})` : T.navyLight,
                      opacity: peak ? 1 : 0.82, transition: 'height .5s ease',
                    }} />
                    <span style={{ fontSize: 9.5, color: T.inkMute, fontFamily: T.fMono }}>{8 + i}</span>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel T={T} title="Today by Payment">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              {DASH.byPayment.map((p: any) => {
                const pct = Math.round((p.value / payTotal) * 100);
                return (
                  <div key={p.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12.5, color: T.inkSub, display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color }} />{p.label}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.fMono }}>{money(p.value)}</span>
                    </div>
                    <div style={{ height: 7, background: T.paperSink, borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: p.color, borderRadius: 99, transition: 'width .6s ease' }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 13, marginTop: 2, borderTop: `1px dashed ${T.lineMid}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.inkMid, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total today</span>
                <span style={{ fontSize: 16, fontWeight: 500, color: T.ink, fontFamily: T.fMono, letterSpacing: '-0.5px' }}>{money(payTotal)}</span>
              </div>
            </div>
          </Panel>
        </div>

        {/* row: recent sales + top products */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
          <Panel T={T} title="Recent Sales" pad={false} action={<button onClick={() => setScreen('sales')} style={{ background: 'none', border: 'none', color: T.accent.base, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: T.fBody }}>View all →</button>}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Order', 'Customer', 'Payment', 'Amount', 'Time'].map((h, i) => (
                <th key={h} style={{ textAlign: i > 2 ? 'right' : 'left', padding: '10px 20px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkSub, background: T.paperAlt, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {SALES.slice(0, 6).map((s: any) => (
                  <tr key={s.id}>
                    <td style={{ padding: '11px 20px', borderBottom: `1px solid ${T.line}`, fontFamily: T.fMono, fontSize: 12, fontWeight: 600, color: T.accent.text }}>{s.id}</td>
                    <td style={{ padding: '11px 20px', borderBottom: `1px solid ${T.line}`, fontSize: 13, color: s.customer === 'Walk-in' ? T.inkMute : T.ink }}>{s.customer}</td>
                    <td style={{ padding: '11px 20px', borderBottom: `1px solid ${T.line}` }}><Badge T={T} tone={methodTone(s.method)}>{s.methodLabel}</Badge></td>
                    <td style={{ padding: '11px 20px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontFamily: T.fMono, fontSize: 13, fontWeight: 600, color: T.ink }}>{money(s.total)}</td>
                    <td style={{ padding: '11px 20px', borderBottom: `1px solid ${T.line}`, textAlign: 'right', fontSize: 12, color: T.inkSub }}>{timeAgo(s.minsAgo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel T={T} title="Top Products This Month" pad={false}>
            <div style={{ padding: '6px 0' }}>
              {DASH.topProducts.map((p: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 20px' }}>
                  <span style={{ width: 24, height: 24, borderRadius: 7, background: i === 0 ? T.accent.soft : T.paperSink, color: i === 0 ? T.accent.text : T.inkSub, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, fontFamily: T.fMono, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.ink, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: T.inkSub, fontFamily: T.fMono, marginTop: 1 }}>{p.qty} sold</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.fMono }}>{money(p.revenue)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
