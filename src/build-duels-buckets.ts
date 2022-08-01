/* eslint-disable @typescript-eslint/no-use-before-define */
import { AllCardsService, CardClass, CardIds } from '@firestone-hs/reference-data';
import { constants, gzipSync } from 'zlib';
import { BucketCard, BucketInfo, BucketMap } from './buckets';
import { getConnection } from './db/rds';
import { S3 } from './db/s3';
import { groupByFunction } from './utils/util-functions';

const allCards = new AllCardsService();
const s3 = new S3();

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	await allCards.initializeCardsDb();
	if (!allCards.getCard('REV_375').id) {
		throw new Error('cards not properly initialized');
	}
	const mysql = await getConnection();

	const query = `
		select * from dungeon_run_loot_info
		use index (ix_buildBuckets)
		where creationDate > DATE_SUB(NOW(), INTERVAL 7 DAY)
		and bundleType = 'loot'
		and adventureType in ('duels', 'paid-duels')
		order by id desc;
	`;
	console.log('\n', new Date().toLocaleString(), 'running query', query);
	const result: any[] = await mysql.query(query);
	console.log(new Date().toLocaleString(), 'result', result?.length);
	await mysql.end();
	console.log(new Date().toLocaleString(), 'connection closed');

	const bucketMaps: readonly BucketMap[] = result.flatMap(row => [
		{
			bucketId: row.option1,
			cardIds: row.option1Contents.split(','),
		},
		{
			bucketId: row.option2,
			cardIds: row.option2Contents.split(','),
		},
		{
			bucketId: row.option3,
			cardIds: row.option3Contents.split(','),
		},
	]);
	console.log(new Date().toLocaleString(), 'bucketMaps', bucketMaps.length);
	const groupedByBucketId = groupByFunction((bucketMap: BucketMap) => bucketMap.bucketId)(bucketMaps);
	console.log(new Date().toLocaleString(), 'groupedByBucketId', Object.keys(groupedByBucketId).length);
	const bucketInfos: readonly BucketInfo[] = Object.keys(groupedByBucketId)
		.map(bucketId => {
			const cardIds = groupedByBucketId[bucketId]
				.flatMap(bucketMap => bucketMap.cardIds)
				.map((cardId: string | number) =>
					isNaN(+cardId) ? (cardId as string) : allCards.getCardFromDbfId(+cardId).id,
				);
			const uniqueCardIds = [...new Set(cardIds)].sort();
			const cardClasses = uniqueCardIds
				.map(cardId => allCards.getCard(cardId))
				.filter(card => !card.classes?.length)
				.map(card => card.cardClass)
				.filter(cardClass => !!cardClass)
				.map(cardClass =>
					cardClass === CardClass[CardClass.DEATHKNIGHT] ? CardClass[CardClass.NEUTRAL] : cardClass,
				)
				.sort();
			let uniqueClasses = [...new Set(cardClasses)];
			// Manual overrides
			if (bucketId === CardIds.TrapsAndTrappersTavernBrawlToken) {
				uniqueClasses = [CardClass[CardClass.HUNTER]];
			}

			if (uniqueClasses.length > 1) {
				uniqueClasses = uniqueClasses.filter(cardClass => cardClass !== CardClass[CardClass.NEUTRAL]);
				if (uniqueClasses.length !== 1) {
					console.warn('incorrect bucket class', bucketId, uniqueClasses);
				}
			}

			const cards: readonly BucketCard[] = uniqueCardIds
				.map(cardId => {
					const refCard = allCards.getCard(cardId);
					if (!refCard.id) {
						console.info('missing card', cardId, refCard);
					}
					const totalOffered = cardIds.filter(c => c === cardId).length;
					return {
						cardId: cardId,
						cardName: refCard?.name,
						totalOffered: totalOffered,
					} as BucketCard;
				})
				.sort((a: BucketCard, b: BucketCard) => {
					if (!a.cardId) {
						console.log('missing card', a);
					}
					return a.cardId.localeCompare(b.cardId);
				});

			// Now merge the cards that have the same name
			const groupedByName = groupByFunction((card: BucketCard) => card.cardName)(cards);
			const finalCards: readonly BucketCard[] = Object.values(groupedByName).map(cardsForName => {
				const totalOffered = cardsForName.reduce((total, card) => total + card.totalOffered, 0);
				const cardId =
					cardsForName.find(c => !allCards.getCard(c.cardId)?.deckDuplicateDbfId)?.cardId ??
					cardsForName[0].cardId;
				return {
					cardId: cardId,
					cardName: cardsForName[0].cardName,
					totalOffered: totalOffered,
				} as BucketCard;
			});

			return {
				bucketId: bucketId,
				bucketName: allCards.getCard(bucketId)?.name,
				bucketClasses: uniqueClasses,
				cards: finalCards,
			} as BucketInfo;
		})
		.filter(info => !!info.bucketName);
	console.log(new Date().toLocaleString(), 'bucketInfos', bucketInfos.length);

	const dataStr = JSON.stringify(bucketInfos, null, 4);
	const gzipped = gzipSync(dataStr, {
		level: constants.Z_BEST_COMPRESSION,
	});
	console.log('gzipped buckets');
	await s3.writeFile(
		gzipped,
		'static.zerotoheroes.com',
		`api/duels/duels-buckets.gz.json`,
		'application/json',
		'gzip',
	);
	console.log('file saved duels-buckets');

	return { statusCode: 200, body: null };
};
