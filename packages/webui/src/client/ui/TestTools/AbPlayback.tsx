import type * as React from 'react'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Classnames from 'classnames'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import type { AbPlayerId } from '@sofie-automation/blueprints-integration'
import { deserializeTimelineBlob, type TimelineObjGeneric } from '@sofie-automation/corelib/dist/dataModel/Timeline'
import type {
	AbPlaybackDebugInfo,
	AbPlaybackDebugObject,
	AbPlaybackDebugPiece,
	AbPlaybackPoolDebugInfo,
	AbResolverDecision,
	SessionRequest,
} from '@sofie-automation/corelib/dist/dataModel/AbPlaybackDebug'
import type {
	ABSessionAssignment,
	ABSessionAssignments,
	ABSessionInfo,
} from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist/RundownPlaylist'
import type { TimelineObjectAbSessionInfo } from '@sofie-automation/shared-lib/dist/core/model/Timeline'
import { MeteorPubSub } from '@sofie-automation/meteor-lib/dist/api/pubsub'
import { unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import { useSubscription, useTracker } from '../../lib/ReactMeteorData/react-meteor-data.js'
import { AbPlaybackTimeline } from './collections.js'
import { FilterInput, type FilterInputValue, matchesFilter } from './FilterInput.js'

export function AbPlaybackView(): JSX.Element {
	const { t } = useTranslation()

	return (
		<div className="mx-5">
			<header className="my-2">
				<h1>{t('AB Playback')}</h1>
			</header>
			<div className="my-5">
				<ComponentAbPlayback />
			</div>
		</div>
	)
}

function ComponentAbPlayback() {
	const { t } = useTranslation()

	useSubscription(MeteorPubSub.abPlaybackDebugForStudio)

	const tlComplete = useTracker(() => AbPlaybackTimeline.findOne(), [])

	const timelineObjects = useMemo(() => {
		try {
			return tlComplete ? deserializeTimelineBlob(tlComplete.timelineBlob) : []
		} catch (e) {
			console.error('Failed to deserialize timeline', e)
			return []
		}
	}, [tlComplete?.timelineHash])

	const debug = tlComplete?.abPlaybackDebug

	const poolNames = useMemo(() => Object.keys(debug?.pools ?? {}).sort(), [debug])
	const [selectedPoolName, setSelectedPoolName] = useState<string | null>(null)
	const poolName = selectedPoolName && poolNames.includes(selectedPoolName) ? selectedPoolName : poolNames[0]
	const pool = poolName ? debug?.pools[poolName] : undefined

	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

	if (!tlComplete) return <p>{t('No timeline found')}</p>

	if (!debug)
		return (
			<p>
				{t(
					'The current timeline has no AB playback information. Either there is no active playlist, or the blueprint does not use AB playback'
				)}
			</p>
		)

	return (
		<div>
			<AbPlaybackSummary debug={debug} generated={tlComplete.generated} />

			<Row className="my-3">
				<Col xs={12} md={4}>
					<Form.Group>
						<Form.Label>{t('Pool')}</Form.Label>
						<Form.Select value={poolName ?? ''} onChange={(e) => setSelectedPoolName(e.target.value)}>
							{poolNames.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</Form.Select>
					</Form.Group>
				</Col>
			</Row>

			{pool && poolName ? (
				<>
					<AbPlaybackPoolSessions
						debug={debug}
						poolName={poolName}
						pool={pool}
						selectedSessionId={selectedSessionId}
						setSelectedSessionId={setSelectedSessionId}
					/>
					<AbPlaybackTimelineObjects
						poolName={poolName}
						pool={pool}
						timelineObjects={timelineObjects}
						selectedSessionId={selectedSessionId}
						setSelectedSessionId={setSelectedSessionId}
					/>
				</>
			) : (
				<p>{t('The blueprint did not define any AB pools')}</p>
			)}
		</div>
	)
}

const LOOKAHEAD_START = Number.MAX_SAFE_INTEGER

function formatRelativeTime(time: number | undefined, now: number): string {
	if (time === undefined) return '∞'
	if (time === LOOKAHEAD_START) return 'lookahead'

	const diff = time - now
	return `${diff < 0 ? '-' : '+'}${(Math.abs(diff) / 1000).toFixed(2)}s`
}

function formatAbsoluteTime(time: number | undefined): string | undefined {
	if (time === undefined || time === LOOKAHEAD_START) return undefined
	return new Date(time).toISOString()
}

function RelativeTime({ time, now }: Readonly<{ time: number | undefined; now: number }>) {
	return <span title={formatAbsoluteTime(time)}>{formatRelativeTime(time, now)}</span>
}

function shortId(id: string | undefined): string {
	if (!id) return '-'
	return id.length > 12 ? `${id.slice(0, 10)}…` : id
}

function SessionIdLink({
	sessionId,
	selectedSessionId,
	setSelectedSessionId,
}: Readonly<{
	sessionId: string | undefined
	selectedSessionId: string | null
	setSelectedSessionId: (id: string | null) => void
}>) {
	if (!sessionId) return <span>-</span>

	return (
		<button
			type="button"
			className={Classnames('testtools-ab-session-link', {
				'testtools-ab-session-link--selected': sessionId === selectedSessionId,
			})}
			title={sessionId}
			onClick={() => setSelectedSessionId(sessionId === selectedSessionId ? null : sessionId)}
		>
			{shortId(sessionId)}
		</button>
	)
}

function Tag({
	children,
	title,
	className,
}: Readonly<{ children: React.ReactNode; title?: string; className?: string }>) {
	return (
		<span className={Classnames('testtools-ab-tag', className)} title={title}>
			{children}
		</span>
	)
}

function KeyValue({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
	return (
		<span className="testtools-ab-kv">
			<span className="testtools-ab-kv__label">{label}</span>
			{children}
		</span>
	)
}

function PlayerBadge({ playerId }: Readonly<{ playerId: AbPlayerId | undefined }>) {
	const { t } = useTranslation()

	if (playerId === undefined)
		return <span className="testtools-ab-player testtools-ab-player--none">{t('no player')}</span>
	return <span className="testtools-ab-player">{String(playerId)}</span>
}

function AbPlaybackSummary({ debug, generated }: Readonly<{ debug: AbPlaybackDebugInfo; generated: number }>) {
	const { t } = useTranslation()

	return (
		<div>
			{debug.error ? (
				<div className="testtools-ab-error">
					⚠ {t('Error after AB resolving')}: <code>{debug.error}</code>
				</div>
			) : null}

			<dl className="testtools-ab-stats">
				<div>
					<dt>{t('Timeline generated')}</dt>
					<dd>{new Date(generated).toISOString()}</dd>
				</div>
				<div>
					<dt>{t('Resolver now')}</dt>
					<dd>{new Date(debug.now).toISOString()}</dd>
				</div>
				<div>
					<dt>{t('Now window')}</dt>
					<dd>
						{debug.resolverOptions.nowWindow}ms{' '}
						<small>
							({t('safeNow')} {formatRelativeTime(debug.now + debug.resolverOptions.nowWindow, debug.now)})
						</small>
					</dd>
				</div>
				<div>
					<dt>{t('Ideal gap before')}</dt>
					<dd>{debug.resolverOptions.idealGapBefore}ms</dd>
				</div>
			</dl>

			<h3 className="my-3">{t('Tracked sessions')}</h3>
			<p>
				{t(
					'The sessions remembered between timeline generations, which let a piece keep the same session (and player) each time the timeline is regenerated. Previous is what was saved by the last generation and used as the input to this one. Current is what this generation saved for the next one; sessions which are no longer referenced are dropped.'
				)}
			</p>
			<Row>
				<Col xs={12} lg={6}>
					<h4 className="my-3">{t('Previous')}</h4>
					<TrackedSessionsList sessions={debug.previousTrackedSessions} />
				</Col>
				<Col xs={12} lg={6}>
					<h4 className="my-3">{t('Current')}</h4>
					<TrackedSessionsList sessions={debug.trackedSessions} />
				</Col>
			</Row>
		</div>
	)
}

function ListHeader({ columns }: Readonly<{ columns: string[] }>) {
	return (
		<li className="testtools-ab-list__header" aria-hidden="true">
			{columns.map((column, i) => (
				<span key={i}>{column}</span>
			))}
		</li>
	)
}

function TrackedSessionsList({ sessions }: Readonly<{ sessions: ABSessionInfo[] }>) {
	const { t } = useTranslation()

	if (sessions.length === 0) return <p>{t('None')}</p>

	return (
		<ul className="testtools-ab-list testtools-ab-list--tracked">
			{sessions.map((session) => (
				<li key={session.id}>
					<div className="testtools-ab-cell">
						<strong>{session.name}</strong>
						<div className="testtools-ab-line testtools-ab-line--meta">
							<KeyValue label={t('Id')}>
								<code>{session.id}</code>
							</KeyValue>
							{session.lookaheadForPartId ? (
								<KeyValue label={t('Lookahead for Part')}>
									<code>{unprotectString(session.lookaheadForPartId)}</code>
								</KeyValue>
							) : null}
							{session.partInstanceIds?.length ? (
								<KeyValue label={t('PartInstances')}>
									<code>{session.partInstanceIds.map((id) => unprotectString(id)).join(', ')}</code>
								</KeyValue>
							) : null}
						</div>
					</div>
					<div className="testtools-ab-cell testtools-ab-cell--end">
						{session.isUniqueName ? <Tag>{t('globally unique')}</Tag> : null}
						{session.lookaheadForPartId ? <Tag>{t('lookahead')}</Tag> : null}
						{session.infiniteInstanceId ? (
							<Tag title={unprotectString(session.infiniteInstanceId)}>{t('infinite')}</Tag>
						) : null}
					</div>
				</li>
			))}
		</ul>
	)
}

type SessionStatus = 'kept' | 'moved' | 'new' | 'lookahead' | 'lookaheadUnassigned' | 'failed' | 'failedOptional'

const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
	kept: 'Kept player',
	moved: 'Moved player',
	new: 'New assignment',
	lookahead: 'Lookahead',
	lookaheadUnassigned: 'Lookahead (no player)',
	failed: '⚠ Failed',
	failedOptional: '⚠ Failed (optional)',
}

interface SessionRow {
	request: SessionRequest
	/** The request given to the resolver */
	input: SessionRequest | undefined
	previous: ABSessionAssignment | undefined
	status: SessionStatus
	pieces: AbPlaybackDebugPiece[]
	lookaheadObjectIds: string[]
}

function getSessionStatus(
	pool: AbPlaybackPoolDebugInfo,
	request: SessionRequest,
	previous: ABSessionAssignment | undefined
): SessionStatus {
	if (pool.result.failedRequired.some((f) => f.id === request.id)) return 'failed'
	if (pool.result.failedOptional.some((f) => f.id === request.id)) return 'failedOptional'
	if (request.lookaheadRank !== undefined) return request.playerId !== undefined ? 'lookahead' : 'lookaheadUnassigned'
	if (!previous) return 'new'
	return previous.playerId === request.playerId ? 'kept' : 'moved'
}

function useSessionRows(debug: AbPlaybackDebugInfo, poolName: string, pool: AbPlaybackPoolDebugInfo): SessionRow[] {
	return useMemo(() => {
		const previousAssignments: ABSessionAssignments = debug.previousAssignments[poolName] ?? {}

		return pool.result.requests.map((request) => {
			const previous = previousAssignments[request.id]
			return {
				request,
				input: pool.requests.find((r) => r.id === request.id),
				previous,
				status: getSessionStatus(pool, request, previous),
				pieces: pool.pieces.filter((p) => p.sessionId === request.id),
				lookaheadObjectIds: pool.lookaheadGroups.find((g) => g.sessionId === request.id)?.objectIds ?? [],
			}
		})
	}, [debug, poolName, pool])
}

interface PoolSessionsProps {
	debug: AbPlaybackDebugInfo
	poolName: string
	pool: AbPlaybackPoolDebugInfo
	selectedSessionId: string | null
	setSelectedSessionId: (id: string | null) => void
}

function AbPlaybackPoolSessions({
	debug,
	poolName,
	pool,
	selectedSessionId,
	setSelectedSessionId,
}: Readonly<PoolSessionsProps>) {
	const { t } = useTranslation()

	const sessionRows = useSessionRows(debug, poolName, pool)

	return (
		<div>
			<h2 className="my-3">{t('Sessions and players')}</h2>
			<AbPlayerLanes
				debug={debug}
				pool={pool}
				sessionRows={sessionRows}
				selectedSessionId={selectedSessionId}
				setSelectedSessionId={setSelectedSessionId}
			/>

			<h3 className="my-3">{t('Sessions')}</h3>
			<SessionsList
				now={debug.now}
				sessionRows={sessionRows}
				selectedSessionId={selectedSessionId}
				setSelectedSessionId={setSelectedSessionId}
			/>

			<h3 className="my-3">{t('Resolver decisions')}</h3>
			<DecisionLog
				decisions={pool.decisions}
				sessionRows={sessionRows}
				selectedSessionId={selectedSessionId}
				setSelectedSessionId={setSelectedSessionId}
			/>
		</div>
	)
}

/** Proportion of the track used for the time axis. The rest is used for lookahead sessions */
const TRACK_TIME_PORTION = 0.82
const TRACK_LOOKAHEAD_START = 0.86

interface LaneBar {
	row: SessionRow
	left: number
	width: number
	gapBeforeWidth: number
	openEnded: boolean
	subRow: number
}

interface Lane {
	key: string
	label: string
	disabled: boolean
	bars: LaneBar[]
	subRowCount: number
}

function chooseTickStep(span: number): number {
	const steps = [100, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000]
	return steps.find((step) => span / step <= 8) ?? 3600000
}

function AbPlayerLanes({
	debug,
	pool,
	sessionRows,
	selectedSessionId,
	setSelectedSessionId,
}: Readonly<{
	debug: AbPlaybackDebugInfo
	pool: AbPlaybackPoolDebugInfo
	sessionRows: SessionRow[]
	selectedSessionId: string | null
	setSelectedSessionId: (id: string | null) => void
}>) {
	const { t } = useTranslation()

	const now = debug.now
	const safeNow = now + debug.resolverOptions.nowWindow
	const idealGapBefore = debug.resolverOptions.idealGapBefore

	const { lanes, ticks, toPosition } = useMemo(() => {
		// Calculate the visible time range
		const times: number[] = [now, safeNow]
		for (const row of sessionRows) {
			if (row.request.start !== LOOKAHEAD_START) times.push(row.request.start - idealGapBefore)
			if (row.request.end !== undefined) times.push(row.request.end)
		}
		let rangeStart = Math.min(...times)
		let rangeEnd = Math.max(...times)
		const padding = Math.max((rangeEnd - rangeStart) * 0.05, 1000)
		rangeStart -= padding
		rangeEnd += padding

		const toPosition = (time: number) =>
			Math.max(0, Math.min(1, (time - rangeStart) / (rangeEnd - rangeStart))) * TRACK_TIME_PORTION

		// Build the lanes
		const lanes: Lane[] = pool.players.map((player) => ({
			key: String(player.playerId),
			label: String(player.playerId),
			disabled: !player.enabled,
			bars: [],
			subRowCount: 1,
		}))
		const unassignedLane: Lane = {
			key: '__unassigned',
			label: t('Unassigned'),
			disabled: false,
			bars: [],
			subRowCount: 1,
		}
		const getLane = (playerId: AbPlayerId | undefined): Lane => {
			if (playerId === undefined) return unassignedLane

			let lane = lanes.find((l) => l.key === String(playerId))
			if (!lane) {
				// This shouldn't happen, but make sure it is visible
				lane = { key: String(playerId), label: `${playerId} (?)`, disabled: false, bars: [], subRowCount: 1 }
				lanes.push(lane)
			}
			return lane
		}

		const sortedRows = [...sessionRows].sort((a, b) => a.request.start - b.request.start)
		for (const row of sortedRows) {
			const lane = getLane(row.request.playerId)

			if (row.request.lookaheadRank !== undefined) {
				const lookaheadCount = lane.bars.filter((b) => b.row.request.lookaheadRank !== undefined).length
				lane.bars.push({
					row,
					left: TRACK_LOOKAHEAD_START,
					width: 1 - TRACK_LOOKAHEAD_START,
					gapBeforeWidth: 0,
					openEnded: false,
					subRow: lookaheadCount,
				})
			} else {
				const left = toPosition(row.request.start)
				const right = row.request.end !== undefined ? toPosition(row.request.end) : TRACK_TIME_PORTION

				// Find the first sub-row which this fits in
				const timedBars = lane.bars.filter((b) => b.row.request.lookaheadRank === undefined)
				let subRow = 0
				while (
					timedBars.some(
						(b) => b.subRow === subRow && (b.row.request.end === undefined || b.row.request.end > row.request.start)
					)
				) {
					subRow++
				}

				lane.bars.push({
					row,
					left,
					width: Math.max(right - left, 0.002),
					gapBeforeWidth: left - toPosition(row.request.start - idealGapBefore),
					openEnded: row.request.end === undefined,
					subRow,
				})
			}

			lane.subRowCount = Math.max(lane.subRowCount, ...lane.bars.map((b) => b.subRow + 1))
		}
		lanes.push(unassignedLane)

		// Build the ticks
		const tickStep = chooseTickStep(rangeEnd - rangeStart)
		const ticks: number[] = []
		for (let tick = now + Math.ceil((rangeStart - now) / tickStep) * tickStep; tick <= rangeEnd; tick += tickStep) {
			ticks.push(tick)
		}

		return { lanes, ticks, toPosition }
	}, [sessionRows, pool, now, safeNow, idealGapBefore, t])

	const toPercent = (proportion: number) => `${proportion * 100}%`

	return (
		<div className="testtools-ab-lanes">
			<div className="testtools-ab-lanes__legend">
				{(['kept', 'moved', 'new', 'lookahead', 'failed', 'failedOptional'] as SessionStatus[]).map((status) => (
					<span key={status} className="testtools-ab-lanes__legend-item">
						<span className={`testtools-ab-lanes__swatch testtools-ab-status--${status}`} />
						{SESSION_STATUS_LABELS[status]}
					</span>
				))}
				<span className="testtools-ab-lanes__legend-item">
					<span className="testtools-ab-lanes__swatch testtools-ab-lanes__swatch--gap" />
					{t('Ideal gap before')}
				</span>
			</div>

			<div className="testtools-ab-lanes__row testtools-ab-lanes__row--axis">
				<div className="testtools-ab-lanes__label">{t('Player')}</div>
				<div className="testtools-ab-lanes__track">
					{ticks.map((tick) => (
						<span key={tick} className="testtools-ab-lanes__tick" style={{ left: toPercent(toPosition(tick)) }}>
							{formatRelativeTime(tick, now)}
						</span>
					))}
					<span
						className="testtools-ab-lanes__tick testtools-ab-lanes__tick--lookahead"
						style={{ left: toPercent(TRACK_LOOKAHEAD_START) }}
					>
						{t('Lookahead')}
					</span>
				</div>
			</div>

			{lanes.map((lane) => (
				<div
					key={lane.key}
					className={Classnames('testtools-ab-lanes__row', {
						'testtools-ab-lanes__row--disabled': lane.disabled,
					})}
				>
					<div className="testtools-ab-lanes__label">
						{lane.label}
						{lane.disabled ? <small> ({t('disabled')})</small> : null}
					</div>
					<div className="testtools-ab-lanes__track" style={{ height: `${lane.subRowCount * 30 + 4}px` }}>
						<span className="testtools-ab-lanes__marker" style={{ left: toPercent(toPosition(now)) }} />
						<span
							className="testtools-ab-lanes__marker testtools-ab-lanes__marker--safe"
							style={{ left: toPercent(toPosition(safeNow)) }}
						/>
						<span
							className="testtools-ab-lanes__divider"
							style={{ left: toPercent((TRACK_TIME_PORTION + TRACK_LOOKAHEAD_START) / 2) }}
						/>

						{lane.bars.map((bar) => (
							<Fragment key={bar.row.request.id}>
								{bar.gapBeforeWidth > 0 ? (
									<span
										className="testtools-ab-lanes__gap"
										style={{
											left: toPercent(bar.left - bar.gapBeforeWidth),
											width: toPercent(bar.gapBeforeWidth),
											top: `${bar.subRow * 30 + 2}px`,
										}}
									/>
								) : null}
								<button
									type="button"
									className={Classnames('testtools-ab-lanes__bar', `testtools-ab-status--${bar.row.status}`, {
										'testtools-ab-lanes__bar--open': bar.openEnded,
										'testtools-ab-lanes__bar--selected': bar.row.request.id === selectedSessionId,
									})}
									style={{
										left: toPercent(bar.left),
										width: toPercent(bar.width),
										top: `${bar.subRow * 30 + 2}px`,
									}}
									title={describeSessionRow(bar.row, now)}
									onClick={() =>
										setSelectedSessionId(bar.row.request.id === selectedSessionId ? null : bar.row.request.id)
									}
								>
									{bar.row.request.lookaheadRank !== undefined ? `#${bar.row.request.lookaheadRank} ` : ''}
									{bar.row.request.name}
								</button>
							</Fragment>
						))}
					</div>
				</div>
			))}

			<div className="testtools-ab-lanes__footnote">
				{t('Times are relative to the resolver now. The solid line is now, the dashed line is safeNow.')}
			</div>
		</div>
	)
}

function describeSessionRow(row: SessionRow, now: number): string {
	const lines = [
		`${row.request.name} (${row.request.id})`,
		`Status: ${SESSION_STATUS_LABELS[row.status]}`,
		`Player: ${row.request.playerId ?? '-'} (previous: ${row.previous?.playerId ?? '-'})`,
		`Start: ${formatRelativeTime(row.request.start, now)}, End: ${formatRelativeTime(row.request.end, now)}`,
	]
	if (row.request.optional) lines.push('Optional')
	if (row.request.lookaheadRank !== undefined) lines.push(`Lookahead rank: ${row.request.lookaheadRank}`)
	if (row.request.pieceNames.length) lines.push(`Pieces: ${row.request.pieceNames.join(', ')}`)
	return lines.join('\n')
}

function SessionsList({
	now,
	sessionRows,
	selectedSessionId,
	setSelectedSessionId,
}: Readonly<{
	now: number
	sessionRows: SessionRow[]
	selectedSessionId: string | null
	setSelectedSessionId: (id: string | null) => void
}>) {
	const { t } = useTranslation()

	if (sessionRows.length === 0) return <p>{t('No sessions')}</p>

	return (
		<ul className="testtools-ab-list testtools-ab-list--sessions">
			<ListHeader columns={[t('Status'), t('Session'), t('Time'), t('Player')]} />
			{sessionRows.map((row) => (
				<li
					key={row.request.id}
					className={Classnames({ 'testtools-ab-row--selected': row.request.id === selectedSessionId })}
				>
					<div className="testtools-ab-cell">
						<span className={`testtools-ab-badge testtools-ab-status--${row.status}`}>
							{SESSION_STATUS_LABELS[row.status]}
						</span>
					</div>
					<div className="testtools-ab-cell">
						<div className="testtools-ab-line">
							<strong>{row.request.name}</strong>
							{row.request.lookaheadRank !== undefined ? (
								<Tag>
									{t('lookahead')} #{row.request.lookaheadRank}
								</Tag>
							) : null}
							{row.request.optional ? <Tag>{t('optional')}</Tag> : null}
						</div>
						<div className="testtools-ab-line testtools-ab-line--meta">
							<KeyValue label={t('Session')}>
								<SessionIdLink
									sessionId={row.request.id}
									selectedSessionId={selectedSessionId}
									setSelectedSessionId={setSelectedSessionId}
								/>
							</KeyValue>
							{row.lookaheadObjectIds.length ? (
								<KeyValue label={t('Lookahead objects')}>
									<span title={row.lookaheadObjectIds.join('\n')}>{row.lookaheadObjectIds.length}</span>
								</KeyValue>
							) : null}
						</div>
					</div>
					<div className="testtools-ab-cell testtools-ab-cell--time">
						{row.request.lookaheadRank === undefined ? (
							<>
								<RelativeTime time={row.request.start} now={now} /> → <RelativeTime time={row.request.end} now={now} />
							</>
						) : (
							'-'
						)}
					</div>
					<div className="testtools-ab-cell testtools-ab-cell--end">
						{row.previous && row.previous.playerId !== row.request.playerId ? (
							<>
								<PlayerBadge playerId={row.previous.playerId} /> →{' '}
							</>
						) : null}
						<PlayerBadge playerId={row.request.playerId} />
					</div>

					{row.pieces.length ? (
						<ul className="testtools-ab-sublist testtools-ab-sublist--pieces">
							{row.pieces.map((piece) => (
								<li key={unprotectString(piece.pieceInstanceId)}>
									<div className="testtools-ab-cell">
										<span title={unprotectString(piece.pieceInstanceId)}>{piece.pieceName}</span>
										<div className="testtools-ab-line testtools-ab-line--meta">
											<KeyValue label={t('Layer')}>{piece.sourceLayerId}</KeyValue>
											<KeyValue label={t('PartInstance')}>
												<code title={unprotectString(piece.partInstanceId)}>
													{shortId(unprotectString(piece.partInstanceId))}
												</code>
											</KeyValue>
										</div>
									</div>
									<div className="testtools-ab-cell testtools-ab-cell--time">
										<RelativeTime time={piece.resolvedStart} now={now} /> →{' '}
										<RelativeTime time={piece.resolvedEnd} now={now} />
									</div>
									<div className="testtools-ab-cell testtools-ab-cell--end">
										{piece.optional ? <Tag>{t('optional')}</Tag> : null}
										<Tag title={t('How the session id was chosen')}>{piece.sessionReason}</Tag>
									</div>
								</li>
							))}
						</ul>
					) : null}
				</li>
			))}
		</ul>
	)
}

const DECISION_STEP_CLASSES: Partial<Record<AbResolverDecision['step'], string>> = {
	failed: 'testtools-ab-tag--critical',
	evicted: 'testtools-ab-tag--warning',
	clearedStale: 'testtools-ab-tag--warning',
	droppedUnknownPlayer: 'testtools-ab-tag--warning',
	lookaheadUnassigned: 'testtools-ab-tag--warning',
}

function DecisionLog({
	decisions,
	sessionRows,
	selectedSessionId,
	setSelectedSessionId,
}: Readonly<{
	decisions: AbResolverDecision[]
	sessionRows: SessionRow[]
	selectedSessionId: string | null
	setSelectedSessionId: (id: string | null) => void
}>) {
	const { t } = useTranslation()

	const sessionNames = useMemo(
		() => new Map(sessionRows.map((row) => [row.request.id, row.request.name])),
		[sessionRows]
	)

	const filteredDecisions = decisions
		.map((decision, index) => ({ decision, index }))
		.filter(
			({ decision }) =>
				!selectedSessionId || decision.sessionId === selectedSessionId || decision.causedBy === selectedSessionId
		)

	return (
		<div>
			{selectedSessionId ? (
				<p>
					{t('Showing decisions for session')} <code>{selectedSessionId}</code>{' '}
					<button type="button" className="btn btn-link btn-sm" onClick={() => setSelectedSessionId(null)}>
						{t('Show all')}
					</button>
				</p>
			) : null}
			{filteredDecisions.length === 0 ? (
				<p>{t('No decisions')}</p>
			) : (
				<ul className="testtools-ab-list testtools-ab-list--decisions">
					<ListHeader columns={['#', t('Step'), t('Session'), t('Player')]} />
					{filteredDecisions.map(({ decision, index }) => (
						<li key={index}>
							<div className="testtools-ab-cell testtools-ab-cell--index">{index + 1}</div>
							<div className="testtools-ab-cell">
								<Tag className={DECISION_STEP_CLASSES[decision.step]}>{decision.step}</Tag>
							</div>
							<div className="testtools-ab-cell">
								<div className="testtools-ab-line">
									{decision.sessionId ? (
										<strong>{sessionNames.get(decision.sessionId) ?? shortId(decision.sessionId)}</strong>
									) : null}
									{decision.rule ? <Tag title={t('Rule')}>{decision.rule}</Tag> : null}
								</div>
								<div className="testtools-ab-line testtools-ab-line--meta">
									<span>{decision.message}</span>
									{decision.causedBy ? (
										<KeyValue label={t('Caused by')}>
											{sessionNames.get(decision.causedBy)}{' '}
											<SessionIdLink
												sessionId={decision.causedBy}
												selectedSessionId={selectedSessionId}
												setSelectedSessionId={setSelectedSessionId}
											/>
										</KeyValue>
									) : null}
									{decision.sessionId ? (
										<KeyValue label={t('Session')}>
											<SessionIdLink
												sessionId={decision.sessionId}
												selectedSessionId={selectedSessionId}
												setSelectedSessionId={setSelectedSessionId}
											/>
										</KeyValue>
									) : null}
								</div>
							</div>
							<div className="testtools-ab-cell testtools-ab-cell--end">
								{decision.playerId !== undefined ? <PlayerBadge playerId={decision.playerId} /> : null}
							</div>

							{decision.availability ? (
								<details className="testtools-ab-details">
									<summary>{t('Player availability at this point')}</summary>
									<ul className="testtools-ab-sublist testtools-ab-sublist--availability">
										<ListHeader columns={[t('Player'), t('Ends before'), t('Clashes'), t('Starts after')]} />
										{decision.availability.map((slot) => (
											<li key={String(slot.playerId)}>
												<div className="testtools-ab-cell">
													<PlayerBadge playerId={slot.playerId} />
												</div>
												<div className="testtools-ab-cell">
													{slot.before ? (sessionNames.get(slot.before) ?? slot.before) : '-'}
												</div>
												<div className="testtools-ab-cell">
													{slot.clashes.length ? slot.clashes.map((id) => sessionNames.get(id) ?? id).join(', ') : '-'}
												</div>
												<div className="testtools-ab-cell">
													{slot.after ? (sessionNames.get(slot.after) ?? slot.after) : '-'}
												</div>
											</li>
										))}
									</ul>
								</details>
							) : null}
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

interface TimelineObjectRow {
	key: string
	objectId: string
	/** The object on the final timeline, if it exists */
	finalObject: TimelineObjGeneric | undefined
	/** The session as defined on the object */
	rawSession: TimelineObjectAbSessionInfo | undefined
	/** The details from the ab resolving */
	debugObject: AbPlaybackDebugObject | undefined
}

function hasAbKeyframes(obj: TimelineObjGeneric, poolName: string): boolean {
	return !!obj.keyframes?.some((kf) => kf.abSession?.poolName === poolName)
}

function AbPlaybackTimelineObjects({
	poolName,
	pool,
	timelineObjects,
	selectedSessionId,
	setSelectedSessionId,
}: Readonly<{
	poolName: string
	pool: AbPlaybackPoolDebugInfo
	timelineObjects: TimelineObjGeneric[]
	selectedSessionId: string | null
	setSelectedSessionId: (id: string | null) => void
}>) {
	const { t } = useTranslation()

	const [filter, setFilter] = useState<FilterInputValue>(undefined)
	const [onlySelected, setOnlySelected] = useState(false)

	const rows = useMemo(() => {
		const rows: TimelineObjectRow[] = []

		const finalObjects = new Map(timelineObjects.map((obj) => [obj.id, obj]))
		const debugObjectIds = new Set<string>()

		for (const debugObject of pool.objects) {
			debugObjectIds.add(debugObject.objectId)

			rows.push({
				key: `${debugObject.objectId}_${debugObject.sessionName}`,
				objectId: debugObject.objectId,
				finalObject: finalObjects.get(debugObject.objectId),
				rawSession: finalObjects
					.get(debugObject.objectId)
					?.abSessions?.find((s) => s.poolName === poolName && s.sessionName === debugObject.sessionName),
				debugObject,
			})
		}

		// Find any objects on the timeline which the ab resolver didn't see
		for (const obj of timelineObjects) {
			if (debugObjectIds.has(obj.id)) continue

			const sessions = obj.abSessions?.filter((s) => s.poolName === poolName) ?? []
			if (sessions.length) {
				for (const session of sessions) {
					rows.push({
						key: `${obj.id}_${session.sessionName}`,
						objectId: obj.id,
						finalObject: obj,
						rawSession: session,
						debugObject: undefined,
					})
				}
			} else if (hasAbKeyframes(obj, poolName)) {
				rows.push({
					key: obj.id,
					objectId: obj.id,
					finalObject: obj,
					rawSession: undefined,
					debugObject: undefined,
				})
			}
		}

		return rows.sort((a, b) => a.objectId.localeCompare(b.objectId))
	}, [timelineObjects, pool, poolName])

	const filteredRows = rows.filter((row) => {
		if (onlySelected && selectedSessionId && row.debugObject?.sessionId !== selectedSessionId) return false
		if (!filter) return true
		return (
			matchesFilter(row.objectId, filter) ||
			matchesFilter(String(row.finalObject?.layer ?? row.debugObject?.layerAfter ?? ''), filter)
		)
	})

	return (
		<div>
			<h2 className="my-3">{t('Timeline objects')}</h2>
			<Row className="mb-3">
				<Col xs={12} md={6}>
					{t('Filter (id or layer)')}: <FilterInput filterChanged={setFilter} />
				</Col>
				<Col xs={12} md={6} className="d-flex align-items-end">
					<Form.Check
						type="checkbox"
						id="testtools-ab-only-selected"
						label={t('Only show the selected session')}
						checked={onlySelected}
						onChange={(e) => setOnlySelected(e.target.checked)}
					/>
				</Col>
			</Row>

			{filteredRows.length === 0 ? (
				<p>{t('No timeline objects with AB sessions for this pool')}</p>
			) : (
				<ul className="testtools-ab-list testtools-ab-list--objects">
					<ListHeader columns={[t('Outcome'), t('Timeline object'), t('Player')]} />
					{filteredRows.map((row) => (
						<TimelineObjectListItem
							key={row.key}
							row={row}
							poolName={poolName}
							selectedSessionId={selectedSessionId}
							setSelectedSessionId={setSelectedSessionId}
						/>
					))}
				</ul>
			)}
		</div>
	)
}

const OBJECT_OUTCOMES: Record<AbPlaybackDebugObject['outcome'], { label: string; description: string }> = {
	applied: { label: 'Applied', description: 'The object was updated to the assigned player' },
	failed: { label: '⚠ Not changed', description: 'No layer rule, keyframe or customApplyToObject changed the object' },
	noPlayer: { label: '⚠ No player', description: 'The session was not assigned a player' },
	unexpected: {
		label: '⚠ Unknown session',
		description: 'The session was not known to the resolver, so the previous assignment was reused (if any)',
	},
	noSession: { label: '⚠ No session', description: 'No session could be determined for the object' },
	noPieceInstance: { label: 'Ignored', description: 'The object has no pieceInstanceId, so is ignored' },
}

function TimelineObjectListItem({
	row,
	poolName,
	selectedSessionId,
	setSelectedSessionId,
}: Readonly<{
	row: TimelineObjectRow
	poolName: string
	selectedSessionId: string | null
	setSelectedSessionId: (id: string | null) => void
}>) {
	const { t } = useTranslation()

	const { finalObject, debugObject, rawSession } = row

	const abKeyframes = finalObject?.keyframes?.filter((kf) => kf.abSession?.poolName === poolName) ?? []
	const finalLayer = finalObject ? String(finalObject.layer) : undefined

	const outcomes: Array<{ label: string; description: string; className: string }> = []
	if (debugObject) {
		outcomes.push({
			...OBJECT_OUTCOMES[debugObject.outcome],
			className:
				debugObject.outcome === 'applied'
					? 'testtools-ab-tag--good'
					: debugObject.outcome === 'noPieceInstance'
						? ''
						: 'testtools-ab-tag--warning',
		})
	} else {
		outcomes.push({
			label: t('⚠ Not seen by AB'),
			description: t('The AB resolver did not see this object, it was probably added by onTimelineGenerate'),
			className: 'testtools-ab-tag--warning',
		})
	}
	if (!finalObject) {
		outcomes.push({
			label: t('⚠ Removed'),
			description: t('The object is not on the final timeline, it was probably removed by onTimelineGenerate'),
			className: 'testtools-ab-tag--warning',
		})
	}

	const sessionName = rawSession?.sessionName ?? debugObject?.sessionName
	const isGloballyUnique = rawSession?.sessionNameIsGloballyUnique ?? debugObject?.sessionNameIsGloballyUnique
	const isLookahead = debugObject?.isLookahead ?? finalObject?.isLookahead

	return (
		<li
			className={Classnames({
				'testtools-ab-row--selected': !!debugObject?.sessionId && debugObject.sessionId === selectedSessionId,
			})}
		>
			<div className="testtools-ab-cell testtools-ab-cell--stack">
				{outcomes.map((outcome) => (
					<Tag key={outcome.label} className={outcome.className} title={outcome.description}>
						{outcome.label}
					</Tag>
				))}
			</div>
			<div className="testtools-ab-cell">
				<div className="testtools-ab-line">
					<code className="testtools-ab-object-id">{row.objectId}</code>
					{isLookahead ? <Tag>{t('lookahead')}</Tag> : null}
				</div>
				<div className="testtools-ab-line testtools-ab-line--meta">
					<KeyValue label={t('Layer')}>
						{debugObject && debugObject.layerBefore !== debugObject.layerAfter ? (
							<>
								{debugObject.layerBefore} → <strong>{debugObject.layerAfter}</strong>
							</>
						) : (
							(debugObject?.layerBefore ?? finalLayer ?? '-')
						)}
						{finalLayer !== undefined && debugObject && finalLayer !== debugObject.layerAfter ? (
							<>
								{' '}
								→ {finalLayer} <small>({t('final')})</small>
							</>
						) : null}
					</KeyValue>
					<KeyValue label={t('Session')}>
						{sessionName ?? '-'}
						{debugObject?.sessionId ? (
							<>
								{' → '}
								<SessionIdLink
									sessionId={debugObject.sessionId}
									selectedSessionId={selectedSessionId}
									setSelectedSessionId={setSelectedSessionId}
								/>
							</>
						) : null}
					</KeyValue>
					{isGloballyUnique ? <Tag>{t('globally unique')}</Tag> : null}
					{debugObject?.sessionReason ? (
						<Tag title={t('How the session id was chosen')}>{debugObject.sessionReason}</Tag>
					) : null}
					{abKeyframes.length ? (
						<KeyValue label={t('Keyframes')}>
							{abKeyframes
								.map((kf) => `${kf.id} (${kf.abSession?.playerId}${kf.disabled ? ', disabled' : ''})`)
								.join(', ')}
						</KeyValue>
					) : null}
				</div>
			</div>
			<div className="testtools-ab-cell testtools-ab-cell--end">
				{debugObject ? <PlayerBadge playerId={debugObject.playerId} /> : null}
			</div>
		</li>
	)
}
