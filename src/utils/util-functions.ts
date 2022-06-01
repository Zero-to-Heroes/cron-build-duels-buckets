import { AllCardsService, ReferenceCard } from '@firestone-hs/reference-data';
import fetch, { RequestInfo } from 'node-fetch';

function partitionArray<T>(array: readonly T[], partitionSize: number): readonly T[][] {
	const workingCopy: T[] = [...array];
	const result: T[][] = [];
	while (workingCopy.length) {
		result.push(workingCopy.splice(0, partitionSize));
	}
	return result;
}

async function http(request: RequestInfo): Promise<any> {
	return new Promise(resolve => {
		fetch(request)
			.then(
				response => {
					return response.text();
				},
				error => {
					console.warn('could not retrieve review', error);
				},
			)
			.then(body => {
				resolve(body);
			});
	});
}

async function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const groupByFunction = <T>(keyExtractor: (obj: T) => string) => (
	array: readonly T[],
): { [key: string]: readonly T[] } => {
	return array.reduce((objectsByKeyValue, obj) => {
		const value = keyExtractor(obj);
		objectsByKeyValue[value] = (objectsByKeyValue[value] || []).concat(obj);
		return objectsByKeyValue;
	}, {});
};

export const toCreationDate = (today: Date): string => {
	return `${today
		.toISOString()
		.slice(0, 19)
		.replace('T', ' ')}.${today.getMilliseconds()}`;
};

export const formatDate = (today: Date): string => {
	return `${today
		.toISOString()
		.slice(0, 19)
		.replace('T', ' ')}.000000`;
};

export const getCardFromCardId = (cardId: number | string, cards: AllCardsService): ReferenceCard => {
	const isDbfId = !isNaN(+cardId);
	const card = isDbfId ? cards.getCardFromDbfId(+cardId) : cards.getCard(cardId as string);
	return card;
};

export { partitionArray, http, sleep };
