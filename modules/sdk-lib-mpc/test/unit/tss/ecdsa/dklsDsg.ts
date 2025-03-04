import { DklsDsg, DklsUtils } from '../../../../src/tss/ecdsa-dkls';
import * as fs from 'fs';
import * as crypto from 'crypto';
import should from 'should';
import { Keyshare } from '@silencelaboratories/dkls-wasm-ll-node';
import { decode } from 'cbor';
import { verifyAndConvertDklsSignature } from '../../../../src/tss/ecdsa-dkls/util';

describe('DKLS Dsg 2x3', function () {
  const vectors = [
    {
      party1: 0,
      party2: 1,
      msgToSign: 'ffff',
      derivationPath: 'm',
    },
    {
      party1: 0,
      party2: 2,
      msgToSign: 'ffff',
      derivationPath: 'm/0',
    },
    {
      party1: 1,
      party2: 2,
      msgToSign: 'ffff',
      derivationPath: 'm/0/0/0',
    },
    {
      party1: 1,
      party2: 2,
      msgToSign: 'ffff',
      derivationPath: 'm/0/9/10',
    },
  ];
  // To generate the fixtures, run DKG as in the dklsDkg.ts tests and save the resulting party.getKeyShare in a file by doing fs.writeSync(party.getKeyShare()).
  const shareFiles = [
    `${__dirname}/fixtures/userShare`,
    `${__dirname}/fixtures/backupShare`,
    `${__dirname}/fixtures/bitgoShare`,
  ];
  vectors.forEach(async function (vector) {
    it(`should create signatures for parties ${vector.party1} and ${vector.party2} with derivation`, async function () {
      const party1 = new DklsDsg.Dsg(
        fs.readFileSync(shareFiles[vector.party1]),
        vector.party1,
        vector.derivationPath,
        crypto.createHash('sha256').update(Buffer.from(vector.msgToSign, 'hex')).digest()
      );
      const party2 = new DklsDsg.Dsg(
        fs.readFileSync(shareFiles[vector.party2]),
        vector.party2,
        vector.derivationPath,
        crypto.createHash('sha256').update(Buffer.from(vector.msgToSign, 'hex')).digest()
      );
      // Round 1 ////
      const party1Round1Message = await party1.init();
      const party2Round1Message = await party2.init();
      const party2Round2Messages = party2.handleIncomingMessages({
        p2pMessages: [],
        broadcastMessages: [party1Round1Message],
      });
      // ////////////
      // Round 2
      const party1Round2Messages = party1.handleIncomingMessages({
        p2pMessages: [],
        broadcastMessages: [party2Round1Message],
      });
      const party1Round3Messages = party1.handleIncomingMessages({
        p2pMessages: party2Round2Messages.p2pMessages,
        broadcastMessages: [],
      });
      const party2Round3Messages = party2.handleIncomingMessages({
        p2pMessages: party1Round2Messages.p2pMessages,
        broadcastMessages: [],
      });
      const party2Round4Messages = party2.handleIncomingMessages({
        p2pMessages: party1Round3Messages.p2pMessages,
        broadcastMessages: [],
      });
      // ////////////
      // / Produce Signature
      const party1Round4Messages = party1.handleIncomingMessages({
        p2pMessages: party2Round3Messages.p2pMessages,
        broadcastMessages: [],
      });
      party1.handleIncomingMessages({
        p2pMessages: [],
        broadcastMessages: party2Round4Messages.broadcastMessages,
      });
      should.exist(party1.signature);
      should.exist(party1Round4Messages.broadcastMessages[0].signatureR);
      const combinedSigUsingUtil = DklsUtils.combinePartialSignatures(
        [party1Round4Messages.broadcastMessages[0].payload, party2Round4Messages.broadcastMessages[0].payload],
        Buffer.from(party1Round4Messages.broadcastMessages[0].signatureR!).toString('hex')
      );
      (
        (combinedSigUsingUtil.R.every((p) => party1.signature.R.includes(p)) &&
          party1.signature.R.every((p) => combinedSigUsingUtil.R.includes(p))) ||
        (party1.signature.S.every((p) => combinedSigUsingUtil.S.includes(p)) &&
          combinedSigUsingUtil.S.every((p) => party1.signature.S.includes(p)))
      ).should.equal(true);
      // ////////////
      party2.handleIncomingMessages({
        p2pMessages: [],
        broadcastMessages: party1Round4Messages.broadcastMessages,
      });
      party1.signature.should.deepEqual(party2.signature);
      const keyShare: Keyshare = Keyshare.fromBytes(fs.readFileSync(shareFiles[vector.party1]));
      const convertedSignature = verifyAndConvertDklsSignature(
        Buffer.from(vector.msgToSign, 'hex'),
        party1.signature,
        Buffer.from(keyShare.publicKey).toString('hex') +
          Buffer.from(decode(keyShare.toBytes()).root_chain_code).toString('hex'),
        vector.derivationPath
      );
      should.exist(convertedSignature);
      convertedSignature.split(':').length.should.equal(4);
    });
  });

  it(`should fail when signing two different messages`, async function () {
    const party1 = new DklsDsg.Dsg(
      fs.readFileSync(`${__dirname}/fixtures/userShare`),
      0,
      'm',
      crypto.createHash('sha256').update(Buffer.from('ffff', 'hex')).digest()
    );
    const party2 = new DklsDsg.Dsg(
      fs.readFileSync(`${__dirname}/fixtures/bitgoShare`),
      2,
      'm',
      crypto.createHash('sha256').update(Buffer.from('fffa', 'hex')).digest()
    );
    // Round 1 ////
    const party1Round1Message = await party1.init();
    const party2Round1Message = await party2.init();
    const party2Round2Messages = party2.handleIncomingMessages({
      p2pMessages: [],
      broadcastMessages: [party1Round1Message],
    });
    // ////////////
    // Round 2
    const party1Round2Messages = party1.handleIncomingMessages({
      p2pMessages: [],
      broadcastMessages: [party2Round1Message],
    });
    const party1Round3Messages = party1.handleIncomingMessages({
      p2pMessages: party2Round2Messages.p2pMessages,
      broadcastMessages: [],
    });
    const party2Round3Messages = party2.handleIncomingMessages({
      p2pMessages: party1Round2Messages.p2pMessages,
      broadcastMessages: [],
    });
    const party2Round4Messages = party2.handleIncomingMessages({
      p2pMessages: party1Round3Messages.p2pMessages,
      broadcastMessages: [],
    });
    // ////////////
    // / Produce Signature
    party1.handleIncomingMessages({
      p2pMessages: party2Round3Messages.p2pMessages,
      broadcastMessages: [],
    });
    let err = '';
    try {
      party1.handleIncomingMessages({
        p2pMessages: [],
        broadcastMessages: party2Round4Messages.broadcastMessages,
      });
    } catch (e) {
      err = e;
    }
    err.should.equal('Error while creating messages from party 0, round 5: Error: combine error');
  });
});
