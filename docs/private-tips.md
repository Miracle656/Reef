# Private tips and pay-in-DM (#13)

Users can send SUI or USDC to someone **from inside an encrypted DM**, with an
optional note. Tipping a post opens your DM with its author, with the pay sheet
already up (`/messages?to=<author>&pay=1&post=<postId>`).

## What's private and what isn't

| | Visible to |
|---|---|
| The note | **Only the sender and the recipient.** It's a `payment` message in their DM, and the Sui Stack Messaging SDK encrypts it end to end with Seal, like every other message |
| That a payment happened, the amount, the sender and the recipient | **Everyone.** It's an ordinary on-chain transfer |

The UI says this where it matters: *"Your note is private: only you and
@name can read it. The payment itself is on-chain."* The chat-list preview
shows the amount but never the note.

**Not doing**, per the research report: mixers, shielded pools, stealth
addresses, private order books, or anything else that hides who paid whom.
They give weak privacy for their cost, look like custody or mixing, and fit
badly with Nigeria's ISA 2025 and AML rules. Hiding amounts is Confidential
Transfers territory (#14).

## How it works

- `buildTipTx` (`packages/core/src/contracts/tip.ts`) moves the coin with `coinWithBalance(useGasCoin: false)`, so it spends the sender's own coins or address balance, never the sponsor's gas coin. That makes it gasless under both sponsors. Amounts are parsed with `toBaseUnits`, which uses exact decimal-to-bigint conversion and no floating point.
- After the transfer lands, the pay sheet sends `{ type: "payment", content: note, payment: { digest, coin, amount, to, postId? } }` into the DM. The payload rides the same encrypted envelope as text, polls and media (`app/messages/lib/sui-adapter.ts`).
- `PaymentCard` renders it with the amount, the note, and a lock line linking to the explorer.

Coins: **USDC** (`NEXT_PUBLIC_TIP_USDC_TYPE`; testnet default is the dUSDC that
the indexer faucet drips to new users; set Circle's native USDC on mainnet)
and **SUI**.

## Verified

- Unit tests: `packages/core/src/__tests__/tip.test.ts` covers amount parsing and formatting edge cases, and checks the builder never touches the gas coin.
- Live on testnet: a fresh sender tipped 0.01 SUI through the self-run sponsor (`8FFa1VWJ…`). The recipient got exactly 10,000,000 MIST, and the sender paid no gas.
