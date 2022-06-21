import 'dotenv/config';
import * as firebase from 'firebase-admin';
// @ts-ignore
import { processRecordDataForGameId } from 'amae-koromo';
import type { lq } from 'amae-koromo/majsoulPb';
import { google } from 'googleapis';
import fs from 'fs-extra';
import { chunk } from 'lodash';

const BATTLE_LOG_ID = '1Ku67kvpt0oP6PZL7F_6AreQLiiuLq8k8P0qEDCcIqXI';

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
  副露牌: string[],
  途中流局: number,
}

interface PhaseResult {
  paipuId: string,
  name: string,
  agariPlayer: string,
  agariHitPlayer: string,
  type: string,
  point: number,
  fans: string,
  role: string,
}

type Phase = Player[];

type MingPai = {name: string, isSide: boolean};

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
  credential: firebase.credential.cert('google_application_credentials_prod.json'),
  databaseURL: process.env.FIREBASE_ENDPOINT,
});

const db = firebase.firestore(defaultApp);

const getSheetsData = async (spreadsheetId: string, range: string) => {
  const auth = await new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  }).getClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetsData = await new Promise<string[][]>((resolve, reject) => {
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    }, (error, response) => {
      if (error) {
        reject(error);
      } else if (response.data.values) {
        resolve(response.data.values as string[][]);
      } else {
        reject(new Error('values not found'));
      }
    });
  });

  return sheetsData;
};

const appendResultToHistory = async (phases: PhaseResult[], targetRange: string) => {
  const auth = await new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  }).getClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await new Promise<any>((resolve, reject) => {
    sheets.spreadsheets.values.append({
      spreadsheetId: BATTLE_LOG_ID,
      range: targetRange,
      insertDataOption: 'INSERT_ROWS',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        range: targetRange,
        majorDimension: 'ROWS',
        values: phases.map((phase) => [
          `=HYPERLINK("https://game.mahjongsoul.com/?paipu=${phase.paipuId}", "${phase.paipuId}")`,
          phase.name,
          phase.type,
          phase.point.toString(),
          phase.role,
          phase.agariPlayer,
          phase.agariHitPlayer,
          phase.fans,
        ]),
      },
    }, (error, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
};

const encodeMings = (mings: string[]) => (
  mings.map((ming) => {
    const [type, paisString] = ming.split(/[()]/);
    const [pai1, pai2, pai3, pai4] = paisString.split(',').map((pai) => paiNames.get(pai));
    if (type === 'shunzi') {
      return [
        {name: pai3, isSide: true},
        {name: pai1, isSide: false},
        {name: pai2, isSide: false},
      ] as MingPai[];
    }
    if (type === 'kezi') {
      return [
        {name: pai1, isSide: false},
        {name: pai2, isSide: true},
        {name: pai3, isSide: false},
      ] as MingPai[];
    }
    if (type === 'minggang') {
      return [
        {name: pai1, isSide: true},
        {name: pai2, isSide: false},
        {name: pai3, isSide: false},
        {name: pai4, isSide: false},
      ] as MingPai[];
    }
    if (type === 'angang') {
      return [
        {name: pai1, isSide: false},
        {name: '麻雀牌', isSide: false},
        {name: '麻雀牌', isSide: false},
        {name: pai4, isSide: false},
      ] as MingPai[];
    }
    throw new Error(`Unknown ming type: ${type}`);
  })
);

const encodeFans = (fans: string[]) => {
  let doraCount = 0;
  const uniqueFans = new Set();
  for (const fan of fans) {
    if (fan?.includes('ドラ')) {
      doraCount++;
    } else {
      uniqueFans.add(fan);
    }
  }
  const fanString = [...uniqueFans].join('・');
  if (doraCount > 0) {
    return `${fanString}・ドラ${doraCount}`;
  }
  return fanString;
};

(async () => {
  const paipuSheets = [
    ...(await getSheetsData(BATTLE_LOG_ID, '局一覧!A:A')),
    ...(await getSheetsData(BATTLE_LOG_ID, '局一覧 (三麻)!A:A')),
  ];
  
  const existingPaipuIds = new Set(paipuSheets.map(([paipuId]) => paipuId));

  const dataDefinition = await fs.readJson('dataDefinition.json');
  const paipus = await db.collection('jantama_paipu').get();

  const yonmaPhaseResults = [] as PhaseResult[];
  const sammaPhaseResults = [] as PhaseResult[];

  for (const doc of paipus.docs) {
    const paipuId = doc.id;
    if (existingPaipuIds.has(paipuId)) {
      continue;
    }

    const {game, data} = doc.data() as {game: lq.RecordGame, data: Buffer};
    console.log(`Processing ${paipuId}`);

    try {
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

            const phaseResults = players.length === 4 ? yonmaPhaseResults : sammaPhaseResults;

            if (agariPlayer !== null && agariAccount !== null) {
              let playerNameString = agariAccount.nickname;
              if (agariType === 'ロン') {
                playerNameString += `→${agariHitAccount.nickname}`;
              }

              const 最終手牌 = agariPlayer.最終手牌.map(pai => `[/icons/${paiNames.get(pai)}.icon]`).join(' ');
              const 和牌 = `[/icons/${paiNames.get(agariPlayer.和牌)}.icon]`;

              const mings = encodeMings(agariPlayer.副露牌 ?? []);
              const mingString = mings.map((ming) => (
                ming.map((pai) => (
                  pai.isSide ? `[!# [/icons/${pai.name}.icon]]` : `[/icons/${pai.name}.icon]`
                )).join(' ')
              )).join('   ');

              const fanString = encodeFans(agariPlayer.和[1].map((fan) => fanNames.get(fan)));

              console.log('');
              console.log(`[* ${phaseString}] ${playerNameString} [[${agariType}]] ${agariPlayer.和[0]}点`);
              console.log(`${最終手牌}   ${和牌}      ${mingString}`.trim());
              console.log(fanString);

              phaseResults.push({
                paipuId,
                name: phaseString,
                agariPlayer: agariAccount?.nickname ?? '',
                agariHitPlayer: agariHitAccount?.nickname ?? '',
                type: agariType,
                point: agariPlayer.和[0],
                fans: fanString,
                role: agariPlayer.亲 ? '親' : '子',
              });
            } else if (players[0].途中流局) {
              const type = ['九種九牌', '四風連打', '四槓散了', '四家立直'][players[0].途中流局 - 1];

              phaseResults.push({
                paipuId,
                name: phaseString,
                agariPlayer: '',
                agariHitPlayer: '',
                type,
                point: 0,
                fans: '',
                role: '',
              });
            } else {
              phaseResults.push({
                paipuId,
                name: phaseString,
                agariPlayer: '',
                agariHitPlayer: '',
                type: '流局',
                point: 0,
                fans: '',
                role: '',
              });
            }
          }
        },
      }, paipuId, data, {
        game,
        dataDefinition,
      });
    } catch (e) {
      console.error(`Error processing ${paipuId}: ${e}`);
    }
  }

  console.log(yonmaPhaseResults.length);
  for (const results of chunk(yonmaPhaseResults, 100)) {
    await appendResultToHistory(results, '局一覧!A:H');
  }

  console.log(sammaPhaseResults.length);
  for (const results of chunk(sammaPhaseResults, 100)) {
    await appendResultToHistory(results, '局一覧 (三麻)!A:H');
  }
})();
