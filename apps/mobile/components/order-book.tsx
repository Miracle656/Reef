import { Text, View } from "react-native";
import { palette } from "@umbra/ui";

interface Level {
  price: number;
  size: number;
}
interface Book {
  mid: number;
  bids: Level[];
  asks: Level[];
}

const fmtPrice = (p: number) => (p === 0 ? "—" : p < 1 ? p.toPrecision(4) : p.toLocaleString(undefined, { maximumFractionDigits: 4 }));
const fmtSize = (s: number) => s.toLocaleString(undefined, { maximumFractionDigits: 3 });

function Row({ price, size, side, max }: { price: number; size: number; side: "ask" | "bid"; max: number }) {
  const color = side === "ask" ? palette.light.danger : palette.light.accent;
  return (
    <View className="relative flex-row items-center justify-between px-2 py-1">
      <View style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${(size / max) * 100}%`, backgroundColor: color, opacity: 0.15, borderRadius: 6 }} />
      <Text style={{ color }} className="font-semibold tabular-nums">
        {fmtPrice(price)}
      </Text>
      <Text className="text-ink-soft tabular-nums">{fmtSize(size)}</Text>
    </View>
  );
}

export function OrderBook({ book, base, quote }: { book?: Book; base: string; quote: string }) {
  const asks = (book?.asks ?? []).slice(0, 8);
  const bids = (book?.bids ?? []).slice(0, 8);
  const mid = book?.mid ?? 0;
  const max = Math.max(1, ...asks.map((l) => l.size), ...bids.map((l) => l.size));
  const spread = bids[0] && asks[0] ? asks[0].price - bids[0].price : undefined;

  if (asks.length === 0 && bids.length === 0) {
    return <Text className="py-8 text-center text-sm text-ink-faint">No resting orders on this pool yet.</Text>;
  }

  return (
    <View>
      <View className="mb-2 flex-row justify-between px-2">
        <Text className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Price ({quote})</Text>
        <Text className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Size ({base})</Text>
      </View>

      {[...asks].reverse().map((l, i) => (
        <Row key={`a${i}`} price={l.price} size={l.size} side="ask" max={max} />
      ))}

      <View className="my-1 flex-row items-center justify-between rounded-lg bg-surface-muted px-2 py-1">
        <Text className="font-semibold tabular-nums text-ink">{fmtPrice(mid)}</Text>
        {spread != null ? <Text className="text-xs text-ink-soft">spread {fmtPrice(spread)}</Text> : null}
      </View>

      {bids.map((l, i) => (
        <Row key={`b${i}`} price={l.price} size={l.size} side="bid" max={max} />
      ))}
    </View>
  );
}
