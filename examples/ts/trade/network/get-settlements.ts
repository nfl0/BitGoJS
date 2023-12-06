/**
 * Create a list of network settlements
 *
 * Copyright 2023, BitGo, Inc.  All Rights Reserved.
 */

import { BitGoAPI } from '@bitgo/sdk-api';
import { coins } from '@bitgo/sdk-core';
require('dotenv').config({ path: '../../../.env' });

const OFC_WALLET_ID = process.env.OFC_WALLET_ID;

const bitgo = new BitGoAPI({
  accessToken: process.env.TESTNET_ACCESS_TOKEN,
  env: 'test',
});

const coin = 'ofc';
bitgo.register(coin, coins.Ofc.createInstance);

async function main() {
  const wallet = await bitgo.coin('ofc').wallets().get({ id: OFC_WALLET_ID });
  const tradingAccount = wallet.toTradingAccount();
  const tradingNetwork = tradingAccount.toNetwork();

  const settlements = await tradingNetwork.getSettlements();

  console.log('Trading Network Settlements:', settlements);
}

main().catch((e) => console.error(e));
