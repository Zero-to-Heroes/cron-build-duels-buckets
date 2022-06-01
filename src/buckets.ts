export interface BucketMap {
	bucketId: string;
	cardIds: readonly string[];
}

export interface BucketInfo {
	readonly bucketId: string;
	readonly bucketName: string;
	readonly bucketClasses: readonly string[];
	readonly cards: readonly BucketCard[];
}

export interface BucketCard {
	readonly cardId: string;
	readonly cardName: string;
	readonly totalOffered: number;
}
