'use strict';
/* Launch with a brain: a pump.fun coin created from the launcher's own wallet, born with a WEBB brain.
 * The server builds one transaction (pump.fun create_v2, plus an optional first buy) and signs it only with the
 * fresh mint key it just made. The launcher signs and sends it from their wallet; they are the coin's creator and
 * keep its creator fees. The brain is registered once the transaction is confirmed on Solana. */
const crypto = require('crypto');
const { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } = require('@solana/web3.js');

const RPC = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
let sdkMod = null; const sdk = () => sdkMod || (sdkMod = require('@pump-fun/pump-sdk'));
const URLRX = /^https:\/\/[^\s"'<>]{3,190}$/i;

async function prepare({ b, req, db, http, clean, safe, B58, limit, ipOf, host, rpc, TEMPERS }) {
  limit('launch:' + ipOf(req), 6, 60 * 60e3, 'Six launches an hour from one place. Try again later.');
  const name = clean(b.name).trim().slice(0, 32), symbol = clean(b.symbol).trim().replace(/^\$/, '').toUpperCase().slice(0, 10);
  const description = clean(b.description).trim().slice(0, 500), brief = clean(b.brief).trim().slice(0, 280);
  const twitter = String(b.twitter || '').trim(), website = String(b.website || '').trim();
  const creator = String(b.creator || '').trim(), buy = Math.max(0, Math.min(5, Number(b.buy) || 0));
  const temper = Number.isInteger(+b.temper) && +b.temper >= 0 && +b.temper < TEMPERS.length ? +b.temper : null;
  if (!name) throw http(400, 'Give the coin a name.');
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) throw http(400, 'The ticker is 1 to 10 letters or digits.');
  if (![name, symbol, description, brief].every(safe)) throw http(400, 'Something in that text cannot launch here.');
  if (!B58.test(creator)) throw http(400, 'Connect your wallet first.');
  if (twitter && !URLRX.test(twitter)) throw http(400, 'The X link must be a full https:// link.');
  if (website && !URLRX.test(website)) throw http(400, 'The website must be a full https:// link.');
  const m = String(b.image || '').match(/^data:(image\/(png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw http(400, 'Add a picture (PNG, JPG, GIF or WebP).');
  const img = Buffer.from(m[3], 'base64'); if (img.length > 1.5e6) throw http(400, 'The picture is over 1.5 MB. Use a smaller one.');
  let threads = Array.isArray(b.threads) ? b.threads.filter(x => B58.test(String(x))).slice(0, 3) : [];
  if (threads.length) threads = (await db()`SELECT mint FROM wb_brains WHERE mint = ANY(${threads})`).map(r => r.mint);

  const id = crypto.randomBytes(9).toString('base64url');
  const mintKp = Keypair.generate(), mint = mintKp.publicKey, user = new PublicKey(creator);
  const uri = `https://${host}/api/meta?id=${id}`;
  const { OnlinePumpSdk, PUMP_SDK, getBuyTokenAmountFromSolAmount } = sdk();
  const BN = require('bn.js');
  const conn = new Connection(RPC, 'confirmed');
  const online = new OnlinePumpSdk(conn);
  let ixs;
  try {
    const global = await online.fetchGlobal();
    if (buy > 0) {
      const feeConfig = await online.fetchFeeConfig();
      const solAmount = new BN(Math.round(buy * 1e9));
      const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: solAmount });
      ixs = await PUMP_SDK.createV2AndBuyInstructions({ global, mint, name, symbol, uri, creator: user, user, amount, solAmount, mayhemMode: false });
    } else {
      ixs = [await PUMP_SDK.createV2Instruction({ mint, name, symbol, uri, creator: user, user, mayhemMode: false })];
    }
  } catch (e) { throw http(502, 'pump.fun\'s program could not be read right now: ' + String(e.message).slice(0, 100)); }
  const bh = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }], x => x && x.value)).value.blockhash;
  const msg = new TransactionMessage({ payerKey: user, recentBlockhash: bh, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250000 }), ...ixs] }).compileToV0Message();
  const tx = new VersionedTransaction(msg); tx.sign([mintKp]);
  const wire = Buffer.from(tx.serialize()).toString('base64');
  // run it against mainnet first, so a launch that would fail never reaches the wallet
  let sim = null;
  try { sim = await rpc('simulateTransaction', [wire, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed' }], x => x && x.value); } catch (e) { }
  if (sim && sim.value && sim.value.err) {
    const logs = (sim.value.logs || []).join(' ');
    const why = /insufficient lamports|insufficient funds|0x1\b/i.test(logs) || /InsufficientFunds/.test(JSON.stringify(sim.value.err)) ? `Your wallet needs a little more SOL for this launch${buy ? ' and the first buy' : ''}.` : 'The launch would fail on Solana: ' + (logs.match(/Error Message: ([^.]+)/) || [, JSON.stringify(sim.value.err)])[1].slice(0, 120);
    throw http(400, why);
  }
  await db()`INSERT INTO wb_launches (id, mint, name, symbol, description, twitter, website, brief, temper, threads, creator, buy, img, img_type, status)
    VALUES (${id}, ${mint.toBase58()}, ${name}, ${symbol}, ${description}, ${twitter || null}, ${website || null}, ${brief || null}, ${temper}, ${JSON.stringify(threads)}::jsonb, ${creator}, ${buy}, ${img.toString('base64')}, ${m[1]}, 'built')`;
  return { id, mint: mint.toBase58(), uri, tx: wire, simulated: !!(sim && sim.value), units: sim && sim.value ? sim.value.unitsConsumed : null };
}

async function confirm({ b, db, http, rpc, B58, wake }) {
  const id = String(b.id || '').replace(/[^\w-]/g, ''), sig = String(b.sig || '').trim();
  const L = (await db()`SELECT * FROM wb_launches WHERE id=${id}`)[0];
  if (!L) throw http(404, 'No launch with that id.');
  if (L.status === 'live') return { ok: true, mint: L.mint, already: true };
  if (!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(sig)) throw http(400, 'Bad transaction signature.');
  let st = null;
  for (let i = 0; i < 12; i++) {
    const r = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: true }]).catch(() => null);
    st = r && r.value && r.value[0];
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) break;
    await new Promise(r => setTimeout(r, 1500));
  }
  if (!st) throw http(409, 'Solana has not seen that transaction yet. It may still land; check again in a moment.');
  if (st.err) { await db()`UPDATE wb_launches SET status='failed', sig=${sig} WHERE id=${id}`; throw http(400, 'The launch transaction failed on Solana.'); }
  const acc = await rpc('getAccountInfo', [L.mint, { encoding: 'base64' }]).catch(() => null);
  if (!acc || !acc.value) throw http(409, 'The coin is not on Solana yet. Check again in a moment.');
  await db()`UPDATE wb_launches SET status='live', sig=${sig} WHERE id=${id}`;
  const live = JSON.stringify({ mc: null, at: Date.now() });
  await db()`INSERT INTO wb_brains (mint, symbol, name, image, origin, brief, creator, threads, last_seen, launch, next_think)
    VALUES (${L.mint}, ${L.symbol}, ${L.name}, ${'/api/limg?id=' + L.id}, 'webb', ${L.brief}, ${L.creator}, ${JSON.stringify(L.threads || [])}::jsonb, ${live}::jsonb, ${JSON.stringify({ id: L.id, sig, temper: L.temper })}::jsonb, now())
    ON CONFLICT (mint) DO UPDATE SET origin='webb', brief=EXCLUDED.brief, creator=EXCLUDED.creator, threads=EXCLUDED.threads, launch=EXCLUDED.launch`;
  await db()`INSERT INTO wb_thoughts (mint, sym, kind, body) VALUES (${L.mint}, ${L.symbol}, 'birth', ${'born on WEBB. a dewdrop on the web.'})`;
  let first = null;
  try { const row = (await db()`SELECT * FROM wb_brains WHERE mint=${L.mint}`)[0]; first = await wake(row); } catch (e) { first = { error: e.message }; }
  return { ok: true, mint: L.mint, first };
}

module.exports = { prepare, confirm };
