import 'dotenv/config';
import * as firebase from 'firebase-admin';
// @ts-ignore
import { processRecordDataForGameId } from 'amae-koromo';
import type { lq } from 'amae-koromo/majsoulPb';
import fs from 'fs-extra';
import {inspect} from 'util';

interface Player {
  亲: boolean,
  牌山: string,
  場: string,
  局: number,
  本場: number,
  手牌: string[]
  起手向听: number,
  放铳: number,
  立直: number,
  立直听牌: string[],
  立直听牌残枚: number,
  和: [number, number[], number],
  最終手牌: string[],
  和牌: string,
}

type Phase = Player[];

const fanNames = new Map([
  [1, '門前清自摸和'],
  [2, '立直'],
  [3, '槍槓'],
  [4, '嶺上開花'],
  [5, '海底摸月'],
  [6, '河底撈魚'],
  [7, '役牌白'],
  [8, '役牌發'],
  [9, '役牌中'],
  [10, '役牌:自風牌'],
  [11, '役牌:場風牌'],
  [12, '断幺九'],
  [13, '一盃口'],
  [14, '平和'],
  [15, '混全帯幺九'],
  [16, '一気通貫'],
  [17, '三色同順'],
  [18, 'ダブル立直'],
  [19, '三色同刻'],
  [20, '三槓子'],
  [21, '対々和'],
  [22, '三暗刻'],
  [23, '小三元'],
  [24, '混老頭'],
  [25, '七対子'],
  [26, '純全帯幺九'],
  [27, '混一色'],
  [28, '二盃口'],
  [29, '清一色'],
  [30, '一発'],
  [31, 'ドラ'],
  [32, '赤ドラ'],
  [33, '裏ドラ'],
  [35, '天和'],
  [36, '地和'],
  [37, '大三元'],
  [38, '四暗刻'],
  [39, '字一色'],
  [40, '緑一色'],
  [41, '清老頭'],
  [42, '国士無双'],
  [43, '小四喜'],
  [44, '四槓子'],
  [45, '九蓮宝燈'],
  [47, '純正九蓮宝燈'],
  [48, '四暗刻単騎'],
  [49, '国士無双十三面待ち'],
  [50, '大四喜'],
])

const paiNames = new Map([
  ['0p', '赤五筒'],
  ['1p', '一筒'],
  ['2p', '二筒'],
  ['3p', '三筒'],
  ['4p', '四筒'],
  ['5p', '五筒'],
  ['6p', '六筒'],
  ['7p', '七筒'],
  ['8p', '八筒'],
  ['9p', '九筒'],
  ['0s', '赤五索'],
  ['1s', '一索'],
  ['2s', '二索'],
  ['3s', '三索'],
  ['4s', '四索'],
  ['5s', '五索'],
  ['6s', '六索'],
  ['7s', '七索'],
  ['8s', '八索'],
  ['9s', '九索'],
  ['0m', '赤五萬'],
  ['1m', '一萬'],
  ['2m', '二萬'],
  ['3m', '三萬'],
  ['4m', '四萬'],
  ['5m', '五萬'],
  ['6m', '六萬'],
  ['7m', '七萬'],
  ['8m', '八萬'],
  ['9m', '九萬'],
  ['1z', '東'],
  ['2z', '南'],
  ['3z', '西'],
  ['4z', '北'],
  ['5z', '白'],
  ['6z', '發'],
  ['7z', '中'],
]);

const defaultApp = firebase.initializeApp({
  credential: firebase.credential.applicationDefault(),
  databaseURL: process.env.FIREBASE_ENDPOINT,
});

const db = firebase.firestore(defaultApp);

(async () => {
  const dataDefinition = await fs.readJson('dataDefinition.json');
  const paipus = await db.collection('jantama_paipu').get();

  for (const doc of paipus.docs) {
    const paipuId = doc.id;
    const {game, data} = doc.data() as {game: lq.RecordGame, data: Buffer};

    try {
      if (paipuId === '211122-5d5e00aa-6faa-44cf-be4c-8c778e034733') {
        continue;
      }
      await processRecordDataForGameId({
        saveRoundData: (game: lq.RecordGame, phases: Phase[]) => {
          const gameDate = new Date(game.start_time * 1000);
          console.log('');
          console.log(`[*** [${gameDate.toLocaleString()} https://game.mahjongsoul.com/?paipu=${paipuId}]]`);

          for (const players of phases) {
            let phaseString = '???';
            let agariAccount: lq.RecordGame.IAccountInfo = null;
            let agariPlayer: Player = null;
            let agariType = 'ツモ';
            let agariHitAccount: lq.RecordGame.IAccountInfo = null;

            for (const [playerIndex, player] of players.entries()) {
              if (player.亲) {
                const {場, 局, 本場} = player;
                phaseString = `${場}${局}局`;
                if (本場 > 0) {
                  phaseString += `${本場}本場`;
                }
              }

              if (player.和) {
                agariAccount = game.accounts[playerIndex] || {nickname: 'CPU'};
                agariPlayer = player;
              }

              if (player.放铳) {
                agariType = 'ロン';
                agariHitAccount = game.accounts[playerIndex] || {nickname: 'CPU'};
              }
            }

            if (agariPlayer !== null && agariAccount !== null) {
              let playerNameString = agariAccount.nickname;
              if (agariType === 'ロン') {
                playerNameString += `→${agariHitAccount.nickname}`;
              }

              const 最終手牌 = agariPlayer.最終手牌.map(pai => `[/icons/${paiNames.get(pai)}.icon]`).join(' ');
              const 和牌 = `[/icons/${paiNames.get(agariPlayer.和牌)}.icon]`;

              console.log('');
              console.log(`[* ${phaseString}] ${playerNameString} [[${agariType}]] ${agariPlayer.和[0]}点`);
              console.log(`${最終手牌}   ${和牌}`);
              console.log(agariPlayer.和[1].map(fan => fanNames.get(fan)).join('・'));
            }
          }
        },
      }, paipuId, data, {
        game,
        dataDefinition,
      });
      break;
    } catch (e) {
      console.error(`Error processing ${paipuId}: ${e}`);
    }
  }
})();
