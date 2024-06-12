type _Remove<
	A extends {
		[key: string]: unknown;
	},
	B,
> = {
	[K in keyof A]: A[K] extends B ? never : K;
}[keyof A];

export type RemoveType<
	A extends {
		[key: string]: unknown;
	},
	B,
> = {
	[K in _Remove<A, B>]: A[K];
};
