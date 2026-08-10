import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { InMemoryMongoCollection } from '@sofie-automation/corelib/dist/memoryCollection'
import { literal } from '@sofie-automation/corelib/dist/lib'
import { MongoFieldSpecifierOnesStrict } from '@sofie-automation/corelib/dist/mongo'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import { DBStudio, IStudioSettings } from '@sofie-automation/corelib/dist/dataModel/Studio'
import { PartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { StudioId } from '@sofie-automation/corelib/dist/dataModel/Ids'

export type RundownPlaylistFields =
	| '_id'
	| 'studioId'
	| 'activationId'
	| 'timing'
	| 'startedPlayback'
	| 'currentPartInfo'
	| 'nextPartInfo'
	| 'outOfOrderTiming'
	| 'segmentsStartedPlayback'
	| 'quickLoop'
	| 'rundownIdsInOrder'
export const rundownPlaylistFieldSpecifier = literal<
	MongoFieldSpecifierOnesStrict<Pick<DBRundownPlaylist, RundownPlaylistFields>>
>({
	_id: 1,
	studioId: 1,
	activationId: 1,
	timing: 1,
	startedPlayback: 1,
	currentPartInfo: 1,
	nextPartInfo: 1,
	outOfOrderTiming: 1,
	segmentsStartedPlayback: 1,
	quickLoop: 1,
	rundownIdsInOrder: 1,
})

export type SegmentFields = '_id' | '_rank' | 'rundownId' | 'segmentTiming'
export const segmentFieldSpecifier = literal<MongoFieldSpecifierOnesStrict<Pick<DBSegment, SegmentFields>>>({
	_id: 1,
	_rank: 1,
	rundownId: 1,
	segmentTiming: 1,
})

export type PartFields =
	| '_id'
	| '_rank'
	| 'rundownId'
	| 'segmentId'
	| 'expectedDuration'
	| 'expectedDurationWithTransition'
	| 'untimed'
	| 'floated'
	| 'invalid'
	| 'gap'
	| 'autoNext'
	| 'displayDuration'
	| 'displayDurationGroup'
export const partFieldSpecifier = literal<MongoFieldSpecifierOnesStrict<Pick<DBPart, PartFields>>>({
	_id: 1,
	_rank: 1,
	rundownId: 1,
	segmentId: 1,
	expectedDuration: 1,
	expectedDurationWithTransition: 1,
	untimed: 1,
	floated: 1,
	invalid: 1,
	gap: 1,
	autoNext: 1,
	displayDuration: 1,
	displayDurationGroup: 1,
})

// Matching the projection the client RundownTimingProvider uses (note: no partPlayoutTimings,
// so calculatePartInstanceExpectedDurationWithTransition uses part.expectedDurationWithTransition,
// the same as on the client)
export type PartInstanceFields =
	| '_id'
	| 'rundownId'
	| 'segmentId'
	| 'isTemporary'
	| 'segmentPlayoutId'
	| 'takeCount'
	| 'part'
	| 'timings'
	| 'orphaned'
export const partInstanceFieldSpecifier = literal<
	MongoFieldSpecifierOnesStrict<Pick<PartInstance, PartInstanceFields>>
>({
	_id: 1,
	rundownId: 1,
	segmentId: 1,
	isTemporary: 1,
	segmentPlayoutId: 1,
	takeCount: 1,
	part: 1,
	timings: 1,
	orphaned: 1,
})

export type StudioFields = '_id' | 'settingsWithOverrides'
export const studioFieldSpecifier = literal<MongoFieldSpecifierOnesStrict<Pick<DBStudio, StudioFields>>>({
	_id: 1,
	settingsWithOverrides: 1,
})

export interface StudioSettingsDoc {
	_id: StudioId
	settings: IStudioSettings
}

export interface ContentCache {
	StudioSettings: InMemoryMongoCollection<StudioSettingsDoc>
	RundownPlaylists: InMemoryMongoCollection<Pick<DBRundownPlaylist, RundownPlaylistFields>>
	Segments: InMemoryMongoCollection<Pick<DBSegment, SegmentFields>>
	Parts: InMemoryMongoCollection<Pick<DBPart, PartFields>>
	PartInstances: InMemoryMongoCollection<Pick<PartInstance, PartInstanceFields>>
}

export function createReactiveContentCache(): ContentCache {
	const cache: ContentCache = {
		StudioSettings: new InMemoryMongoCollection<StudioSettingsDoc>('studioSettings'),
		RundownPlaylists: new InMemoryMongoCollection<Pick<DBRundownPlaylist, RundownPlaylistFields>>(
			'rundownPlaylists'
		),
		Segments: new InMemoryMongoCollection<Pick<DBSegment, SegmentFields>>('segments'),
		Parts: new InMemoryMongoCollection<Pick<DBPart, PartFields>>('parts'),
		PartInstances: new InMemoryMongoCollection<Pick<PartInstance, PartInstanceFields>>('partInstances'),
	}

	return cache
}
