import { useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { Card, Button, Input, useTheme } from '@/components/ui';
import { PAIRS, MOCK_BOOKS, MOCK_PREDICTIONS, type MockPrediction } from '@/lib/mock';
import { useTopInset } from '@/components/screen';

const fmtPrice = (p: number) =>
  p === 0 ? '—' : p < 1 ? p.toPrecision(4) : p.toLocaleString(undefined, { maximumFractionDigits: 4 });
const fmtSize = (s: number) => s.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function TradeTab() {
  const t = useTheme();
  const top = useTopInset();
  const [mode, setMode] = useState<'trade' | 'predict'>('trade');

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[styles.container, { paddingTop: top + 16 }]}
    >
      {/* Mode toggle */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.ink }]}>
          {mode === 'trade' ? 'Trade' : 'Predict'}
        </Text>
        <View style={[styles.toggleWrap, { backgroundColor: t.surfaceMuted }]}>
          {(['trade', 'predict'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.toggleBtn, mode === m && { backgroundColor: t.ink }]}
            >
              <Text
                style={[
                  styles.toggleLabel,
                  { color: mode === m ? t.onInk : t.inkSoft },
                ]}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {mode === 'trade' ? <Terminal /> : <PredictFeed />}
    </ScrollView>
  );
}

function Terminal() {
  const t = useTheme();
  const [pairKey, setPairKey] = useState<string>(PAIRS[0].key);
  const pair = PAIRS.find((p) => p.key === pairKey) ?? PAIRS[0];
  const book = MOCK_BOOKS[pairKey] ?? MOCK_BOOKS[PAIRS[0].key]!;
  const { asks, bids, mid } = book;
  const spread = bids[0] && asks[0] ? asks[0].price - bids[0].price : 0;
  const maxSize = Math.max(1, ...asks.map((l) => l.size), ...bids.map((l) => l.size));

  return (
    <View style={{ gap: 16, marginTop: 16 }}>
      {/* Pair selector + mid */}
      <Card style={styles.midCard}>
        <View style={styles.pairRow}>
          {PAIRS.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => setPairKey(p.key)}
              style={[
                styles.pairChip,
                { borderColor: t.border, backgroundColor: pairKey === p.key ? t.ink : t.surfaceGlass },
              ]}
            >
              <Text style={{ color: pairKey === p.key ? t.onInk : t.ink, fontSize: 13, fontWeight: '600' }}>
                {p.base}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.midRight}>
          <Text style={{ color: t.inkSoft, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Mid price
          </Text>
          <Text style={{ color: t.ink, fontSize: 22, fontWeight: '500', fontVariant: ['tabular-nums'] }}>
            {fmtPrice(mid)}{' '}
            <Text style={{ fontSize: 14, color: t.inkSoft }}>{pair.quote}</Text>
          </Text>
        </View>
      </Card>

      {/* Order book */}
      <Card style={{ padding: 16 }}>
        <View style={styles.bookHeader}>
          <Text style={{ color: t.inkFaint, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>
            Price ({pair.quote})
          </Text>
          <Text style={{ color: t.inkFaint, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>
            Size ({pair.base})
          </Text>
        </View>
        {/* Asks reversed */}
        {[...asks].reverse().map((l, i) => (
          <BookRow key={`a${i}`} price={l.price} size={l.size} side="ask" max={maxSize} />
        ))}
        {/* Mid line */}
        <View style={[styles.midRow, { backgroundColor: t.surfaceMuted }]}>
          <Text style={{ color: t.ink, fontWeight: '500', fontVariant: ['tabular-nums'] }}>
            {fmtPrice(mid)}
          </Text>
          {spread > 0 ? (
            <Text style={{ color: t.inkSoft, fontSize: 12 }}>spread {fmtPrice(spread)}</Text>
          ) : null}
        </View>
        {/* Bids */}
        {bids.map((l, i) => (
          <BookRow key={`b${i}`} price={l.price} size={l.size} side="bid" max={maxSize} />
        ))}
      </Card>

      {/* Trade panel */}
      <TradePanel pair={pair} mid={mid} />
    </View>
  );
}

function BookRow({ price, size, side, max }: { price: number; size: number; side: 'ask' | 'bid'; max: number }) {
  const t = useTheme();
  const color = side === 'ask' ? t.danger : t.accent;
  const pct = (size / max) * 100;
  return (
    <View style={styles.bookRowWrap}>
      <View style={[styles.bookRowBar, { width: `${pct}%` as any, backgroundColor: color, opacity: 0.15 }]} />
      <Text style={[styles.bookPrice, { color }]}>{fmtPrice(price)}</Text>
      <Text style={[styles.bookSize, { color: t.inkSoft }]}>{fmtSize(size)}</Text>
    </View>
  );
}

function TradePanel({ pair, mid }: { pair: { base: string; quote: string }; mid: number }) {
  const t = useTheme();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState(String(Number(mid.toPrecision(4))));
  const [amount, setAmount] = useState('');

  return (
    <Card style={{ padding: 16, gap: 12 }}>
      {/* Buy / Sell toggle */}
      <View style={[styles.toggleWrap, { backgroundColor: t.surfaceMuted }]}>
        {(['buy', 'sell'] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => setSide(s)}
            style={[
              styles.toggleBtn,
              side === s && { backgroundColor: s === 'buy' ? t.accent : t.danger },
            ]}
          >
            <Text
              style={[
                styles.toggleLabel,
                { color: side === s ? '#fff' : t.inkSoft },
              ]}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Limit / Market */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        {(['limit', 'market'] as const).map((tp) => (
          <Pressable key={tp} onPress={() => setType(tp)}>
            <Text
              style={{
                color: type === tp ? t.ink : t.inkFaint,
                fontWeight: type === tp ? '600' : '400',
                fontSize: 14,
                textTransform: 'capitalize',
              }}
            >
              {tp}
            </Text>
          </Pressable>
        ))}
      </View>

      {type === 'limit' ? (
        <View>
          <Text style={{ color: t.inkSoft, fontSize: 12, marginBottom: 4 }}>
            Price ({pair.quote})
          </Text>
          <Input
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
        </View>
      ) : null}

      <View>
        <Text style={{ color: t.inkSoft, fontSize: 12, marginBottom: 4 }}>
          Amount ({pair.base})
        </Text>
        <Input
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
        />
      </View>

      <Button
        variant={side === 'buy' ? 'accent' : 'danger'}
        onPress={() =>
          Alert.alert(
            'Coming soon',
            'Order placement needs a linked funded wallet + BalanceManager — wiring next.'
          )
        }
      >
        {side === 'buy' ? 'Buy' : 'Sell'} {pair.base}
      </Button>
      <Text style={{ color: t.inkFaint, fontSize: 12, textAlign: 'center' }}>
        Trading needs your linked funded wallet — wiring next.
      </Text>
    </Card>
  );
}

function PredictFeed() {
  const t = useTheme();
  return (
    <View style={{ gap: 12, marginTop: 16 }}>
      {MOCK_PREDICTIONS.map((p) => (
        <PredictCard key={p.id} prediction={p} />
      ))}
    </View>
  );
}

function PredictCard({ prediction: p }: { prediction: MockPrediction }) {
  const t = useTheme();
  const [voted, setVoted] = useState<'yes' | 'no' | null>(null);
  const daysLeft = Math.ceil((p.endsAt - Date.now()) / (24 * 3600 * 1000));

  function vote(v: 'yes' | 'no') {
    setVoted(v);
    Alert.alert('Coming soon', 'Prediction market oracle wiring is next.');
  }

  return (
    <Card style={{ padding: 16, gap: 10 }}>
      <View style={styles.predictMeta}>
        <Text style={{ color: t.accent, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>
          {p.category}
        </Text>
        <Text style={{ color: t.inkFaint, fontSize: 11 }}>{daysLeft}d left</Text>
      </View>
      <Text style={{ color: t.ink, fontSize: 15, fontWeight: '600', lineHeight: 22 }}>{p.question}</Text>

      {/* Probability bar */}
      <View style={[styles.probBar, { backgroundColor: t.surfaceMuted }]}>
        <View
          style={[styles.probFill, { width: `${p.yesProb * 100}%` as any, backgroundColor: t.accent }]}
        />
      </View>
      <View style={styles.probLabels}>
        <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600' }}>
          Yes {Math.round(p.yesProb * 100)}%
        </Text>
        <Text style={{ color: t.danger, fontSize: 13, fontWeight: '600' }}>
          No {Math.round((1 - p.yesProb) * 100)}%
        </Text>
      </View>

      <Text style={{ color: t.inkFaint, fontSize: 12 }}>
        Vol: ${(p.volume / 1000).toFixed(1)}k
      </Text>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          variant={voted === 'yes' ? 'accent' : 'outline'}
          size="sm"
          style={{ flex: 1 } as any}
          onPress={() => vote('yes')}
        >
          ▲ Yes
        </Button>
        <Button
          variant={voted === 'no' ? 'danger' : 'outline'}
          size="sm"
          style={{ flex: 1 } as any}
          onPress={() => vote('no')}
        >
          ▼ No
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700' },
  toggleWrap: { flexDirection: 'row', borderRadius: 100, padding: 4 },
  toggleBtn: { borderRadius: 100, paddingHorizontal: 16, paddingVertical: 6 },
  toggleLabel: { fontSize: 13, fontWeight: '600' },
  midCard: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  pairRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pairChip: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6 },
  midRight: { alignItems: 'flex-end' },
  bookHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  bookRowWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4, position: 'relative' },
  bookRowBar: { position: 'absolute', right: 0, top: 0, bottom: 0, borderRadius: 4 },
  bookPrice: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'], zIndex: 1 },
  bookSize: { fontSize: 13, fontVariant: ['tabular-nums'], zIndex: 1 },
  midRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginVertical: 2 },
  predictMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  probBar: { height: 6, borderRadius: 100, overflow: 'hidden' },
  probFill: { height: '100%', borderRadius: 100 },
  probLabels: { flexDirection: 'row', justifyContent: 'space-between' },
});
