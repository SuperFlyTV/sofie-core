import { t } from 'i18next'

/**
 * Base interface for properties needed to render clip player elements
 */
interface WithClipPlayerString {
	/**
	 * The clip player identifier.
	 *
	 * If the value is a single alphanumeric character (`A-Z`, `0-9`),
	 * a channel icon is rendered. Otherwise, a server label is displayed.
	 */
	clipPlayer: string
}

/**
 * Props for {@link ClipPlayerIcon}. Extends <span> element props
 */
type ClipPlayerIconProps = React.HTMLAttributes<HTMLSpanElement> & WithClipPlayerString

/**
 * Renders either a channel icon or a server label for a clip player.
 *
 * Single-character player identifiers are treated as channel IDs and rendered
 * using {@link ChannelIcon}. All other values are rendered as a localized
 * server name via {@link getClipPlayerServerUIString}.
 *
 * @param props HTML <span> attributes with extra properties.
 * @param props.clipPlayer The channel identifier.
 * @returns A span containing the channel icon or server label.
 */
export function ClipPlayerIcon({ clipPlayer, ...spanProps }: ClipPlayerIconProps) {
	// Check if it's a single alphanumeric character (0-9, A-Z) then we can use the pre-made icons.
	const isIcon: boolean = /^[A-Z0-9]$/.test(clipPlayer.toUpperCase())

	return (
		<span {...spanProps} className={`director-screen__body__part__player ${spanProps.className ?? ''}`}>
			{isIcon ? <ChannelIcon clipPlayer={clipPlayer} /> : getClipPlayerServerUIString(clipPlayer)}
		</span>
	)
}

/**
 * Props for {@link ChannelIcon}. Extends <img> element props.
 */
type ChannelIconProps = React.HTMLAttributes<HTMLImageElement> & WithClipPlayerString

/**
 * Renders a channel icon image for a clip player.
 *
 * The icon is loaded from `/icons/channels/{ID}.svg`, where `ID`
 * is the uppercased value of `clipPlayer`.
 *
 * @param props Component props.------------------------------------------------------------------------------------
 *  * @param props HTML <span> attributes with extra properties.
 * @param props.clipPlayer The channel identifier.
 * @returns An image element displaying the channel icon.
 */
export function ChannelIcon({ clipPlayer, ...imgProps }: ChannelIconProps) {
	const channelId = String(clipPlayer).toUpperCase()

	return (
		<img
			{...imgProps}
			className={`player-icon ${imgProps.className ?? ''}`}
			src={`/icons/channels/${channelId}.svg`}
			alt={t('Server {{id}}', { id: clipPlayer })}
		/>
	)
}

/**
 * Returns a localized UI label for a clip player server.
 *
 * @param clipPlayerName The server identifier or name.
 * @returns A localized string in the format `Server {name}`.
 */
export function getClipPlayerServerUIString(clipPlayerName: string) {
	return `${t('Server')} ${clipPlayerName}`
}
