/**
 * BCS encoding helpers for our Move entry-function arguments.
 *
 * Our Move functions take raw `vector<u8>` (and `Option<vector<u8>>`,
 * `vector<vector<u8>>`, `Option<ID>`) rather than `std::string::String`, so we
 * serialize explicitly with BCS and pass the bytes via `tx.pure(...)`. This is
 * unambiguous across SDK versions.
 */
import { bcs } from "@mysten/sui/bcs";

const enc = new TextEncoder();
const bytesOf = (s: string): number[] => Array.from(enc.encode(s));

const VecU8 = bcs.vector(bcs.u8());
const OptVecU8 = bcs.option(bcs.vector(bcs.u8()));
const VecVecU8 = bcs.vector(bcs.vector(bcs.u8()));
const OptAddress = bcs.option(bcs.Address);

/** utf8 string -> `vector<u8>` bytes */
export function serString(s: string): Uint8Array {
  return VecU8.serialize(bytesOf(s)).toBytes();
}

/** string | null -> `Option<vector<u8>>` bytes */
export function serOptString(s: string | null | undefined): Uint8Array {
  return OptVecU8.serialize(s == null ? null : bytesOf(s)).toBytes();
}

/** string[] -> `vector<vector<u8>>` bytes */
export function serStringVec(arr: string[]): Uint8Array {
  return VecVecU8.serialize(arr.map(bytesOf)).toBytes();
}

/** object id | null -> `Option<ID>` bytes (ID encodes like an address) */
export function serOptId(id: string | null | undefined): Uint8Array {
  return OptAddress.serialize(id ?? null).toBytes();
}
