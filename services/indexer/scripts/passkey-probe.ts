/**
 * Live check that the Sui network accepts ReeF passkey wallets. Read-only: it
 * asks a node to judge signatures and never sends a transaction.
 *
 *   pnpm --filter @umbra/indexer passkey:probe <mainnet|testnet>
 *
 * A browser passkey can't be driven from a script, so this uses the software
 * authenticator (src/dev/software-passkey.ts), which signs the way a phone
 * does. The wallet code under test is the app's own (`passkey` in @umbra/core):
 *   1. the check the app makes when a wallet is created: sign the check message,
 *      then ask a node whether that signature belongs to the wallet's address
 *   2. the node refuses the same signature for another address or another message
 *   3. the node accepts the wallet's signature over transaction bytes
 * Nothing here can touch a real account: the key is made fresh and thrown away.
 *
 * For a passkey-signed transaction really executing, see `sponsor:smoke`
 * (testnet, gas paid by the sponsor). The testnet faucet no longer answers
 * scripts, so this one can't fund a wallet to send from.
 */
import process from "node:process";
import { randomBytes } from "node:crypto";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { toBase58 } from "@mysten/sui/utils";
import { createSuiClient, passkey, wallet } from "@umbra/core";
import { SoftwarePasskeyProvider } from "../src/dev/software-passkey";

const network = wallet.parseWalletNetwork(process.argv[2]);
if (!network) {
  console.error("usage: passkey:probe <mainnet|testnet>");
  process.exit(2);
}

const config = wallet.walletConfig(network);
const client = createSuiClient(config);

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

/** A throwaway wallet on a software authenticator. */
function softwareWallet() {
  const device = new SoftwarePasskeyProvider("https://reef-web-one.vercel.app");
  return { device, wallet: passkey.passkeyWalletFrom(device.publicKey, new Uint8Array(randomBytes(16))) };
}

const mine = softwareWallet();
const other = softwareWallet();
console.log(`passkey wallet on ${network}: ${mine.wallet.address}`);

// 1. what the app does before it lets anyone receive money at a new wallet
console.log("\n1. The new-wallet check");
const proof = await passkey.signPasskeyCheck(mine.wallet, mine.device);
await passkey.confirmPasskey(client, mine.wallet, proof).then(
  () => check("the network confirms the passkey signs for its address", true),
  (e: unknown) => check("the network confirms the passkey signs for its address", false, e instanceof Error ? e.message : String(e)),
);

// 2. the node is really checking, not waving everything through
console.log("\n2. The network refuses what it should");
const wrongAddress = await passkey.networkVerifiesSignature(client, {
  scope: "PersonalMessage",
  bytes: passkey.PASSKEY_CHECK_MESSAGE,
  signature: proof,
  address: other.wallet.address,
});
check("the same signature for another wallet's address", !wrongAddress.valid, wrongAddress.reason.slice(0, 70));
const wrongMessage = await passkey.networkVerifiesSignature(client, {
  scope: "PersonalMessage",
  bytes: new TextEncoder().encode("some other message"),
  signature: proof,
  address: mine.wallet.address,
});
check("the same signature for another message", !wrongMessage.valid, wrongMessage.reason.slice(0, 70));
await passkey.confirmPasskey(client, mine.wallet, await passkey.signPasskeyCheck(other.wallet, other.device)).then(
  () => check("the app's check on another passkey's signature", false, "it passed"),
  (e: unknown) => check("the app's check on another passkey's signature", e instanceof passkey.PasskeyError && e.code === "not-confirmed"),
);

// 3. a transaction signature (built offline: verifying it needs no coins)
console.log("\n3. A transaction signed by the passkey");
const recipient = new Ed25519Keypair().toSuiAddress();
const offline = new Transaction();
offline.setSender(mine.wallet.address);
offline.setGasPrice(1000);
offline.setGasBudget(5_000_000);
offline.setGasPayment([{ objectId: `0x${"ab".repeat(32)}`, version: "1", digest: toBase58(new Uint8Array(32).fill(7)) }]);
offline.transferObjects([offline.splitCoins(offline.gas, [1])], recipient);
const offlineBytes = await offline.build();
const offlineSig = await passkey.signTransactionWithPasskey(mine.wallet, mine.device, offlineBytes);
const txMine = await passkey.networkVerifiesSignature(client, { scope: "TransactionData", bytes: offlineBytes, signature: offlineSig, address: mine.wallet.address });
check("the network accepts the wallet's signature over transaction bytes", txMine.valid, txMine.reason.slice(0, 70));
const txOther = await passkey.networkVerifiesSignature(client, { scope: "TransactionData", bytes: offlineBytes, signature: offlineSig, address: other.wallet.address });
check("and refuses it for another wallet's address", !txOther.valid);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
